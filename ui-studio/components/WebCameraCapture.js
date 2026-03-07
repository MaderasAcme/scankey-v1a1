/**
 * WebCameraCapture — captura real desde webcam vía getUserMedia.
 * Usa video + canvas para generar dataURL. Cierra tracks en unmount.
 * Integra key tracking pasivo (mide, guía, NO bloquea).
 */
import React, { useEffect, useRef, useState } from 'react';
import { Button } from './ui/Button';
import { analyzeFrame, getGuidanceMessage, makeTrackingSnapshot } from '../utils/keyTracking';

const MAX_DIM = 1920;
const TRACKING_FPS = 8;
const TRACK_INTERVAL_MS = 1000 / TRACKING_FPS;

export function WebCameraCapture({ onCapture, onError, onUploadFallback, disabled, captureLabel = 'Capturar' }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const trackingStateRef = useRef({ history: [], lastResult: null });
  const trackingIntervalRef = useRef(null);
  const lastLogRef = useRef(0);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);
  const [facingMode, setFacingMode] = useState('environment');
  const [trackingResult, setTrackingResult] = useState(null);

  const stopStream = () => {
    if (trackingIntervalRef.current) {
      clearInterval(trackingIntervalRef.current);
      trackingIntervalRef.current = null;
    }
    setTrackingResult(null);
    const stream = streamRef.current;
    if (!stream) return;
    stream.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setReady(false);
  };

  useEffect(() => {
    if (!ready || !videoRef.current) return;
    const video = videoRef.current;
    const tick = () => {
      if (!video.videoWidth) return;
      const { result, nextState } = analyzeFrame(video, trackingStateRef.current);
      trackingStateRef.current = nextState;
      setTrackingResult(result);
      if (process.env.NODE_ENV === 'development') {
        const now = Date.now();
        if (now - lastLogRef.current > 1000) {
          lastLogRef.current = now;
          console.debug('[keyTracking]', {
            key_detected: result.key_detected,
            roi_score: result.roi_score?.toFixed(2),
            centering_score: result.centering_score?.toFixed(2),
            coverage_score: result.coverage_score?.toFixed(2),
            stability_score: result.stability_score?.toFixed(2),
            pose_score: result.pose_score?.toFixed(2),
          });
        }
      }
    };
    tick();
    trackingIntervalRef.current = setInterval(tick, TRACK_INTERVAL_MS);
    return () => {
      if (trackingIntervalRef.current) {
        clearInterval(trackingIntervalRef.current);
        trackingIntervalRef.current = null;
      }
    };
  }, [ready]);

  const startStream = async () => {
    stopStream();
    setError(null);
    if (!navigator?.mediaDevices?.getUserMedia) {
      setError('No se pudo acceder a la cámara');
      if (onError) onError('getUserMedia no disponible');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setReady(true);
    } catch (e) {
      const msg = e?.name === 'NotAllowedError'
        ? 'Permiso de cámara denegado'
        : e?.message || 'No se pudo acceder a la cámara';
      setError(msg);
      if (onError) onError(msg);
    }
  };

  useEffect(() => {
    startStream();
    return () => stopStream();
  }, [facingMode]);

  const handleCapture = () => {
    const video = videoRef.current;
    if (!video || !ready || disabled) return;
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) return;

    const scale = Math.min(1, MAX_DIM / Math.max(w, h));
    const cw = Math.round(w * scale);
    const ch = Math.round(h * scale);
    const canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, cw, ch);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);

    const lastResult = trackingStateRef.current?.lastResult;
    const trackingSnapshot = makeTrackingSnapshot(lastResult, w, h);

    if (onCapture) onCapture(dataUrl, trackingSnapshot);
  };

  const switchCamera = () => {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  };

  const hasMultipleCameras = typeof navigator?.mediaDevices?.enumerateDevices === 'function';

  if (error) {
    return (
      <div className="flex flex-col gap-3 p-4 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)]">
        <p className="text-[var(--danger)] text-sm">{error}</p>
        <p className="text-[var(--muted)] text-xs">Puedes subir una foto manualmente.</p>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={startStream} className="flex-1">
            Reintentar cámara
          </Button>
          {onUploadFallback && (
            <Button variant="primary" onClick={onUploadFallback} className="flex-1">
              Subir foto
            </Button>
          )}
        </div>
      </div>
    );
  }

  const r = trackingResult;
  // bbox en keyTracking está en coords de análisis 120x90; convertir a % para overlay
  const bboxPercent = r?.bbox && r.key_detected ? {
    left: (r.bbox.x / 120) * 100,
    top: (r.bbox.y / 90) * 100,
    width: (r.bbox.w / 120) * 100,
    height: (r.bbox.h / 90) * 100,
  } : null;

  return (
    <div className="flex flex-col gap-2">
      <div className="relative aspect-[4/3] rounded-lg overflow-hidden bg-black">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
        />
        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center bg-[var(--bg-secondary)]">
            <span className="text-[var(--muted)] text-sm">Cargando cámara…</span>
          </div>
        )}
        {ready && r && (
          <>
            {bboxPercent && r.key_detected && (
              <div
                className="absolute border-2 border-[var(--accent)]/60 rounded pointer-events-none"
                style={{
                  left: `${bboxPercent.left}%`,
                  top: `${bboxPercent.top}%`,
                  width: `${bboxPercent.width}%`,
                  height: `${bboxPercent.height}%`,
                }}
                aria-hidden
              />
            )}
            <div className="absolute bottom-2 left-2 right-2 flex justify-center">
              <span className="text-xs px-2 py-1 rounded bg-black/60 text-white">
                {getGuidanceMessage(r)}
              </span>
            </div>
          </>
        )}
      </div>
      <div className="flex gap-2">
        <Button
          variant="primary"
          className="flex-1"
          onClick={handleCapture}
          disabled={!ready || disabled}
          aria-label={captureLabel}
        >
          {captureLabel}
        </Button>
        {hasMultipleCameras && (
          <Button variant="secondary" onClick={switchCamera} aria-label="Cambiar cámara">
            Cambiar cámara
          </Button>
        )}
      </div>
    </div>
  );
}
