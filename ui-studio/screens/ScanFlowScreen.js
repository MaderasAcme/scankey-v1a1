import React from 'react';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { ScanFlow } from '../components/ScanFlow';
import { Button } from '../components/ui/Button';
import { AlertBanner } from '../components/ui/AlertBanner';
import { loadJSON } from '../utils/storage';
import { isWorkshopSessionValid } from '../services/auth';

const SETTINGS_KEY = 'scn_settings';

/**
 * ScanFlowScreen — envuelve ScanFlow con ScreenHeader
 * P1.1: QUALITY_GATE — AlertBanner + "Continuar igualmente" (modo taller + sesión válida + show_debug)
 */
export function ScanFlowScreen({
  onBack,
  onAnalyze,
  onRetryWithOverride,
  analyzeError,
  capturedPhotos,
}) {
  const settings = loadJSON(SETTINGS_KEY, {});
  const modo = settings.modo || 'cliente';
  const mostrarDebug = Boolean(settings.mostrar_debug);
  const hasValidWorkshopSession = isWorkshopSessionValid();
  const isQualityGate =
    analyzeError && typeof analyzeError === 'object' && analyzeError.type === 'QUALITY_GATE';
  const canOverride = modo === 'taller' && hasValidWorkshopSession && mostrarDebug && onRetryWithOverride && capturedPhotos;

  const errorMessage =
    typeof analyzeError === 'string'
      ? analyzeError
      : isQualityGate
        ? [analyzeError.message, analyzeError.reasons?.join(', ')].filter(Boolean).join(': ')
        : null;

  return (
    <div className="flex flex-col flex-1">
      <ScreenHeader title="Escanear" onBack={onBack} />
      {errorMessage && (
        <div className="px-4 pb-2">
          <AlertBanner variant="error">{errorMessage}</AlertBanner>
          {isQualityGate && canOverride && (
            <Button
              variant="secondary"
              className="w-full mt-2"
              onClick={onRetryWithOverride}
              aria-label="Continuar igualmente"
            >
              Continuar igualmente
            </Button>
          )}
        </div>
      )}
      <div className="flex-1">
        <ScanFlow onAnalyze={onAnalyze} />
      </div>
    </div>
  );
}
