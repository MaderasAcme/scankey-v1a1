import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '../ui/Button';
import { copy } from '../../utils/copy';

/**
 * Acordeón / bloque opcional para capturar lado B.
 * No compite con A; se activa visualmente cuando A ya está correcto.
 */
export function OptionalSideBCollapse({
  isExpanded,
  onToggle,
  photo,
  onCapture,
  onClear,
  children,
  hasA,
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = isExpanded ?? internalOpen;
  const setOpen = onToggle ?? (() => setInternalOpen((o) => !o));

  if (!hasA) return null;

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!isOpen)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-[var(--card)]/50 transition-colors"
        aria-expanded={isOpen}
      >
        <span className="text-sm font-medium text-[var(--text-secondary)]">
          {copy.scan.sideB} — {copy.scan.stepBOptional}
        </span>
        {isOpen ? (
          <ChevronUp size={18} className="text-[var(--text-muted)]" />
        ) : (
          <ChevronDown size={18} className="text-[var(--text-muted)]" />
        )}
      </button>
      {isOpen && (
        <div className="border-t border-[var(--border)] p-4">
          {photo ? (
            <div className="space-y-3">
              <div className="aspect-square max-h-[140px] mx-auto rounded-lg overflow-hidden bg-black/40 flex items-center justify-center">
                <img
                  src={photo.optimizedDataUrl}
                  alt={copy.scan.captured}
                  className="max-w-full max-h-full object-contain"
                />
              </div>
              <Button
                variant="secondary"
                className="w-full text-sm"
                onClick={() => onClear?.('B')}
              >
                {copy.scan.repeat}
              </Button>
            </div>
          ) : (
            children
          )}
        </div>
      )}
    </div>
  );
}
