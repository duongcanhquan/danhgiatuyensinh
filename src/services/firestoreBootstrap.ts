import { ref, set } from 'firebase/database'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  runTransaction,
  setDoc,
  Timestamp,
  type Firestore,
} from 'firebase/firestore'
import type { MasterDataEntry } from '../types'
import {
  DEFAULT_MASTER_CATALOGS,
  FS_COLLECTIONS,
  MASTER_DATA_DEFAULT_IDS,
  MASTER_DATA_REGISTRY_DOC_ID,
} from '../types'
import { processMasterDataDocs } from '../utils/masterDataRegistry'
import { getRealtimeDb } from './firebase'

const SEED_MARKER = { collection: 'meta', docId: 'firestoreSeed' } as const

function now(): Timestamp {
  return Timestamp.now()
}

function defaultRegions(): MasterDataEntry[] {
  return [
    { id: 'hn', label: 'Hà Nội' },
    { id: 'hcm', label: 'TP. Hồ Chí Minh' },
    { id: 'dn', label: 'Đà Nẵng' },
    { id: 'ct', label: 'Cần Thơ' },
    { id: 'hg', label: 'Hà Giang' },
    { id: 'cb', label: 'Cao Bằng', synonyms: ['Cao Bang', 'cao bang'] },
    { id: 'lc-lc', label: 'Lào Cai', synonyms: ['Lao Cai', 'lao cai'] },
    { id: 'ls', label: 'Lạng Sơn', synonyms: ['Lang Son'] },
    { id: 'bk', label: 'Bắc Kạn', synonyms: ['Bac Kan', 'bac kan'] },
    { id: 'tq', label: 'Tuyên Quang', synonyms: ['Tuyen Quang'] },
    { id: 'tn', label: 'Thái Nguyên', synonyms: ['Thai Nguyen'] },
    { id: 'pt', label: 'Phú Thọ', synonyms: ['Phu Tho'] },
    { id: 'yb', label: 'Yên Bái', synonyms: ['Yen Bai'] },
    { id: 'sl', label: 'Sơn La', synonyms: ['Son La'] },
    { id: 'db', label: 'Điện Biên', synonyms: ['Dien Bien', 'dien bien', 'Dienbien'] },
    { id: 'lch', label: 'Lai Châu', synonyms: ['Lai Chau'] },
    { id: 'hb', label: 'Hòa Bình', synonyms: ['Hoa Binh'] },
    { id: 'other', label: 'Khác / Ngoại tỉnh' },
  ]
}

/** Quận / huyện Hà Nội — bổ sung thêm trong Cấu hình dữ liệu. */
function defaultHanoiAreas(): MasterDataEntry[] {
  return [
    { id: 'ba-dinh', label: 'Ba Đình' },
    { id: 'hoan-kiem', label: 'Hoàn Kiếm' },
    { id: 'dong-da', label: 'Đống Đa' },
    { id: 'hai-ba-trung', label: 'Hai Bà Trưng' },
    { id: 'hoang-mai', label: 'Hoàng Mai' },
    { id: 'thanh-xuan', label: 'Thanh Xuân' },
    { id: 'cau-giay', label: 'Cầu Giấy' },
    { id: 'nam-tu-liem', label: 'Nam Từ Liêm' },
    { id: 'bac-tu-liem', label: 'Bắc Từ Liêm' },
    { id: 'long-bien', label: 'Long Biên' },
    { id: 'gia-lam', label: 'Gia Lâm' },
    { id: 'ha-dong', label: 'Hà Đông' },
    { id: 'son-tay', label: 'Sơn Tây' },
    { id: 'thanh-tri', label: 'Thanh Trì' },
    { id: 'khac-hn', label: 'Khác / Ngoại thành Hà Nội' },
  ]
}

function defaultAcademicPerformance(): MasterDataEntry[] {
  return [
    { id: 'xuat-sac', label: 'Xuất sắc' },
    { id: 'gioi', label: 'Giỏi' },
    { id: 'kha', label: 'Khá' },
    { id: 'tb', label: 'Trung bình' },
    { id: 'yeu', label: 'Yếu' },
  ]
}

function defaultStudyIntentions(): MasterDataEntry[] {
  return [
    { id: 'dh', label: 'Đại học' },
    { id: 'cd', label: 'Cao đẳng' },
    { id: 'tc', label: 'Trung cấp' },
    { id: 'ptcd', label: 'Phổ thông cao đẳng' },
    { id: 'abroad', label: 'Du học' },
    { id: 'lien-thong', label: 'Liên thông' },
    { id: 'undecided', label: 'Chưa xác định' },
  ]
}

function defaultHighSchools(): MasterDataEntry[] {
  return [{ id: 'sample-thpt', label: 'THPT (ví dụ — chỉnh trong Cài đặt)' }]
}

function defaultMajors(): MasterDataEntry[] {
  return [
    { id: 'dd', label: 'Điều dưỡng' },
    { id: 'cntt', label: 'Công nghệ thông tin' },
    { id: 'qtdl', label: 'Quản trị du lịch & lữ hành' },
    { id: 'tkdh', label: 'Thiết kế đồ họa' },
    {
      id: 'ngoai-nganh',
      label: 'Ngoài ngành đào tạo / chưa xác định ngành',
      synonyms: ['Ngoài ngành', 'chưa biết ngành', 'chua biet nganh', 'Chưa xác định'],
    },
  ]
}

function defaultSchoolTypes(): MasterDataEntry[] {
  return [
    { id: 'public', label: 'Công lập' },
    { id: 'private', label: 'Tư thục' },
    { id: 'intl', label: 'Quốc tế' },
    {
      id: 'lien-ket',
      label: 'Liên kết / hợp tác',
      synonyms: ['Lien ket', 'lien ket', 'hop tac', 'Hợp tác', 'ket hop'],
    },
  ]
}

function defaultFinancial(): MasterDataEntry[] {
  return [
    { id: 'full', label: 'Đóng đủ' },
    { id: 'installment', label: 'Trả góp' },
    { id: 'scholarship', label: 'Tìm học bổng' },
  ]
}

function entriesForKind(kind: string): MasterDataEntry[] {
  switch (kind) {
    case 'regions':
      return defaultRegions()
    case 'hanoi_areas':
      return defaultHanoiAreas()
    case 'high_schools':
      return defaultHighSchools()
    case 'majors':
      return defaultMajors()
    case 'school_types':
      return defaultSchoolTypes()
    case 'financial_profiles':
      return defaultFinancial()
    case 'academic_performance':
      return defaultAcademicPerformance()
    case 'study_intentions':
      return defaultStudyIntentions()
    default:
      return []
  }
}

/**
 * Ghi dữ liệu mẫu + marker một lần (transaction) khi Firestore còn trống.
 * Chỉ gọi sau khi user đã đăng nhập và có role admin (ví dụ super admin).
 * Cần Firestore Rules cho phép admin ghi các collection này.
 */
export async function ensureDefaultFirestoreData(db: Firestore, actorUid: string): Promise<void> {
  const markerRef = doc(db, SEED_MARKER.collection, SEED_MARKER.docId)
  const t = now()

  const didSeed = await runTransaction(db, async (transaction) => {
    const markerSnap = await transaction.get(markerRef)
    if (markerSnap.exists()) return false

    transaction.set(markerRef, {
      version: 1,
      seededAt: t,
      seededByUid: actorUid,
      note: 'VietMy Admissions OS — seed mặc định; chỉnh trong Cài đặt sau.',
    })

    transaction.set(doc(db, FS_COLLECTIONS.masterData, MASTER_DATA_REGISTRY_DOC_ID), {
      catalogs: DEFAULT_MASTER_CATALOGS.map((c) => ({ ...c })),
      updatedAt: t,
    })

    for (const c of DEFAULT_MASTER_CATALOGS) {
      const ref = doc(db, FS_COLLECTIONS.masterData, c.id)
      transaction.set(ref, {
        id: c.id,
        entries: entriesForKind(c.id),
        updatedAt: t,
      })
    }

    const scoringProfileRef = doc(db, FS_COLLECTIONS.scoringProfiles, 'default-seed-v1')
    transaction.set(scoringProfileRef, {
      profileName: 'Mặc định (seed)',
      description: 'Tạo tự động lần đầu — chỉnh trong Cấu hình dữ liệu.',
      rules: [],
      ruleBlocks: [
        {
          id: 'seed-block-region',
          category: 'demographics',
          label: 'Vùng ưu tiên (thành phố lớn + tỉnh miền núi phía Bắc)',
          targetField: 'region',
          maxWeight: 25,
          rows: [
            {
              id: 'seed-row-region-cities',
              condition: 'IN_LIST',
              value: ['Hà Nội', 'TP. Hồ Chí Minh', 'Đà Nẵng', 'Cần Thơ'],
              allocationKind: 'absolute',
              allocationValue: 20,
            },
            {
              id: 'seed-row-region-north-mountain',
              condition: 'IN_LIST',
              value: [
                'Hà Giang',
                'Cao Bằng',
                'Lào Cai',
                'Lạng Sơn',
                'Bắc Kạn',
                'Tuyên Quang',
                'Thái Nguyên',
                'Phú Thọ',
                'Yên Bái',
                'Sơn La',
                'Điện Biên',
                'Lai Châu',
                'Hòa Bình',
              ],
              allocationKind: 'absolute',
              allocationValue: 18,
            },
          ],
        },
        {
          id: 'seed-block-major-align',
          category: 'academic',
          label: 'Ngành quan tâm vs danh mục đào tạo',
          targetField: 'majorTrainingAlignment',
          maxWeight: 25,
          rows: [
            {
              id: 'seed-row-major-aligned',
              condition: 'EQUALS',
              value: 'aligned',
              allocationKind: 'absolute',
              allocationValue: 12,
            },
            {
              id: 'seed-row-major-outside',
              condition: 'EQUALS',
              value: 'outside_or_unknown',
              allocationKind: 'absolute',
              allocationValue: -15,
            },
          ],
        },
        {
          id: 'seed-block-academic',
          category: 'academic',
          label: 'Học lực (thang điểm theo xếp loại)',
          targetField: 'academicLevel',
          maxWeight: 80,
          rows: [
            {
              id: 'seed-row-xs',
              condition: 'EQUALS',
              value: 'Xuất sắc',
              allocationKind: 'absolute',
              allocationValue: 85,
            },
            {
              id: 'seed-row-gioi',
              condition: 'EQUALS',
              value: 'Giỏi',
              allocationKind: 'absolute',
              allocationValue: 70,
            },
            {
              id: 'seed-row-kha',
              condition: 'EQUALS',
              value: 'Khá',
              allocationKind: 'absolute',
              allocationValue: 45,
            },
            {
              id: 'seed-row-tb',
              condition: 'EQUALS',
              value: 'Trung bình',
              allocationKind: 'absolute',
              allocationValue: 20,
            },
            {
              id: 'seed-row-yeu',
              condition: 'EQUALS',
              value: 'Yếu',
              allocationKind: 'absolute',
              allocationValue: -10,
            },
          ],
        },
        {
          id: 'seed-block-school-type',
          category: 'academic',
          label: 'Loại hình THPT (mã chuẩn hoá)',
          targetField: 'schoolTypeKey',
          maxWeight: 20,
          rows: [
            {
              id: 'seed-row-lien-ket',
              condition: 'EQUALS',
              value: 'LIEN_KET',
              allocationKind: 'absolute',
              allocationValue: 18,
            },
            {
              id: 'seed-row-intl',
              condition: 'EQUALS',
              value: 'INTERNATIONAL',
              allocationKind: 'absolute',
              allocationValue: 15,
            },
            {
              id: 'seed-row-private',
              condition: 'EQUALS',
              value: 'PRIVATE',
              allocationKind: 'percent_of_max',
              allocationValue: 70,
            },
            {
              id: 'seed-row-public',
              condition: 'EQUALS',
              value: 'PUBLIC',
              allocationKind: 'absolute',
              allocationValue: 8,
            },
            {
              id: 'seed-row-unknown-school',
              condition: 'EQUALS',
              value: 'UNKNOWN',
              allocationKind: 'absolute',
              allocationValue: -5,
            },
          ],
        },
      ],
      thresholds: { hotMinScore: 80, warmMinScore: 50 },
      isDefaultForImport: true,
      createdAt: t,
      updatedAt: t,
    })

    const pbRef = doc(db, FS_COLLECTIONS.consultingPlaybooks, 'seed-chao-mung')
    transaction.set(pbRef, {
      title: 'Chào mừng & giới thiệu nhanh',
      isActive: true,
      priority: 10,
      triggerConditions: [{ field: 'priorityTag', operator: 'EQUALS', value: 'HOT' }],
      strategy:
        'Lead HOT: gọi trong 15 phút, xác nhận ngành quan tâm, mời tham quan campus hoặc gửi brochure PDF.',
      keySellingPoints: ['Phản hồi nhanh', 'Tư vấn theo ngành', 'Hỗ trợ hồ sơ minh bạch'],
      objectionHandling: ['Học phí cao -> Giới thiệu trả góp / học bổng đối tác'],
      createdAt: t,
      updatedAt: t,
      createdBy: actorUid,
    })
    return true
  })

  if (!didSeed) {
    const colRef = collection(db, FS_COLLECTIONS.masterData)
    const allSnap = await getDocs(colRef)
    const docList = allSnap.docs.map((d) => ({ id: d.id, data: d.data() as Record<string, unknown> }))
    const regRef = doc(db, FS_COLLECTIONS.masterData, MASTER_DATA_REGISTRY_DOC_ID)
    const regSnap = await getDoc(regRef)
    if (!regSnap.exists()) {
      const { catalogs } = processMasterDataDocs(docList)
      await setDoc(regRef, {
        catalogs: catalogs.map((c) => ({ ...c })),
        updatedAt: t,
      })
    }
    for (const id of MASTER_DATA_DEFAULT_IDS) {
      const ref = doc(db, FS_COLLECTIONS.masterData, id)
      const snap = await getDoc(ref)
      if (!snap.exists()) {
        await setDoc(ref, {
          id,
          entries: entriesForKind(id),
          updatedAt: t,
        })
      }
    }
    return
  }

  const rtdb = getRealtimeDb()
  if (!rtdb) return
  try {
    await set(ref(rtdb, 'vietmy_admissions'), {
      note: 'Admissions OS — đã seed Firestore lần đầu (masterData, scoringProfiles, playbook). CRM chính vẫn là Firestore.',
      seededAt: new Date().toISOString(),
      seededByUid: actorUid,
    })
  } catch (e) {
    console.warn('[firestoreBootstrap] Không ghi được Realtime Database (kiểm tra Rules):', e)
  }
}
