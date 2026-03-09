/**
 * Línea corta opcional en modo taller cuando multi_label activo.
 */
import React from 'react';

export function MultilabelDebugLine({ result, modoTaller }) {
  if (!modoTaller || !result?.debug?.multi_label_enabled) return null;
  const present = result.debug.multi_label_fields_present;
  if (!Array.isArray(present) || present.length === 0) return null;
  return (
    <div className="text-[10px] text-[var(--text-secondary)] opacity-80 font-mono">
      Multi-label activo · Campos: {present.slice(0, 5).join(', ')}{present.length > 5 ? '…' : ''}
    </div>
  );
}
