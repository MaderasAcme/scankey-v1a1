import React from 'react';

/**
 * Tarjeta "Vista detectada" — muestra el recorte/aislado de la llave sobre fondo neutro.
 * Solo visible cuando la detección es suficientemente fiable.
 */
export function DetectedKeyPreview({ previewDataUrl, visible }) {
  if (!visible) {
    return (
      <div className="rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)] overflow-hidden">
        <div className="aspect-[4/3] flex items-center justify-center p-4">
          <p className="text-xs text-[var(--text-muted)]">Vista detectada aparecerá aquí</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)] overflow-hidden">
      <div className="px-4 py-2.5 border-b border-[var(--border)]">
        <h4 className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wide">Vista detectada</h4>
      </div>
      <div className="aspect-[4/3] bg-[#fafafa] dark:bg-[#1a1a1a] flex items-center justify-center p-2">
        {previewDataUrl ? (
          <img
            src={previewDataUrl}
            alt="Llave detectada"
            className="max-w-full max-h-full object-contain"
          />
        ) : (
          <span className="text-xs text-[var(--text-muted)]">Procesando…</span>
        )}
      </div>
    </div>
  );
}
