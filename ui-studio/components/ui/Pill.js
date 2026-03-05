import React from 'react';

/**
 * Pill — tags/chips
 */
export function Pill({ children, className = '' }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-[var(--card)] border border-[var(--border)] text-[var(--text-secondary)] ${className}`}
    >
      {children}
    </span>
  );
}
