/**
 * Marca probable para un resultado individual.
 */
import React from 'react';
import { getBrandSignalForResult } from './helpers';

export function ResultBrandSignal({ result, modoTaller, capturedPhotos }) {
  const brand = getBrandSignalForResult(result, modoTaller, capturedPhotos);
  if (!brand.show) return null;
  return (
    <div className="flex flex-col gap-0.5 text-xs text-[var(--text-secondary)]">
      <span className="opacity-90">{brand.label}</span>
      {brand.detail && (
        <span className="text-[10px] opacity-75 font-mono">{brand.detail}</span>
      )}
    </div>
  );
}
