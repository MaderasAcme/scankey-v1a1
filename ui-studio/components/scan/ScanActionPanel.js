import React from 'react';
import { Button } from '../ui/Button';

/**
 * Panel de acciones: CTA principal + secundario opcional.
 */
export function ScanActionPanel({
  primaryLabel = 'Analizar llave',
  primaryDisabled,
  primaryLoading,
  onPrimary,
  secondaryLabel = 'Capturar lado B (opcional)',
  secondaryVisible,
  onSecondary,
  className = '',
}) {
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <Button
        variant="primary"
        className="w-full py-4 text-base font-bold"
        onClick={onPrimary}
        disabled={primaryDisabled}
        aria-label={primaryLabel}
      >
        {primaryLoading ? 'Procesando…' : primaryLabel}
      </Button>
      {secondaryVisible && (
        <Button
          variant="secondary"
          className="w-full"
          onClick={onSecondary}
          aria-label={secondaryLabel}
        >
          {secondaryLabel}
        </Button>
      )}
    </div>
  );
}
