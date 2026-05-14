/**
 * Tách các khối `### [TUITION|POLICY|MAJOR_INFO] Tiêu đề` thành bản ghi seed Firestore.
 * Bỏ dòng tiêu đề nhóm dạng `NHÓM 1:` nếu lọt vào thân mục.
 */
export function parseKnowledgeSeedMarkdown(raw) {
  const idx = raw.search(/^### \[(?:TUITION|POLICY|MAJOR_INFO)\]/m)
  const cleanedStart = idx >= 0 ? raw.slice(idx) : raw
  const re = /^### \[(TUITION|POLICY|MAJOR_INFO)\]\s+(.+)$/gm
  const matches = [...cleanedStart.matchAll(re)]
  if (!matches.length) {
    throw new Error('Không tìm thấy khối ### [TUITION|POLICY|MAJOR_INFO] trong nguồn.')
  }
  const entries = []
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i]
    const start = m.index + m[0].length
    const end = i + 1 < matches.length ? matches[i + 1].index : cleanedStart.length
    let body = cleanedStart.slice(start, end).trim()
    body = body
      .split(/\r?\n/)
      .filter((line) => !/^\s*NHÓM\s*\d+:/i.test(line.trim()))
      .join('\n')
      .trim()
    entries.push({ type: m[1], title: m[2].trim(), content: body })
  }
  return entries
}
