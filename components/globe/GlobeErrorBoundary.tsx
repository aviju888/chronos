import React, { Component, ReactNode } from 'react';
import { AlertTriangle, Map } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class GlobeErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Globe rendering failed:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }

    return this.props.children;
  }
}

// Fallback UI when globe fails to render
export const GlobeFallbackUI: React.FC<{ onSwitch2D: () => void }> = ({ onSwitch2D }) => {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-paper dark:bg-night">
      <div className="text-center p-8 max-w-md">
        <AlertTriangle className="w-16 h-16 mx-auto mb-4 text-gold" />
        <h3 className="text-xl font-display font-bold text-ink dark:text-paper mb-2">
          3D Globe Unavailable
        </h3>
        <p className="text-slate dark:text-stone-400 text-sm leading-relaxed mb-6">
          Your browser doesn't support WebGL or there was an error loading the 3D globe.
          You can still explore the map in 2D mode.
        </p>
        <button
          onClick={onSwitch2D}
          className="px-6 py-3 bg-gold text-ink font-bold rounded-lg hover:bg-gold-light transition-colors flex items-center gap-2 mx-auto"
        >
          <Map className="w-5 h-5" />
          Switch to 2D Map
        </button>
      </div>
    </div>
  );
};
