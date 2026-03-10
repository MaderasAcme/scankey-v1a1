import React from 'react';

const TIPS = [
  'Alinea y centra la llave',
  'Evita reflejos',
  'Usa más luz si hace falta',
];

/**
 * Consejo breve y práctico para el usuario.
 */
export function ScanHelpTip({ tip }) {
  const text = tip || TIPS[0];
  return (
    <p className="text-xs text-[var(--text-muted)]">
      💡 {text}
    </p>
  );
}
