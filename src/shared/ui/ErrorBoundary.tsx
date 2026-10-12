import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = { children: ReactNode };
type State = { hasError: boolean };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[songxian] ui.error', { error, info });
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <main className="error-state">
          <p className="eyebrow">页面没有正常打开</p>
          <h1>先回到首页，再试一次</h1>
          <button className="primary-button" type="button" onClick={() => window.location.reload()}>
            重新打开
          </button>
        </main>
      );
    }
    return this.props.children;
  }
}
