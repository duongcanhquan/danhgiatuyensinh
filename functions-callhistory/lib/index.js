/**
 * Codebase tách riêng — không dùng defineSecret OMICall.
 * Deploy: firebase deploy --only functions:callhistory:fetchOmicallCallsForClient
 */
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { setGlobalOptions } from 'firebase-functions/v2';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
const app = initializeApp();
setGlobalOptions({ region: 'asia-southeast1', maxInstances: 10 });
const FIRESTORE_DATABASE_ID = process.env.FIRESTORE_DATABASE_ID || 'warmlist';
const db = getFirestore(app, FIRESTORE_DATABASE_ID);
const COLLECTIONS = {
    users: 'users',
    leads: 'leads',
    interactions: 'interactions',
    omicallCalls: 'omicallCalls',
};
function str(v) {
    return String(v ?? '').trim();
}
function num(v) {
    const n = Number(v ?? 0);
    return Number.isFinite(n) ? n : 0;
}
function isAdminLikeRole(role) {
    return role === 'admin' || role === 'super_admin';
}
async function loadStaffUser(uid) {
    const snap = await db.collection(COLLECTIONS.users).doc(uid).get();
    if (!snap.exists)
        return null;
    const d = snap.data() ?? {};
    return {
        id: uid,
        role: str(d.role) || 'counselor',
        isActive: d.isActive !== false,
        managedCounselorIds: Array.isArray(d.managedCounselorIds)
            ? d.managedCounselorIds.map((x) => String(x))
            : [],
    };
}
function tsMs(ts) {
    if (!ts)
        return undefined;
    try {
        return ts.toMillis();
    }
    catch {
        return undefined;
    }
}
function toCallWireFromOmicallDoc(id, data) {
    return {
        id,
        transactionId: str(data.transactionId) || id,
        direction: str(data.direction) || 'outbound',
        phoneNumber: str(data.phoneNumber),
        displayNumber: str(data.displayNumber) || undefined,
        hotline: str(data.hotline) || undefined,
        sipUser: str(data.sipUser) || undefined,
        leadId: str(data.leadId) || undefined,
        counselorUid: str(data.counselorUid) || undefined,
        teamLeadUid: str(data.teamLeadUid) || undefined,
        answerSeconds: num(data.answerSeconds),
        billSeconds: num(data.billSeconds),
        durationSeconds: num(data.durationSeconds),
        recordSeconds: num(data.recordSeconds),
        recordingFileUrl: str(data.recordingFileUrl) || undefined,
        outcome: str(data.outcome) === 'CONNECTED'
            ? 'CONNECTED'
            : str(data.outcome) === 'NO_ANSWER'
                ? 'NO_ANSWER'
                : 'OTHER',
        state: str(data.state) || undefined,
        isFinal: data.isFinal === true,
        callNote: str(data.callNote) || undefined,
        createdAtMs: tsMs(data.createdAt),
        startedAtMs: tsMs(data.startedAt),
        endedAtMs: tsMs(data.endedAt),
    };
}
function inferDirectionFromInteractionNote(note) {
    const n = note.toLowerCase();
    if (n.includes('gọi vào'))
        return 'inbound';
    return 'outbound';
}
function toCallWireFromInteractionDoc(id, data) {
    if (str(data.provider).toUpperCase() !== 'OMICALL')
        return null;
    const ts = data.timestamp;
    if (!ts)
        return null;
    const note = str(data.counselorNote);
    const answerSeconds = num(data.answerSeconds) || num(data.durationSeconds);
    const billSeconds = num(data.billSeconds) || num(data.durationSeconds);
    const callOutcome = str(data.callOutcome).toUpperCase();
    const outcome = callOutcome === 'CONNECTED' ? 'CONNECTED' : callOutcome === 'NO_ANSWER' ? 'NO_ANSWER' : 'OTHER';
    return {
        id: `int-${id}`,
        transactionId: str(data.providerCallId) || id,
        direction: inferDirectionFromInteractionNote(note),
        phoneNumber: str(data.phone),
        displayNumber: str(data.displayNumber) || undefined,
        hotline: str(data.hotline) || undefined,
        sipUser: str(data.sipUser) || undefined,
        leadId: str(data.leadId) || undefined,
        counselorUid: str(data.authorUid) || undefined,
        teamLeadUid: undefined,
        answerSeconds,
        billSeconds,
        durationSeconds: Math.max(answerSeconds, billSeconds),
        recordSeconds: num(data.recordSeconds),
        recordingFileUrl: str(data.recordingUrl) || undefined,
        outcome,
        state: 'ended',
        isFinal: true,
        callNote: note || undefined,
        createdAtMs: tsMs(ts),
        startedAtMs: tsMs(ts),
        endedAtMs: tsMs(ts),
    };
}
function scopeAllowsWireCall(call, caller, teamSet, requestedScope) {
    if (isAdminLikeRole(caller.role)) {
        if (requestedScope.mode === 'counselor')
            return call.counselorUid === requestedScope.counselorUid;
        if (requestedScope.mode === 'team' && requestedScope.teamLeadUid) {
            return call.teamLeadUid === requestedScope.teamLeadUid;
        }
        return true;
    }
    if (caller.role === 'team_lead') {
        if (requestedScope.mode === 'global')
            return false;
        if (requestedScope.mode === 'team' && requestedScope.teamLeadUid && requestedScope.teamLeadUid !== caller.id) {
            return false;
        }
        const uid = call.counselorUid || '';
        if (requestedScope.mode === 'counselor')
            return uid === requestedScope.counselorUid && teamSet.has(uid);
        return teamSet.has(uid) || call.teamLeadUid === caller.id;
    }
    return call.counselorUid === caller.id;
}
function isIndexError(err) {
    const msg = err instanceof Error ? err.message : String(err);
    return /index|FAILED_PRECONDITION/i.test(msg);
}
async function queryOmicallByDateField(field, fromTs, toTs, limit, counselorUid) {
    let q = db.collection(COLLECTIONS.omicallCalls);
    if (counselorUid)
        q = q.where('counselorUid', '==', counselorUid);
    const snap = await q
        .where(field, '>=', fromTs)
        .where(field, '<=', toTs)
        .limit(limit)
        .get();
    return snap.docs.map((d) => toCallWireFromOmicallDoc(d.id, d.data()));
}
async function fetchOmicallCallsRows(fromTs, toTs, fetchCap, counselorUids) {
    const merged = new Map();
    const tryCounselors = counselorUids.length > 0 ? counselorUids.slice(0, 12) : [undefined];
    for (const uid of tryCounselors) {
        for (const field of ['endedAt', 'startedAt']) {
            try {
                const batch = await queryOmicallByDateField(field, fromTs, toTs, fetchCap, uid);
                for (const row of batch)
                    merged.set(row.id, row);
                if (merged.size >= fetchCap)
                    break;
            }
            catch (e) {
                if (!isIndexError(e))
                    console.warn(`[fetchOmicallCalls] omicallCalls.${field}`, e);
            }
        }
        if (merged.size >= fetchCap)
            break;
    }
    if (merged.size > 0) {
        return { rows: [...merged.values()], source: 'omicallCalls' };
    }
    const interactionRows = await fetchInteractionsFallback(fromTs, toTs, fetchCap, counselorUids);
    return { rows: interactionRows, source: 'interactions_fallback' };
}
async function fetchInteractionsForLead(leadId, fromTs, toTs, perLeadCap) {
    const snap = await db
        .collection(COLLECTIONS.leads)
        .doc(leadId)
        .collection(COLLECTIONS.interactions)
        .where('provider', '==', 'OMICALL')
        .where('timestamp', '>=', fromTs)
        .where('timestamp', '<=', toTs)
        .limit(perLeadCap)
        .get();
    const rows = [];
    for (const d of snap.docs) {
        const wire = toCallWireFromInteractionDoc(d.id, d.data());
        if (!wire)
            continue;
        rows.push({ ...wire, leadId });
    }
    return rows;
}
async function fetchInteractionsViaLeads(fromTs, toTs, cap, counselorUids) {
    const merged = new Map();
    const targets = [...new Set(counselorUids.filter(Boolean))].slice(0, 15);
    if (targets.length === 0)
        return [];
    for (const counselorUid of targets) {
        if (merged.size >= cap)
            break;
        let leadsSnap = await db
            .collection(COLLECTIONS.leads)
            .where('assignedCounselorId', '==', counselorUid)
            .limit(120)
            .get();
        if (leadsSnap.empty) {
            leadsSnap = await db
                .collection(COLLECTIONS.leads)
                .where('assignedTo', '==', counselorUid)
                .limit(120)
                .get();
        }
        for (const leadDoc of leadsSnap.docs) {
            if (merged.size >= cap)
                break;
            try {
                const batch = await fetchInteractionsForLead(leadDoc.id, fromTs, toTs, 40);
                for (const row of batch)
                    merged.set(row.id, row);
            }
            catch (e) {
                console.warn('[fetchOmicallCalls] lead interactions', leadDoc.id, e);
            }
        }
    }
    return [...merged.values()];
}
async function fetchInteractionsCollectionGroup(fromTs, toTs, cap, withProvider) {
    let q = db.collectionGroup(COLLECTIONS.interactions);
    if (withProvider)
        q = q.where('provider', '==', 'OMICALL');
    const snap = await q
        .where('timestamp', '>=', fromTs)
        .where('timestamp', '<=', toTs)
        .limit(cap)
        .get();
    return snap.docs
        .map((d) => {
        const wire = toCallWireFromInteractionDoc(d.id, d.data());
        if (!wire)
            return null;
        const leadId = d.ref.parent.parent?.id;
        return leadId ? { ...wire, leadId: wire.leadId || leadId } : wire;
    })
        .filter((v) => Boolean(v));
}
async function fetchInteractionsFallback(fromTs, toTs, cap, counselorUids) {
    for (const withProvider of [true, false]) {
        try {
            const rows = await fetchInteractionsCollectionGroup(fromTs, toTs, cap, withProvider);
            if (rows.length > 0)
                return rows;
        }
        catch (e) {
            console.warn('[fetchOmicallCalls] collectionGroup interactions', e);
        }
    }
    if (counselorUids.length > 0) {
        try {
            const viaLeads = await fetchInteractionsViaLeads(fromTs, toTs, cap, counselorUids);
            if (viaLeads.length > 0)
                return viaLeads;
        }
        catch (e) {
            console.warn('[fetchOmicallCalls] interactions via leads', e);
        }
    }
    return [];
}
function counselorUidsForScope(caller, teamSet, requestedScope) {
    if (requestedScope.mode === 'counselor' && requestedScope.counselorUid) {
        return [requestedScope.counselorUid];
    }
    if (requestedScope.mode === 'team') {
        return [...teamSet];
    }
    if (caller.role === 'counselor')
        return [caller.id];
    return [];
}
/** Đọc cuộc gọi qua Admin SDK — không cần Secret Manager / OMICall API key. */
export const fetchOmicallCallsForClient = onCall(async (request) => {
    if (!request.auth?.uid)
        throw new HttpsError('unauthenticated', 'Cần đăng nhập.');
    const caller = await loadStaffUser(request.auth.uid);
    if (!caller || !caller.isActive)
        throw new HttpsError('permission-denied', 'Không có quyền truy cập.');
    const fromMs = Math.max(0, Math.round(num(request.data?.fromMs)));
    const toMs = Math.max(fromMs, Math.round(num(request.data?.toMs)));
    const maxRows = Math.min(Math.max(Math.round(num(request.data?.maxRows) || 500), 50), 4000);
    const rawScope = (request.data?.scope ?? {});
    const requestedScope = str(rawScope.mode) === 'counselor'
        ? { mode: 'counselor', counselorUid: str(rawScope.counselorUid) || undefined }
        : str(rawScope.mode) === 'team'
            ? { mode: 'team', teamLeadUid: str(rawScope.teamLeadUid) || undefined }
            : { mode: 'global' };
    const teamSet = new Set(caller.managedCounselorIds);
    if (caller.role === 'team_lead')
        teamSet.add(caller.id);
    const fromTs = Timestamp.fromMillis(fromMs);
    const toTs = Timestamp.fromMillis(toMs);
    const fetchCap = Math.min(Math.max(maxRows * 3, 1200), 6000);
    const counselorUids = counselorUidsForScope(caller, teamSet, requestedScope);
    const { rows, source } = await fetchOmicallCallsRows(fromTs, toTs, fetchCap, counselorUids);
    const scoped = rows
        .filter((c) => scopeAllowsWireCall(c, caller, teamSet, requestedScope))
        .sort((a, b) => (b.endedAtMs || b.startedAtMs || b.createdAtMs || 0) -
        (a.endedAtMs || a.startedAtMs || a.createdAtMs || 0))
        .slice(0, maxRows);
    return {
        ok: true,
        source,
        calls: scoped,
        warning: scoped.length === 0 && rows.length === 0 ? 'Chưa có cuộc gọi OMICall trong kỳ đã chọn.' : undefined,
    };
});
