import React, { useRef, useState, useEffect } from 'react';
import { Button } from './ui/Button';
import { copy } from '../utils/copy';
import { resizeDataUrl } from '../utils/imageResize';
import { EMPTY_SNAPSHOTS } from '../utils/keyTracking';
import { WebCameraCapture } from './WebCameraCapture';
import { VisionStateBadge } from './scan/VisionStateBadge';
import { MotorConnectionBadge } from './scan/MotorConnectionBadge';
import { AnalyzeStateBadge } from './scan/AnalyzeStateBadge';
import { DetectedKeyPreview } from './scan/DetectedKeyPreview';
import { ReadableCandidatesPanel } from './scan/ReadableCandidatesPanel';
import { ScanActionPanel } from './scan/ScanActionPanel';
import { OptionalSideBCollapse } from './scan/OptionalSideBCollapse';
import { ScanHelpTip } from './scan/ScanHelpTip';
import { useMotorConnection } from '../hooks/useMotorConnection';
import { buildReadableCandidates } from '../utils/buildReadableCandidates';

const MAX_OPTIMIZED_DIM = 1024;

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error('No se pudo leer el archivo'));
    r.readAsDataURL(file);
  });
}

/**
 * Bloque de cámara para lado B (dentro del acordeón).
 */
function SideBCameraBlock({ onCapture, onUploadFallback }) {
  const inputRef = useRef(null);
  const captureRef = useRef(null);

  const handleFile = async (e) => {
    const file = e?.target?.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    try {
      const originalDataUrl = await fileToDataUrl(file);
      const optimizedDataUrl = await resizeDataUrl(originalDataUrl, MAX_OPTIMIZED_DIM);
      onCapture('B', {
        optimizedDataUrl,
        originalDataUrl,
        snapshots: { ...EMPTY_SNAPSHOTS },
      });
    } catch (err) {
      console.error('Error procesando imagen:', err);
    } finally {
      e.target.value = '';
    }
  };

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFile}
      />
      <WebCameraCapture
        mode="standalone"
        captureLabel={copy.scan.captureB}
        onCapture={async ({ dataUrl, snapshots }) => {
          const optimizedDataUrl = await resizeDataUrl(dataUrl, MAX_OPTIMIZED_DIM);
          onCapture('B', {
            optimizedDataUrl,
            originalDataUrl: dataUrl,
            snapshots: { ...EMPTY_SNAPSHOTS, ...(snapshots || {}) },
          });
        }}
        onError={() => {}}
        onUploadFallback={() => inputRef.current?.click()}
      />
    </div>
  );
}

/**
 * ScanFlow — flujo guiado A -> B.
 * Estados separados: visión local, motor, análisis.
 * Móvil: columna única. Web: dos columnas (preview | panel).
 */
export const ScanFlow = ({ onAnalyze, isAnalyzing = false, analyzeError = null }) => {
  const [photos, setPhotos] = useState({});
  const [hasCamera, setHasCamera] = useState(true);
  const [cameraChecked, setCameraChecked] = useState(false);
  const [scanState, setScanState] = useState(null);
  const [sideBExpanded, setSideBExpanded] = useState(false);
  const captureRef = useRef(null);
  const inputRef = useRef(null);
  const { status: motorStatus } = useMotorConnection();

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

  const handleCaptureA = () => {
    captureRef.current?.();
  };

  const handleFileA = async (e) => {
    const file = e?.target?.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    try {
      const originalDataUrl = await fileToDataUrl(file);
      const optimizedDataUrl = await resizeDataUrl(originalDataUrl, MAX_OPTIMIZED_DIM);
      handleCapture('A', {
        optimizedDataUrl,
        originalDataUrl,
        snapshots: { ...EMPTY_SNAPSHOTS },
      });
    } catch (err) {
      console.error('Error procesando imagen:', err);
    } finally {
      e.target.value = '';
    }
  };

  const hasA = Boolean(photos.A);
  const hasB = Boolean(photos.B);

  const visionStatus = hasA ? 'key_ready' : (scanState?.status || 'searching_key');
  const previewDataUrl = scanState?.previewDataUrl;
  const readableCandidates = hasA && photos.A?.snapshots
    ? buildReadableCandidates({
        ocrReal: photos.A.snapshots.ocrReal,
        brandReconstruction: photos.A.snapshots.brandReconstruction,
        catalogMatching: photos.A.snapshots.catalogMatching,
      })
    : (scanState?.readableCandidates ?? []);
  const canCapture = scanState?.canCapture ?? false;
  const ocrRunning = scanState?.ocrRunning ?? false;
  const primaryLoading = ocrRunning || isAnalyzing;
  const showDetectedPreview = Boolean(previewDataUrl) && (visionStatus === 'key_detected' || visionStatus === 'key_ready');

  const analyzeStatus = isAnalyzing ? 'analyzing' : (analyzeError ? 'analyze_error' : 'idle');

  const motorOnline = motorStatus === 'motor_online';
  const motorOffline = motorStatus === 'motor_offline';
  const canAnalyze = hasA && motorOnline;

  const helpTip =
    motorOffline && hasA
      ? 'Motor no conectado. Reintentaremos automáticamente.'
      : scanState?.displayMessage ||
        (visionStatus === 'low_light' ? 'Usa más luz si hace falta' : 'Alinea y centra la llave');

  const primaryDisabled =
    primaryLoading ||
    (hasA ? !motorOnline : !canCapture);

  if (!cameraChecked) {
    return (
      <div className="flex-1 flex items-center justify-center py-12">
        <span className="text-[var(--muted)] text-sm">Comprobando cámara…</span>
      </div>
    );
  }

  if (!hasCamera) {
    return (
      <div className="flex-1 flex flex-col p-4 md:p-6 gap-4">
        <div className="p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)]">
          <p className="text-[var(--danger)] text-sm font-medium">{copy.scan.noCamera}</p>
          <p className="text-[var(--text-muted)] text-xs mt-1">{copy.scan.noCameraHint}</p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileA}
        />
        <Button variant="primary" className="w-full" onClick={() => inputRef.current?.click()}>
          {copy.scan.uploadPhoto}
        </Button>
      </div>
    );
  }

  const rightPanel = (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2 min-h-[2.25rem] items-center">
          <VisionStateBadge status={visionStatus} />
          <MotorConnectionBadge status={motorStatus} />
          <AnalyzeStateBadge status={analyzeStatus} />
        </div>
        <ScanHelpTip tip={helpTip} />
      </div>
      {hasA ? (
        <div className="rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)] overflow-hidden">
          <div className="px-4 py-2.5 border-b border-[var(--border)]">
            <h4 className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wide">
              {copy.scan.sideA} — {copy.scan.captured}
            </h4>
          </div>
          <div className="relative aspect-[4/3] bg-black/40 flex items-center justify-center p-2">
            <img
              src={photos.A.optimizedDataUrl}
              alt={copy.scan.captured}
              className="max-w-full max-h-full object-contain rounded"
            />
            <button
              type="button"
              className="absolute top-2 right-2 rounded-lg bg-black/70 text-white text-xs px-2 py-1"
              onClick={() => handleClear('A')}
            >
              {copy.scan.repeat}
            </button>
          </div>
        </div>
      ) : showDetectedPreview ? (
        <DetectedKeyPreview previewDataUrl={previewDataUrl} visible />
      ) : null}
      {readableCandidates.length > 0 && (
        <ReadableCandidatesPanel candidates={readableCandidates} />
      )}
      <ScanActionPanel
        primaryLabel={hasA ? copy.scan.analyzeKey : copy.scan.captureA}
        primaryDisabled={primaryDisabled}
        primaryLoading={primaryLoading}
        onPrimary={hasA ? handleAnalyze : handleCaptureA}
        secondaryLabel="Capturar lado B (opcional)"
        secondaryVisible={hasA && !hasB}
        onSecondary={() => setSideBExpanded(true)}
      />
        <OptionalSideBCollapse
          isExpanded={sideBExpanded}
          onToggle={setSideBExpanded}
          photo={photos.B}
          onCapture={handleCapture}
          onClear={handleClear}
          hasA={hasA}
        >
          <SideBCameraBlock onCapture={handleCapture} />
        </OptionalSideBCollapse>
    </div>
  );

  const mainPreview = !hasA ? (
    <div className="w-full">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileA}
      />
      <WebCameraCapture
        mode="guided"
        captureRef={captureRef}
        onScanState={setScanState}
        onCapture={async ({ dataUrl, snapshots }) => {
          const optimizedDataUrl = await resizeDataUrl(dataUrl, MAX_OPTIMIZED_DIM);
          handleCapture('A', {
            optimizedDataUrl,
            originalDataUrl: dataUrl,
            snapshots: { ...EMPTY_SNAPSHOTS, ...(snapshots || {}) },
          });
        }}
        onError={() => {}}
        onUploadFallback={() => inputRef.current?.click()}
      />
    </div>
  ) : (
    <div className="relative w-full aspect-[4/3] rounded-xl overflow-hidden bg-black">
      <img
        src={photos.A.optimizedDataUrl}
        alt={copy.scan.captured}
        className="w-full h-full object-contain"
      />
      <button
        type="button"
        className="absolute top-2 right-2 rounded-lg bg-black/70 text-white text-xs px-2 py-1"
        onClick={() => handleClear('A')}
        aria-label={copy.scan.repeat}
      >
        {copy.scan.repeat}
      </button>
    </div>
  );

  return (
    <div className="flex-1 flex flex-col p-4 md:p-6 gap-4 md:gap-6">
      {/* MÓVIL: columna única */}
      <div className="flex flex-col gap-4 md:hidden">
        <div className="flex flex-wrap justify-center gap-2 min-h-[2.25rem] items-center">
          <VisionStateBadge status={visionStatus} />
          <MotorConnectionBadge status={motorStatus} />
          <AnalyzeStateBadge status={analyzeStatus} />
        </div>
        <div className="flex-1 min-h-0">{mainPreview}</div>
        {!hasA && showDetectedPreview && (
          <DetectedKeyPreview previewDataUrl={previewDataUrl} visible />
        )}
        {readableCandidates.length > 0 && (
          <ReadableCandidatesPanel candidates={readableCandidates} />
        )}
        <ScanHelpTip tip={helpTip} />
        <ScanActionPanel
          primaryLabel={hasA ? copy.scan.analyzeKey : copy.scan.captureA}
          primaryDisabled={primaryDisabled}
          primaryLoading={primaryLoading}
          onPrimary={hasA ? handleAnalyze : handleCaptureA}
          secondaryLabel="Capturar lado B (opcional)"
          secondaryVisible={hasA && !hasB}
          onSecondary={() => setSideBExpanded(true)}
        />
        <OptionalSideBCollapse
          isExpanded={sideBExpanded}
          onToggle={setSideBExpanded}
          photo={photos.B}
          onCapture={handleCapture}
          onClear={handleClear}
          hasA={hasA}
        >
          <SideBCameraBlock onCapture={handleCapture} />
        </OptionalSideBCollapse>
      </div>

      {/* WEB: dos columnas */}
      <div className="hidden md:grid md:grid-cols-[1fr,340px] md:gap-6 md:flex-1 md:min-h-0">
        <div className="flex flex-col min-h-0">
          <div className="flex-1 flex items-center justify-center min-h-[280px]">{mainPreview}</div>
        </div>
        <div className="flex flex-col gap-4 overflow-y-auto max-h-[calc(100vh-180px)]">{rightPanel}</div>
      </div>
    </div>
  );
};
