import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode }

type State = { error: Error | null }

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[AppErrorBoundary]', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-6 text-center text-slate-100">
          <p className="text-sm font-semibold uppercase tracking-wider text-rose-400">Đã xảy ra lỗi</p>
          <h1 className="mt-2 max-w-lg text-lg font-medium uppercase tracking-wide text-white">
            Ứng dụng gặp sự cố không mong muốn. Bạn có thể tải lại trang hoặc quay lại sau.
          </h1>
          <pre className="mt-4 max-h-40 max-w-2xl overflow-auto rounded-xl border border-white/10 bg-black/40 p-4 text-left text-xs text-rose-200/90">
            {this.state.error.message}
          </pre>
          <button
            type="button"
            onClick={() => window.location.reload()}
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
