import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button, Card } from '@epistemics/ui';

interface State {
  error?: Error;
}

/** Catches render errors of one screen so a bug in a card never blanks the whole app. */
export class ErrorBoundary extends Component<{ children: ReactNode; onReset?: () => void }, State> {
  override state: State = {};

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('screen crashed', error, info.componentStack);
  }

  override render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <Card className="m-4 max-w-lg self-center md:m-8" role="alert" data-testid="screen-error">
        <h1 className="text-[17px] font-semibold">This screen hit an error</h1>
        <p className="mt-2 break-words text-sm text-muted">{this.state.error.message}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={() => { this.setState({}); this.props.onReset?.(); }}>Try again</Button>
          <Button variant="secondary" onClick={() => window.location.reload()}>Reload the app</Button>
        </div>
      </Card>
    );
  }
}
