import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      errorMessage: '',
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMessage: error?.message || 'An unexpected error occurred' };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('TrackErrorBoundary caught error:', error, errorInfo);
  }

  private handleRecover = () => {
    this.setState({ hasError: false, errorMessage: '' });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[300px] p-6 text-center bg-zinc-900/90 text-zinc-100 rounded-2xl border border-zinc-800 m-4 shadow-xl">
          <div className="w-12 h-12 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center mb-3">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-semibold mb-1">Tracker Temporarily Interrupted</h3>
          <p className="text-xs text-zinc-400 max-w-md mb-4">
            A map rendering or data update was interrupted, but your tracked coordinate points and journey logs have been preserved.
          </p>
          <button
            onClick={this.handleRecover}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg shadow transition-all cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Resume Map Tracking
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
