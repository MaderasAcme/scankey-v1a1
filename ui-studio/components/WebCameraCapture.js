/**
 * WebCameraCapture — captura real desde webcam vía getUserMedia.
 * Usa video + canvas para generar dataURL. Cierra tracks en unmount.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Button } from './ui/Button';

const MAX_DIM = 1920;

export function WebCameraCapture({ onCapture, onError, onUploadFallback, disabled }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);
  const [facingMode, setFacingMode] = useState('environment');

  const stopStream = () => {
    const stream = streamRef.current;
    if (!stream) return;
    stream.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setReady(false);
  };

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
    if (onCapture) onCapture(dataUrl);
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
      </div>
      <div className="flex gap-2">
        <Button
          variant="primary"
          className="flex-1"
          onClick={handleCapture}
          disabled={!ready || disabled}
          aria-label="Capturar"
        >
          Capturar
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
