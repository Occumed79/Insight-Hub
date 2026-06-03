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
 * fallback instead of a blank black screen. Resetting clears the error state
 * so the user can retry without a full reload.
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

    return (
      <div className="dark min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-md w-full glass-panel rounded-2xl border border-white/10 p-8 text-center">
          <h1 className="text-xl font-semibold text-white">Something went wrong</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            The page hit an unexpected error. Your data is safe — try again or reload.
          </p>
          {this.state.error?.message && (
            <pre className="mt-4 max-h-32 overflow-auto rounded-lg bg-black/30 p-3 text-left text-[11px] text-amber-300/80">
              {this.state.error.message}
            </pre>
          )}
          <div className="mt-6 flex items-center justify-center gap-3">
            <button
              onClick={this.reset}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90"
            >
              Try again
            </button>
            <button
              onClick={() => window.location.reload()}
              className="rounded-lg border border-white/15 px-4 py-2 text-sm text-white/80 hover:bg-white/5"
            >
              Reload
            </button>
          </div>
        </div>
      </div>
    );
  }
}
