import React, { useRef, useState, useEffect } from 'react';
import { Button } from './ui/Button';
import { copy } from '../utils/copy';
import { resizeDataUrl } from '../utils/imageResize';
import { WebCameraCapture } from './WebCameraCapture';

const MAX_OPTIMIZED_DIM = 1024;

const EMPTY_SNAPSHOTS = {
  tracking: null,
  glare: null,
  shape: null,
  topdown: null,
  contrast: null,
  dissection: null,
  textZones: null,
};

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error('No se pudo leer el archivo'));
    r.readAsDataURL(file);
  });
}

/**
 * Bloque individual A o B: preview, repetir, indicador completado.
 */
function SideBlock({
  side,
  label,
  photo,
  isActive,
  isDimmed,
  onCapture,
  onClear,
  hasCamera,
  capturing,
}) {
  const inputRef = useRef(null);

  const triggerFileInput = () => inputRef.current?.click();

  const handleFile = async (e) => {
    const file = e?.target?.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    try {
      const originalDataUrl = await fileToDataUrl(file);
      const optimizedDataUrl = await resizeDataUrl(originalDataUrl, MAX_OPTIMIZED_DIM);
      onCapture(side, { optimizedDataUrl, originalDataUrl, snapshots: { ...EMPTY_SNAPSHOTS } });
    } catch (err) {
      console.error('Error procesando imagen:', err);
    } finally {
      e.target.value = '';
    }
  };

  const borderClass = isActive
    ? 'border-[var(--accent)] ring-1 ring-[var(--accent)]/30'
    : isDimmed
      ? 'border-[var(--border)] opacity-60'
      : 'border-[var(--border)]';

  return (
    <div
      className={`flex flex-col gap-2 rounded-lg p-3 bg-[var(--bg-secondary)] border-2 transition-all ${borderClass}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-[var(--muted)]">{label}</span>
        {photo && (
          <span className="text-[10px] text-[var(--success)] font-medium">Completado</span>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFile}
      />
      <div className={`rounded-lg overflow-hidden bg-black/40 flex items-center justify-center ${
        photo ? 'aspect-square min-h-[100px]' : 'min-h-[140px]'
      }`}>
        {photo ? (
          <div className="relative w-full h-full">
            <img
              src={photo.optimizedDataUrl}
              alt={copy.scan.captured}
              className="w-full h-full object-contain"
            />
            <button
              type="button"
              className="absolute top-1 right-1 rounded bg-black/70 text-white text-xs px-2 py-1 opacity-90 hover:opacity-100 transition touch-manipulation"
              onClick={() => onClear(side)}
              aria-label={copy.scan.repeat}
            >
              {copy.scan.repeat}
            </button>
          </div>
        ) : hasCamera && isActive ? (
          <div className="w-full p-2">
            <WebCameraCapture
              captureLabel={side === 'A' ? copy.scan.captureA : copy.scan.captureB}
              onCapture={async ({ dataUrl, snapshots }) => {
                const optimizedDataUrl = await resizeDataUrl(dataUrl, MAX_OPTIMIZED_DIM);
                onCapture(side, {
                  optimizedDataUrl,
                  originalDataUrl: dataUrl,
                  snapshots: { ...EMPTY_SNAPSHOTS, ...(snapshots || {}) },
                });
              }}
              onError={() => {}}
              onUploadFallback={triggerFileInput}
              disabled={capturing === side}
            />
          </div>
        ) : (
          <div className="flex flex-col gap-2 items-center p-4">
            <Button
              variant="secondary"
              className="w-full text-sm py-2"
              onClick={() => inputRef.current?.click()}
              disabled={!isActive}
            >
              {copy.scan.uploadPhoto}
            </Button>
            {!isActive && isDimmed && (
              <span className="text-[10px] text-[var(--muted)]">Primero completa A</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * ScanFlow — captura guiada A y B en la misma pantalla.
 * photos = { A: { optimizedDataUrl, originalDataUrl, snapshots? }, B?: { optimizedDataUrl, originalDataUrl, snapshots? } }
 */
export const ScanFlow = ({ onAnalyze }) => {
  const [photos, setPhotos] = useState({});
  const [capturing, setCapturing] = useState(null);
  const [hasCamera, setHasCamera] = useState(true);
  const [cameraChecked, setCameraChecked] = useState(false);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setHasCamera(false);
      setCameraChecked(true);
      return;
    }
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({ video: true })
      .then((stream) => {
        stream.getTracks().forEach((t) => t.stop());
        if (!cancelled) setHasCamera(true);
      })
      .catch(() => {
        if (!cancelled) setHasCamera(false);
      })
      .finally(() => {
        if (!cancelled) setCameraChecked(true);
      });
    return () => { cancelled = true; };
  }, []);

  const handleCapture = (side, data) => {
    setPhotos((p) => ({ ...p, [side]: data }));
    setCapturing(null);
  };

  const handleClear = (side) => {
    setPhotos((p) => {
      const next = { ...p };
      delete next[side];
      return next;
    });
  };

  const handleAnalyze = () => {
    if (photos.A && onAnalyze) onAnalyze(photos);
  };

  const hasA = Boolean(photos.A);
  const hasB = Boolean(photos.B);
  const canAnalyze = hasA;

  // ESTADO 1 — sin A
  // ESTADO 2 — A capturada
  // ESTADO 3 — A y B capturadas

  const mainText =
    !hasA
      ? copy.scan.stepA
      : !hasB
        ? copy.scan.stepAAfter
        : null;

  return (
    <div className="flex-1 flex flex-col p-6 gap-4">
      {mainText && (
        <p className="text-[var(--text)] text-center font-medium">
          {mainText}
        </p>
      )}

      {!cameraChecked ? (
        <div className="flex items-center justify-center py-12">
          <span className="text-[var(--muted)] text-sm">Comprobando cámara…</span>
        </div>
      ) : !hasCamera ? (
        <div className="flex flex-col gap-1 p-3 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] mb-2">
          <p className="text-[var(--danger)] text-sm font-medium">{copy.scan.noCamera}</p>
          <p className="text-[var(--muted)] text-xs">{copy.scan.noCameraHint}</p>
        </div>
      ) : null}

      {cameraChecked && (
      <div className="grid grid-cols-2 gap-4">
        <SideBlock
          side="A"
          label={copy.scan.sideA}
          photo={photos.A}
          isActive={!hasA || hasB}
          isDimmed={hasA && !hasB}
          onCapture={handleCapture}
          onClear={handleClear}
          hasCamera={hasCamera}
          capturing={capturing}
        />
        <SideBlock
          side="B"
          label={`${copy.scan.sideB} (${copy.scan.stepBOptional})`}
          photo={photos.B}
          isActive={hasA}
          isDimmed={!hasA}
          onCapture={handleCapture}
          onClear={handleClear}
          hasCamera={hasCamera}
          capturing={capturing}
        />
      </div>
      )}

      {canAnalyze && (
        <Button
          variant="primary"
          className="w-full mt-4"
          onClick={handleAnalyze}
          aria-label={copy.scan.analyzeKey}
        >
          {copy.scan.analyzeKey}
        </Button>
      )}
    </div>
  );
};
