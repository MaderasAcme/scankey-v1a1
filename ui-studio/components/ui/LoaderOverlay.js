import React from 'react';

/**
 * LoaderOverlay — muestra SOLO "Intento 1/2" o "Intento 2/2"
 */
export function LoaderOverlay({ attempt = 1, total = 2 }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
        <p className="text-[var(--text)] font-semibold text-lg">
          Intento {attempt}/{total}
        </p>
      </div>
    </div>
  );
}
