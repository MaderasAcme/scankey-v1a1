import React from 'react';
import { ScreenHeader } from '../components/ui/ScreenHeader';

/**
 * HistoryScreen — placeholder
 */
export function HistoryScreen({ onBack }) {
  return (
    <div className="flex flex-col flex-1">
      <ScreenHeader title="Historial" onBack={onBack} />
      <div className="flex-1 flex items-center justify-center p-8">
        <p className="text-[var(--muted)] text-sm">Historial de escaneos</p>
      </div>
    </div>
  );
}
