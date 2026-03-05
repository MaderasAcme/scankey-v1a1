import React from 'react';
import { Button } from './ui/Button';
import { copy } from '../utils/copy';
import { DEMO_IMAGE_DATAURL } from '../utils/demoImage';

/**
 * Lead Engineer - ScanFlow
 * Placeholder / stub for scan capture flow. Incluye botón demo para probar flujo completo.
 */
export const ScanFlow = ({ onAnalyze }) => {
  const handleDemoAnalyze = () => {
    if (onAnalyze) onAnalyze({ frontDataUrl: DEMO_IMAGE_DATAURL, backDataUrl: null });
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 gap-4">
      <p className="text-[var(--muted)] text-sm text-center">Flujo de escaneo (ScanFlow)</p>
      {onAnalyze && (
        <Button variant="primary" onClick={handleDemoAnalyze} aria-label="Analizar con imagen de prueba">
          {copy.scan.analyze}
        </Button>
      )}
    </div>
  );
};
