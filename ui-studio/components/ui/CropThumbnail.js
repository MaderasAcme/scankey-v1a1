import React from 'react';

/**
 * Miniatura recortada usando crop_bbox normalizado [0..1].
 * Usa background-image + background-size + background-position.
 */
export function CropThumbnail({ dataUrl, bbox, className = '', alt = '' }) {
  if (!dataUrl) {
    return (
      <div
        className={`w-full h-24 rounded-[var(--r-sm)] bg-[var(--border)] flex items-center justify-center ${className}`}
      >
        <span className="text-[var(--muted)] text-xs">—</span>
      </div>
    );
  }

  const { x = 0, y = 0, w = 1, h = 1 } = bbox || {};
  const isFullFrame = (w >= 1 && h >= 1) || (w >= 0.99 && h >= 0.99);

  const style = isFullFrame
    ? {
        backgroundImage: `url(${dataUrl})`,
        backgroundSize: '100% 100%',
        backgroundPosition: '0 0',
        backgroundRepeat: 'no-repeat',
      }
    : {
        backgroundImage: `url(${dataUrl})`,
        backgroundSize: `${100 / Math.max(0.01, w)}% ${100 / Math.max(0.01, h)}%`,
        backgroundPosition: `${(x / (1 - w || 1)) * 100}% ${(y / (1 - h || 1)) * 100}%`,
        backgroundRepeat: 'no-repeat',
      };

  return (
    <div
      className={`w-full h-24 rounded-[var(--r-sm)] bg-[var(--border)] overflow-hidden ${className}`}
      style={style}
      role="img"
      aria-label={alt || 'Recorte de resultado'}
    />
  );
}
