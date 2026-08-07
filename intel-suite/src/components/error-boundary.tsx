import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

/**
 * Catches render-time errors anywhere in the tree and shows a recoverable
 * fallback instead of a blank screen. Production hides raw exception details.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unhandled UI error:", error, info.componentStack);
  }

  private reset = () => this.setState({ hasError: false, error: undefined });

  render() {
    if (!this.state.hasError) return this.props.children;

    const exposeDetail = import.meta.env.DEV;

    return (
      <div className="dark flex min-h-dvh items-center justify-center bg-background p-4 sm:p-6">
        <div role="alert" className="glass-panel w-full max-w-md rounded-2xl border border-white/10 p-6 text-center sm:p-8">
          <h1 className="text-xl font-semibold text-white">Something went wrong</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            The page hit an unexpected error. Try the page again, or reload the application if the problem continues.
          </p>
          {exposeDetail && this.state.error?.message && (
            <pre className="ui-break-anywhere mt-4 max-h-32 overflow-auto whitespace-pre-wrap rounded-lg bg-black/30 p-3 text-left text-[11px] text-amber-300/80">
              {this.state.error.message}
            </pre>
          )}
          <div className="mt-6 flex flex-col items-stretch justify-center gap-3 sm:flex-row">
            <button
              type="button"
              onClick={this.reset}
              className="min-h-11 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="min-h-11 rounded-lg border border-white/15 px-4 py-2 text-sm text-white/80 hover:bg-white/5"
            >
              Reload
            </button>
          </div>
        </div>
      </div>
    );
  }
}
