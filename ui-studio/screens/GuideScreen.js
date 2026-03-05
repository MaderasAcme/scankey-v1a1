import React from 'react';
import { ScreenHeader } from '../components/ui/ScreenHeader';

/**
 * GuideScreen — placeholder
 */
export function GuideScreen({ onBack }) {
  return (
    <div className="flex flex-col flex-1">
      <ScreenHeader title="Guía" onBack={onBack} />
      <div className="flex-1 flex items-center justify-center p-8">
        <p className="text-[var(--muted)] text-sm">Guía de uso</p>
      </div>
    </div>
  );
}
