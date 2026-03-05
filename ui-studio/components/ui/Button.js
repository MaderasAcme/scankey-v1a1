import React from 'react';

const variants = {
  primary: 'bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white',
  secondary: 'bg-[var(--card)] border border-[var(--border)] text-[var(--text)] hover:bg-[var(--card-hover)]',
  ghost: 'bg-transparent text-[var(--text-secondary)] hover:bg-[var(--card)]',
  destructive: 'bg-[var(--danger)]/20 border border-[var(--danger)]/40 text-[var(--danger)] hover:bg-[var(--danger-muted)]',
};

/**
 * Button — variantes: primary | secondary | ghost | destructive
 */
export function Button({ children, variant = 'primary', className = '', disabled, ...props }) {
  const v = variants[variant] || variants.primary;
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 px-4 py-3 rounded-[var(--r-md)] font-semibold text-sm transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed ${v} ${className}`}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}
