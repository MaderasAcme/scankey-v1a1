import React from 'react';

/**
 * Card — contenedor con estilo design system
 */
export function Card({ children, className = '', onClick }) {
  const base = 'rounded-[var(--r-lg)] bg-[var(--card)] border border-[var(--border)] p-[var(--s-4)] shadow-[var(--shadow-1)]';
  const clickable = onClick ? 'cursor-pointer hover:bg-[var(--card-hover)] active:scale-[0.99] transition-all' : '';
  return (
    <div className={`${base} ${clickable} ${className}`} onClick={onClick} role={onClick ? 'button' : undefined}>
      {children}
    </div>
  );
}
