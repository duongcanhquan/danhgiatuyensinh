/**
 * Sinh file JSON trong `public/seed/` để app có thể «Nạp mẫu» trực tiếp lên Firestore
 * (fetch + writeBatch, dùng quyền người dùng đã đăng nhập).
 *
 * Chạy sau khi sửa nguồn snippet / playbook / knowledge:
 *   node scripts/export-public-seed-assets.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { VIETMY_SCRIPT_SNIPPET_SEED_ENTRIES } from './data/vietmy-script-snippet-seed-entries.mjs'
import { parseKnowledgeSeedMarkdown } from './parseKnowledgeSeedMarkdown.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const outDir = join(__dirname, '..', 'public', 'seed')
mkdirSync(outDir, { recursive: true })

writeFileSync(
  join(outDir, 'vietmy-script-snippets.json'),
  JSON.stringify(VIETMY_SCRIPT_SNIPPET_SEED_ENTRIES),
  'utf8',
)

const tuition = readFileSync(join(__dirname, 'data', 'knowledge-seed-tuition.txt'), 'utf8')
const policy = readFileSync(join(__dirname, 'data', 'knowledge-seed-policy.txt'), 'utf8')
const major = readFileSync(join(__dirname, 'data', 'knowledge-seed-major.txt'), 'utf8')
const knowledgeEntries = parseKnowledgeSeedMarkdown([tuition, policy, major].join('\n\n'))
const knowledgeWithIds = knowledgeEntries.map((e, i) => ({
  id: `vietmy_seed_knowledge_${String(i + 1).padStart(3, '0')}`,
  ...e,
}))
writeFileSync(join(outDir, 'knowledge-documents.json'), JSON.stringify(knowledgeWithIds), 'utf8')

const fragDir = join(__dirname, 'data', 'playbook-fragments')
const playbookParts = ['01.json', '02.json', '03.json', '04.json', '05.json']
const playbooks = []
for (const f of playbookParts) {
  const arr = JSON.parse(readFileSync(join(fragDir, f), 'utf8'))
  if (!Array.isArray(arr)) throw new Error(`Invalid ${f}`)
  playbooks.push(...arr)
}
if (playbooks.length !== 50) throw new Error(`Expected 50 playbooks, got ${playbooks.length}`)
const playbooksWithIds = playbooks.map((e, i) => ({
  id: `vietmy_seed_playbook_${String(i + 1).padStart(2, '0')}`,
  ...e,
}))
writeFileSync(join(outDir, 'consulting-playbooks.json'), JSON.stringify(playbooksWithIds), 'utf8')

console.log(
  '[export-public-seed] Wrote',
  VIETMY_SCRIPT_SNIPPET_SEED_ENTRIES.length,
  'snippets,',
  knowledgeWithIds.length,
  'knowledge,',
  playbooksWithIds.length,
  'playbooks → public/seed/',
)
