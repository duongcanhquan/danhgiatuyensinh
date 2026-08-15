/**
 * Nội dung Google Chat cho báo thu / duyệt tiền.
 * Incoming webhook hỗ trợ `text` (*in đậm*) + `cardsV2` (nút mở link bill).
 */

export function chatBold(s: string): string {
  const t = String(s ?? '').trim()
  if (!t) return ''
  // Google Chat: *bold* — tránh phá cú pháp nếu chuỗi sẵn có *
  return `*${t.replace(/\*/g, '')}*`
}

export type ChatCardButton = { label: string; url: string }

export function buildGoogleChatPayload(opts: {
  text: string
  title: string
  subtitle?: string
  rows?: Array<{ label: string; value: string }>
  buttons?: ChatCardButton[]
}): Record<string, unknown> {
  const widgets: Record<string, unknown>[] = []
  for (const row of opts.rows ?? []) {
    widgets.push({
      decoratedText: {
        topLabel: row.label,
        text: row.value,
        wrapText: true,
      },
    })
  }
  const buttons = (opts.buttons ?? []).filter((b) => b.url.startsWith('http'))
  if (buttons.length) {
    widgets.push({
      buttonList: {
        buttons: buttons.map((b) => ({
          text: b.label,
          onClick: { openLink: { url: b.url } },
        })),
      },
    })
  }

  const card: Record<string, unknown> = {
    header: {
      title: opts.title,
      subtitle: opts.subtitle || undefined,
    },
  }
  if (widgets.length) {
    card.sections = [{ widgets }]
  }

  return {
    text: opts.text,
    cardsV2: [
      {
        cardId: 'vietmy-finance',
        card,
      },
    ],
  }
}
