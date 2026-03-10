import React from 'react';

/**
 * GhostKeyOverlay — silueta fija de llave como guía de encuadre.
 * Estados: neutral | active | ready | problem
 * Centrada, semitransparente, proporciones de llave genérica.
 */
const STATE_STYLES = {
  neutral: {
    stroke: 'rgba(255,255,255,0.18)',
    fill: 'rgba(255,255,255,0.03)',
  },
  active: {
    stroke: 'rgba(59,130,246,0.5)',
    fill: 'rgba(59,130,246,0.08)',
  },
  ready: {
    stroke: 'rgba(34,197,94,0.55)',
    fill: 'rgba(34,197,94,0.08)',
  },
  problem: {
    stroke: 'rgba(245,158,11,0.4)',
    fill: 'rgba(245,158,11,0.05)',
  },
};

export function GhostKeyOverlay({ status = 'neutral', className = '' }) {
  const style = STATE_STYLES[status] || STATE_STYLES.neutral;

  return (
    <div
      className={`absolute inset-0 flex items-center justify-center pointer-events-none ${className}`}
      aria-hidden
    >
      <svg
        viewBox="0 0 120 90"
        className="w-[58%] max-w-[240px] aspect-[4/3]"
        fill="none"
        stroke={style.stroke}
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <defs>
          <linearGradient id="ghost-key-fill" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={style.fill} />
            <stop offset="100%" stopColor={style.fill} stopOpacity="0.5" />
          </linearGradient>
        </defs>
        {/* Cabeza: óvalo */}
        <ellipse cx="60" cy="38" rx="22" ry="14" fill={style.fill} stroke={style.stroke} />
        {/* Canalillo (indicación sutil) */}
        <path d="M 52 38 L 68 38" stroke={style.stroke} strokeWidth="0.8" opacity="0.7" />
        {/* Hoja */}
        <rect x="38" y="32" width="44" height="12" rx="2" fill={style.fill} stroke={style.stroke} />
        {/* Punta */}
        <path d="M 38 38 L 28 38" stroke={style.stroke} strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </div>
  );
}
