/**
 * Banner UNKNOWN / open-set: cuando la llave no encaja bien con lo conocido.
 */
import React from 'react';
import { AlertBanner } from '../../components/ui/AlertBanner';
import { computeUnknownDecision } from '../../utils/unknownOpenSetActive';

export function ResultUnknownBanner({ result, capturedPhotos, modoTaller }) {
  const unknown = computeUnknownDecision(result, capturedPhotos);
  if (!unknown.open_set_ready || unknown.unknown_decision === 'known') return null;

  const isUnknown = unknown.unknown_decision === 'UNKNOWN';
  const variant = isUnknown ? 'error' : 'warn';
  const message = isUnknown
    ? 'Llave posiblemente no identificable en catálogo. Revisa manualmente.'
    : 'Identificación con baja confianza. Verifica el resultado.';

  return (
    <AlertBanner variant={variant}>
      <div>
        <div>{message}</div>
        {modoTaller && unknown.unknown_reason?.length > 0 && (
          <div className="text-xs mt-1 opacity-80 font-mono">
            {unknown.unknown_reason.slice(0, 3).join(' · ')}
          </div>
        )}
      </div>
    </AlertBanner>
  );
}
