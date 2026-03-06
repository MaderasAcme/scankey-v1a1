import React, { useRef, useState } from 'react';
import { Button } from './ui/Button';
import { copy } from '../utils/copy';
import { resizeDataUrl } from '../utils/imageResize';

const MAX_OPTIMIZED_DIM = 1024;

/**
 * ScanFlow — captura real A y B, sin demo. Estado local (NO persistir).
 * photos = { A: { optimizedDataUrl, originalDataUrl }, B?: { optimizedDataUrl, originalDataUrl } }
 */
export const ScanFlow = ({ onAnalyze }) => {
  const [photos, setPhotos] = useState({});
  const [capturing, setCapturing] = useState(null);
  const inputARef = useRef(null);
  const inputBRef = useRef(null);

  const handleFile = async (side, e) => {
    const file = e?.target?.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    setCapturing(side);
    try {
      const originalDataUrl = await fileToDataUrl(file);
      const optimizedDataUrl = await resizeDataUrl(originalDataUrl, MAX_OPTIMIZED_DIM);
      setPhotos((p) => ({
        ...p,
        [side]: { optimizedDataUrl, originalDataUrl },
      }));
    } catch (err) {
      console.error('Error procesando imagen:', err);
    } finally {
      setCapturing(null);
      e.target.value = '';
    }
  };

  const handleCaptureA = () => inputARef.current?.click();
  const handleCaptureB = () => inputBRef.current?.click();

  const handleAnalyze = () => {
    if (photos.A && onAnalyze) onAnalyze(photos);
  };

  const handleClear = (side) => {
    setPhotos((p) => {
      const next = { ...p };
      delete next[side];
      return next;
    });
  };

  const hasA = Boolean(photos.A);
  const hasB = Boolean(photos.B);
  const canAnalyze = hasA;

  return (
    <div className="flex-1 flex flex-col p-6 gap-4">
      <p className="text-[var(--muted)] text-sm text-center">
        {copy.scan.protocol}: Captura lado A (obligatorio) y B (opcional).
      </p>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium text-[var(--muted)]">{copy.scan.sideA}</label>
          <input
            ref={inputARef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => handleFile('A', e)}
          />
          <div
            className="aspect-square rounded-lg border-2 border-dashed border-[var(--border)] flex items-center justify-center overflow-hidden bg-[var(--bg-secondary)] min-h-[120px]"
            onClick={hasA ? undefined : handleCaptureA}
            role={hasA ? undefined : 'button'}
            aria-label={copy.scan.sideA}
          >
            {photos.A ? (
              <div className="relative w-full h-full group">
                <img
                  src={photos.A.optimizedDataUrl}
                  alt={copy.scan.captured}
                  className="w-full h-full object-contain"
                />
                <button
                  type="button"
                  className="absolute top-1 right-1 rounded bg-black/60 text-white text-xs px-2 py-1 opacity-0 group-hover:opacity-100 transition"
                  onClick={(e) => { e.stopPropagation(); handleClear('A'); }}
                >
                  Cambiar
                </button>
              </div>
            ) : (
              <span className="text-[var(--muted)] text-sm">
                {capturing === 'A' ? '...' : copy.scan.pending}
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium text-[var(--muted)]">{copy.scan.sideB}</label>
          <input
            ref={inputBRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => handleFile('B', e)}
          />
          <div
            className="aspect-square rounded-lg border-2 border-dashed border-[var(--border)] flex items-center justify-center overflow-hidden bg-[var(--bg-secondary)] min-h-[120px]"
            onClick={hasB ? undefined : handleCaptureB}
            role={hasB ? undefined : 'button'}
            aria-label={copy.scan.sideB}
          >
            {photos.B ? (
              <div className="relative w-full h-full group">
                <img
                  src={photos.B.optimizedDataUrl}
                  alt={copy.scan.captured}
                  className="w-full h-full object-contain"
                />
                <button
                  type="button"
                  className="absolute top-1 right-1 rounded bg-black/60 text-white text-xs px-2 py-1 opacity-0 group-hover:opacity-100 transition"
                  onClick={(e) => { e.stopPropagation(); handleClear('B'); }}
                >
                  Cambiar
                </button>
              </div>
            ) : (
              <span className="text-[var(--muted)] text-sm">
                {capturing === 'B' ? '...' : copy.scan.pending}
              </span>
            )}
          </div>
        </div>
      </div>

      {canAnalyze && (
        <Button
          variant="primary"
          className="w-full mt-4"
          onClick={handleAnalyze}
          aria-label={copy.scan.analyze}
        >
          {copy.scan.analyze}
        </Button>
      )}
    </div>
  );
};

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error('No se pudo leer el archivo'));
    r.readAsDataURL(file);
  });
}
