import React from 'react';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { ScanFlow } from '../components/ScanFlow';

/**
 * ScanFlowScreen — envuelve ScanFlow con ScreenHeader
 */
export function ScanFlowScreen({ onBack, onAnalyze }) {
  return (
    <div className="flex flex-col flex-1">
      <ScreenHeader title="Escanear" onBack={onBack} />
      <div className="flex-1">
        <ScanFlow onAnalyze={onAnalyze} />
      </div>
    </div>
  );
}
