import React, { useState, useEffect, useCallback } from 'react';
import { X, AlertCircle, CheckCircle, Info, RefreshCw } from 'lucide-react';

export type ToastType = 'error' | 'success' | 'info';

export interface ToastMessage {
  id: string;
  type: ToastType;
  title: string;
  message: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface ToastProps {
  toast: ToastMessage;
  onDismiss: (id: string) => void;
}

const Toast: React.FC<ToastProps> = ({ toast, onDismiss }) => {
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    // Auto-dismiss after 8 seconds for non-error toasts
    if (toast.type !== 'error') {
      const timer = setTimeout(() => {
        handleDismiss();
      }, 8000);
      return () => clearTimeout(timer);
    }
  }, [toast.id, toast.type]);

  const handleDismiss = () => {
    setIsExiting(true);
    setTimeout(() => onDismiss(toast.id), 200);
  };

  const icons = {
    error: <AlertCircle className="w-5 h-5 text-red-500" />,
    success: <CheckCircle className="w-5 h-5 text-green-500" />,
    info: <Info className="w-5 h-5 text-blue-500" />,
  };

  const bgColors = {
    error: 'bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800',
    success: 'bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800',
    info: 'bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800',
  };

  return (
    <div
      className={`flex items-start gap-3 p-4 rounded-lg border shadow-lg max-w-md w-full transition-all duration-200 ${bgColors[toast.type]} ${
        isExiting ? 'opacity-0 translate-x-4' : 'opacity-100 translate-x-0'
      }`}
      role="alert"
    >
      <div className="flex-shrink-0 mt-0.5">{icons[toast.type]}</div>
      <div className="flex-1 min-w-0">
        <h4 className="font-bold text-ink dark:text-paper text-sm">{toast.title}</h4>
        <p className="text-sm text-slate dark:text-stone-400 mt-0.5">{toast.message}</p>
        {toast.action && (
          <button
            onClick={toast.action.onClick}
            className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-gold-dark hover:text-gold transition-colors"
          >
            <RefreshCw className="w-3 h-3" />
            {toast.action.label}
          </button>
        )}
      </div>
      <button
        onClick={handleDismiss}
        className="flex-shrink-0 p-1 rounded hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
        aria-label="Dismiss"
      >
        <X className="w-4 h-4 text-slate dark:text-stone-400" />
      </button>
    </div>
  );
};

interface ToastContainerProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[2000] flex flex-col gap-2 max-w-md w-full px-4 md:px-0">
      {toasts.map(toast => (
        <Toast key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
};

// Hook for managing toasts
export const useToast = () => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = useCallback((toast: Omit<ToastMessage, 'id'>) => {
    const id = Date.now().toString();
    setToasts(prev => [...prev, { ...toast, id }]);
    return id;
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const showError = useCallback((title: string, message: string, action?: ToastMessage['action']) => {
    return addToast({ type: 'error', title, message, action });
  }, [addToast]);

  const showSuccess = useCallback((title: string, message: string) => {
    return addToast({ type: 'success', title, message });
  }, [addToast]);

  const showInfo = useCallback((title: string, message: string) => {
    return addToast({ type: 'info', title, message });
  }, [addToast]);

  return {
    toasts,
    addToast,
    dismissToast,
    showError,
    showSuccess,
    showInfo,
    ToastContainer: () => <ToastContainer toasts={toasts} onDismiss={dismissToast} />,
  };
};

// Helper to parse error messages
export const parseApiError = (error: unknown): { title: string; message: string } => {
  const errorStr = error instanceof Error ? error.message : String(error);

  if (errorStr.includes('API_KEY') || errorStr.includes('api key') || errorStr.includes('401')) {
    return {
      title: 'API Key Issue',
      message: 'Please check that your API key is valid and properly configured.',
    };
  }

  if (errorStr.includes('network') || errorStr.includes('fetch') || errorStr.includes('ECONNREFUSED')) {
    return {
      title: 'Connection Failed',
      message: 'Unable to connect to the server. Please check your internet connection.',
    };
  }

  if (errorStr.includes('429') || errorStr.includes('rate limit') || errorStr.includes('quota')) {
    return {
      title: 'Rate Limited',
      message: 'Too many requests. Please wait a moment before trying again.',
    };
  }

  if (errorStr.includes('timeout') || errorStr.includes('ETIMEDOUT')) {
    return {
      title: 'Request Timeout',
      message: 'The request took too long. Try a smaller time range or try again later.',
    };
  }

  if (errorStr.includes('parse') || errorStr.includes('JSON') || errorStr.includes('schema')) {
    return {
      title: 'Data Error',
      message: 'Received unexpected data from the AI. Please try again.',
    };
  }

  if (errorStr.includes("couldn't find any historical records")) {
    return {
      title: 'Region Not Found',
      message: errorStr,
    };
  }

  return {
    title: 'Generation Failed',
    message: 'Something went wrong while generating your timeline. Please try again.',
  };
};
