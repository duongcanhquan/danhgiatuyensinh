export type ObjectionPair = {
  id: string
  objection: string
  response: string
}

const ARROWS = ['->', '→', '=>', '|'] as const

/** Tách một dòng playbook «Khách nói -> TVV đáp». */
export function parseObjectionLine(raw: string): { objection: string; response: string } {
  const t = raw.trim()
  if (!t) return { objection: '', response: '' }
  for (const sep of ARROWS) {
    const i = t.indexOf(sep)
    if (i > 0) {
      return {
        objection: t.slice(0, i).trim(),
        response: t.slice(i + sep.length).trim(),
      }
    }
  }
  return { objection: t, response: '' }
}

export function formatObjectionPair(objection: string, response: string): string {
  const o = objection.trim()
  const r = response.trim()
  if (!o && !r) return ''
  if (!r) return o
  if (!o) return r
  return `${o} -> ${r}`
}

export function parseObjectionLinesToPairs(lines: readonly string[]): ObjectionPair[] {
  const out: ObjectionPair[] = []
  lines.forEach((line, idx) => {
    const t = line.trim()
    if (!t) return
    const { objection, response } = parseObjectionLine(t)
    out.push({
      id: `obj-${idx}-${objection.slice(0, 12)}`,
      objection,
      response,
    })
  })
  return out
}

export function serializeObjectionPairs(pairs: readonly ObjectionPair[]): string[] {
  return pairs
    .map((p) => formatObjectionPair(p.objection, p.response))
    .map((s) => s.trim())
    .filter(Boolean)
}

export function newEmptyObjectionPair(): ObjectionPair {
  return {
    id: `obj-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    objection: '',
    response: '',
  }
}
