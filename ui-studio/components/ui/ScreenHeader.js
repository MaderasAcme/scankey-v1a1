import React from 'react';
import { ChevronLeft } from 'lucide-react';

/**
 * ScreenHeader — título + back opcional + acción derecha
 */
export function ScreenHeader({ title, onBack, rightAction }) {
  return (
    <header className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] bg-[var(--bg-elevated)]">
      <div className="flex items-center gap-3 min-w-0">
        {onBack && (
          <button
            onClick={onBack}
            aria-label="Volver"
            className="p-2 -ml-2 rounded-[var(--r-sm)] hover:bg-[var(--card)] active:scale-95 transition-all"
          >
            <ChevronLeft size={24} className="text-[var(--text)]" />
          </button>
        )}
        <h1 className="text-lg font-bold text-[var(--text)] truncate">{title}</h1>
      </div>
      {rightAction && <div className="flex-shrink-0">{rightAction}</div>}
    </header>
  );
}
