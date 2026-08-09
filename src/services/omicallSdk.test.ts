import { describe, expect, it, vi } from 'vitest'
import {
  hangUpOmicallCall,
  normalizeOmicallInjectedCss,
  sanitizeOmicallInjectedStyles,
  isOmicallVendorCloseSaveLabel,
  dismissOmicallVendorCallUi,
  suppressOmicallVendorToasts,
  tryEndOmicallCallInstance,
  unwrapOmicallBaseLayerCss,
  type OmicallSdkGlobal,
} from './omicallSdk'

function makeToastSuppressHost() {
  const nodes = new Map<string, { id: string; tagName: string; textContent: string }>()
  const doc = {
    getElementById: (id: string) => nodes.get(id) ?? null,
    querySelectorAll: (sel: string) => {
      if (sel === 'style') return []
      if (sel !== '#vm-omicall-toast-suppress') return []
      const el = nodes.get('vm-omicall-toast-suppress')
      return el ? [el] : []
    },
    createElement: (tag: string) => ({ id: '', tagName: tag.toUpperCase(), textContent: '' }),
    head: {
      appendChild: (el: { id: string; tagName: string; textContent: string }) => {
        nodes.set(el.id, el)
      },
    },
  }
  const win: {
    OMIToastify?: unknown
    OMICallSDK?: { showToast?: (...args: unknown[]) => void }
  } = {
    OMICallSDK: { showToast: vi.fn() },
  }
  return { document: doc as unknown as Document, window: win as unknown as Window, nodes, win }
}

describe('unwrapOmicallBaseLayerCss', () => {
  it('strips @layer base wrapper that OMICall injects into Tailwind base', () => {
    const raw =
      '@layer base{@font-face{font-family:OMIRoboto}:root{--omi-font-size:15px;--omi-primary:#4d60e8}}'
    expect(unwrapOmicallBaseLayerCss(raw)).toBe(
      '@font-face{font-family:OMIRoboto}:root{--omi-font-size:15px;--omi-primary:#4d60e8}',
    )
  })

  it('strips @layer base with nested braces and newlines', () => {
    const raw = `@layer base{
                @font-face{
                    font-family: 'OMIRoboto';
                    font-weight: 400;
                }
            :root{--omi-font-size:15px}}`
    const out = unwrapOmicallBaseLayerCss(raw)
    expect(out).not.toMatch(/@layer\s+base/i)
    expect(out).toContain('OMIRoboto')
    expect(out).toContain('--omi-font-size:15px')
  })

  it('leaves unrelated CSS unchanged', () => {
    expect(unwrapOmicallBaseLayerCss('.x{color:red}')).toBe('.x{color:red}')
  })
})

describe('normalizeOmicallInjectedCss', () => {
  it('moves OMICall theme into @layer omicall (not unlayered — Chrome)', () => {
    const out = normalizeOmicallInjectedCss(
      '@layer base{@font-face{font-family:OMIRoboto}:root{--omi-font-size:15px}}',
    )
    expect(out).toMatch(/^@layer\s+omicall\{/)
    expect(out).not.toMatch(/@layer\s+base/i)
    expect(out).toContain('--omi-font-size:15px')
  })

  it('strips html/body font resets that crush rem layout', () => {
    const out = normalizeOmicallInjectedCss(
      '@layer base{html{font-size:62.5%}body{font-size:14px;line-height:1.2}:root{--omi-primary:#4d60e8}}',
    )
    expect(out).not.toMatch(/html\s*\{/i)
    expect(out).not.toMatch(/body\s*\{/i)
    expect(out).toContain('--omi-primary')
    expect(out).toMatch(/@layer\s+omicall/i)
  })
})

describe('sanitizeOmicallInjectedStyles', () => {
  it('rewrites OMICall theme style tags into @layer omicall', () => {
    const style = {
      id: '',
      textContent:
        '@layer base{@font-face{font-family:OMIRoboto}:root{--omi-font-size:15px}}',
    }
    const headKids: { id: string; textContent: string }[] = []
    const doc = {
      head: {
        appendChild: (el: { id: string; textContent: string }) => {
          headKids.push(el)
        },
      },
      getElementById: (id: string) => headKids.find((x) => x.id === id) ?? null,
      createElement: (tag: string) => ({ id: '', tagName: tag.toUpperCase(), textContent: '' }),
      querySelectorAll: (sel: string) => (sel === 'style' ? [style] : []),
    }
    sanitizeOmicallInjectedStyles(doc as unknown as Document)
    expect(style.textContent).toMatch(/@layer\s+omicall/i)
    expect(style.textContent).not.toMatch(/@layer\s+base/i)
    expect(style.textContent).toContain('--omi-font-size')
    expect(headKids.some((x) => x.id === 'vm-omicall-layout-shield')).toBe(true)
  })
})

describe('suppressOmicallVendorToasts', () => {
  it('injects CSS that hides OMICall toastify nodes', () => {
    const host = makeToastSuppressHost()
    suppressOmicallVendorToasts(host)
    const style = host.nodes.get('vm-omicall-toast-suppress')
    expect(style?.tagName).toBe('STYLE')
    expect(style?.textContent ?? '').toMatch(/\.omi-toastify/)
    expect(style?.textContent ?? '').toMatch(/display:\s*none/i)
  })

  it('no-ops OMIToastify factory so SDK cannot mount error toasts', () => {
    const host = makeToastSuppressHost()
    const originalShow = vi.fn()
    host.win.OMIToastify = () => ({ showToast: originalShow })

    suppressOmicallVendorToasts(host)

    const factory = host.win.OMIToastify as (opts?: unknown) => { showToast: () => unknown }
    const toast = factory({ text: 'Có lỗi xảy ra', type: 'error' })
    toast.showToast()
    expect(originalShow).not.toHaveBeenCalled()
  })

  it('no-ops OMICallSDK.showToast used by vendor helpers', () => {
    const host = makeToastSuppressHost()
    const showToast = host.win.OMICallSDK!.showToast as ReturnType<typeof vi.fn>
    suppressOmicallVendorToasts(host)
    host.win.OMICallSDK!.showToast!('Có lỗi xảy ra')
    expect(showToast).not.toHaveBeenCalled()
  })

  it('is idempotent for the style tag', () => {
    const host = makeToastSuppressHost()
    suppressOmicallVendorToasts(host)
    suppressOmicallVendorToasts(host)
    expect(host.document.querySelectorAll('#vm-omicall-toast-suppress')).toHaveLength(1)
  })
})


describe('tryEndOmicallCallInstance', () => {
  it('calls call.end() on v3 instance', () => {
    const end = vi.fn()
    expect(tryEndOmicallCallInstance({ end })).toBe(true)
    expect(end).toHaveBeenCalledOnce()
  })

  it('falls back to stopCall on instance', () => {
    const stopCall = vi.fn()
    expect(tryEndOmicallCallInstance({ stopCall })).toBe(true)
    expect(stopCall).toHaveBeenCalledOnce()
  })
})

describe('hangUpOmicallCall', () => {
  it('prefers raw call instance over sdk.stopCall', () => {
    const end = vi.fn()
    const stopCall = vi.fn()
    const sdk = { stopCall } as unknown as OmicallSdkGlobal
    expect(hangUpOmicallCall(sdk, { rawCall: { end } })).toBe(true)
    expect(end).toHaveBeenCalledOnce()
    expect(stopCall).not.toHaveBeenCalled()
  })

  it('uses getActiveCall when no raw call', () => {
    const end = vi.fn()
    const sdk = {
      getActiveCall: () => ({ end }),
      stopCall: vi.fn(),
    } as unknown as OmicallSdkGlobal
    expect(hangUpOmicallCall(sdk)).toBe(true)
    expect(end).toHaveBeenCalledOnce()
  })

  it('prefers endCall over stopCall on sdk global', () => {
    const endCall = vi.fn()
    const stopCall = vi.fn()
    const sdk = { endCall, stopCall } as unknown as OmicallSdkGlobal
    expect(hangUpOmicallCall(sdk)).toBe(true)
    expect(endCall).toHaveBeenCalledOnce()
    expect(stopCall).not.toHaveBeenCalled()
  })
})

describe('dismissOmicallVendorCallUi', () => {
  it('matches close-and-save labels', () => {
    expect(isOmicallVendorCloseSaveLabel('Đóng và lưu lại')).toBe(true)
    expect(isOmicallVendorCloseSaveLabel('  Close and save ')).toBe(true)
    expect(isOmicallVendorCloseSaveLabel('Huỷ')).toBe(false)
  })

  it('calls call.save and clicks matching button', () => {
    const save = vi.fn()
    const click = vi.fn()
    const btn = {
      textContent: 'Đóng và lưu lại',
      click,
    }
    const doc = {
      querySelectorAll: () => [btn],
    } as unknown as Document
    expect(dismissOmicallVendorCallUi({ rawCall: { save }, doc })).toBe(true)
    expect(save).toHaveBeenCalled()
    expect(click).toHaveBeenCalledOnce()
  })
})
