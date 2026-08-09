import { Component, type ErrorInfo, type ReactNode } from 'react'
import { clearChunkReloadFlag, isChunkLoadError, tryReloadOnceForStaleChunk } from '../utils/chunkLoadRecovery'

type Props = { children: ReactNode }

type State = { error: Error | null; chunkMiss: boolean }

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null, chunkMiss: false }

  static getDerivedStateFromError(error: Error): State {
    return { error, chunkMiss: isChunkLoadError(error) }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[AppErrorBoundary]', error, info.componentStack)
    if (isChunkLoadError(error)) {
      tryReloadOnceForStaleChunk(error.message)
    }
  }

  componentDidMount() {
    if (!this.state.error) clearChunkReloadFlag()
  }

  componentDidUpdate(_prev: Readonly<Props>, prevState: Readonly<State>) {
    if (prevState.error && !this.state.error) clearChunkReloadFlag()
    if (!this.state.error) clearChunkReloadFlag()
  }

  render() {
    if (this.state.error) {
      const chunkMiss = this.state.chunkMiss
      return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-6 text-center text-slate-100">
          <p className="text-sm font-semibold uppercase tracking-wider text-rose-400">Đã xảy ra lỗi</p>
          <h1 className="mt-2 max-w-lg text-lg font-medium tracking-wide text-white">
            {chunkMiss
              ? 'Phiên bản ứng dụng đã cập nhật. Hãy tải lại trang để lấy bản mới.'
              : 'Ứng dụng gặp sự cố không mong muốn. Bạn có thể tải lại trang hoặc quay lại sau.'}
          </h1>
          {!chunkMiss ? (
            <pre className="mt-4 max-h-40 max-w-2xl overflow-auto rounded-xl border border-white/10 bg-black/40 p-4 text-left text-xs text-rose-200/90">
              {this.state.error.message}
            </pre>
          ) : (
            <p className="mt-3 max-w-md text-sm text-slate-400">
              Thường gặp sau khi hệ thống vừa được cập nhật trong khi tab vẫn đang mở.
            </p>
          )}
          <button
            type="button"
            onClick={() => {
              clearChunkReloadFlag()
              window.location.reload()
            }}
            className="mt-6 rounded-xl border border-amber-400/40 bg-amber-500/20 px-5 py-2.5 text-sm font-semibold text-amber-50 hover:bg-amber-500/30"
          >
            Tải lại trang
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
