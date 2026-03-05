import React from 'react';
import { ScreenHeader } from '../components/ui/ScreenHeader';

/**
 * TallerScreen — placeholder
 */
export function TallerScreen({ onBack }) {
  return (
    <div className="flex flex-col flex-1">
      <ScreenHeader title="Taller" onBack={onBack} />
      <div className="flex-1 flex items-center justify-center p-8">
        <p className="text-[var(--muted)] text-sm">Modo taller</p>
      </div>
    </div>
  );
}
