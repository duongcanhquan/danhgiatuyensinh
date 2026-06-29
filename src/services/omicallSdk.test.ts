import { describe, expect, it, vi } from 'vitest'
import { hangUpOmicallCall, tryEndOmicallCallInstance, type OmicallSdkGlobal } from './omicallSdk'

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
