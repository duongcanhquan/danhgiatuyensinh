import { describe, expect, it } from 'vitest'
import {
  defaultInviteDocumentsConfig,
  findInviteTemplateFileId,
  parseInviteDocumentsConfig,
  resolveInviteDocumentGroups,
} from './inviteDocumentsConfig'

describe('inviteDocumentsConfig', () => {
  it('defaults enable all 8 document types across 4 groups', () => {
    const cfg = defaultInviteDocumentsConfig()
    expect(cfg.groups).toHaveLength(4)
    expect(cfg.autoCreateFolder).toBe(true)
    const types = cfg.groups.flatMap((g) => g.options.map((o) => o.docType))
    expect(types).toHaveLength(8)
    expect(resolveInviteDocumentGroups(cfg).flatMap((g) => g.options)).toHaveLength(8)
  })

  it('hides disabled options from resolved groups', () => {
    const cfg = defaultInviteDocumentsConfig()
    cfg.groups[0].options[0].enabled = false
    const resolved = resolveInviteDocumentGroups(cfg)
    expect(resolved[0].options).toHaveLength(1)
    expect(resolved[0].options[0].docType).toBe('LE_PHI_KHONG_DAU')
  })

  it('parses template ids and custom labels', () => {
    const parsed = parseInviteDocumentsConfig({
      driveRootFolderId: 'root123',
      autoCreateFolder: false,
      groups: [
        {
          id: 'le_phi',
          title: 'Lệ phí',
          tone: 'text-blue-700',
          options: [
            { label: 'Có dấu', enabled: true, templateFileId: 'tpl-a' },
            { label: 'Không dấu', enabled: true, templateFileId: 'tpl-b' },
          ],
        },
      ],
    })
    expect(parsed.driveRootFolderId).toBe('root123')
    expect(parsed.autoCreateFolder).toBe(false)
    expect(findInviteTemplateFileId('LE_PHI_CO_DAU', parsed)).toBe('tpl-a')
  })
})
