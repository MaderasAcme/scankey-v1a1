import React from 'react';

/**
 * ReadableCandidatesPanel — vista de candidatos de texto reconocidos en tiempo real.
 * Solo lectura visual. No persiste ni duplica datos.
 */
export function ReadableCandidatesPanel({ candidates = [] }) {
  if (!candidates || candidates.length === 0) return null;

  return (
    <div className="rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)] overflow-hidden">
      <div className="px-4 py-2.5 border-b border-[var(--border)]">
        <h4 className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wide">
          Texto reconocido
        </h4>
      </div>
      <div className="p-4 space-y-1.5">
        {candidates.map((c, i) => (
          <div
            key={`${c.text}-${i}`}
            className={`flex items-center justify-between gap-2 ${
              i === 0 ? 'text-sm font-medium text-[var(--text)]' : 'text-xs text-[var(--text-muted)]'
            }`}
          >
            <span className="truncate">{c.text}</span>
            {c.confidence != null && c.confidence >= 0.2 && (
              <span className="text-[10px] text-[var(--text-muted)] flex-shrink-0">
                {Math.round(c.confidence * 100)}%
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
