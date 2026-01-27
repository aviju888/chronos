import React, { ReactNode } from 'react';

interface FloatingPanelProps {
  children: ReactNode;
  className?: string;
  position?: 'top-left' | 'top-right' | 'bottom-center' | 'center';
  width?: 'sm' | 'md' | 'lg' | 'auto';
}

const positionClasses = {
  'top-left': 'top-20 left-4 md:left-8',
  'top-right': 'top-20 right-4 md:right-8',
  'bottom-center': 'bottom-8 left-1/2 -translate-x-1/2',
  'center': 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2',
};

const widthClasses = {
  sm: 'w-72',
  md: 'w-80 md:w-96',
  lg: 'w-full max-w-lg',
  auto: 'w-auto',
};

export const FloatingPanel: React.FC<FloatingPanelProps> = ({
  children,
  className = '',
  position = 'top-left',
  width = 'md',
}) => {
  return (
    <div
      className={`
        fixed z-50
        ${positionClasses[position]}
        ${widthClasses[width]}
        bg-paper/90 dark:bg-night/90
        backdrop-blur-xl backdrop-saturate-150
        border border-gold/20 dark:border-gold/10
        rounded-2xl
        shadow-2xl shadow-black/20 dark:shadow-black/50
        transition-all duration-300
        ${className}
      `}
    >
      {children}
    </div>
  );
};

export default FloatingPanel;
