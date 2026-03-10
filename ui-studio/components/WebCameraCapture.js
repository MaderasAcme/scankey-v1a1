/**
 * WebCameraCapture — captura real desde webcam vía getUserMedia.
 * Usa video + canvas para generar dataURL. Cierra tracks en unmount.
 * Integra key tracking pasivo (mide, guía, NO bloquea).
 * Modo guided: expone estado vía onScanState para UI guiada (ScanFlow).
 */
import React, { useEffect, useRef, useState } from 'react';
import { Button } from './ui/Button';
import { analyzeFrame, getGuidanceMessage, makeTrackingSnapshot, EMPTY_SNAPSHOTS } from '../utils/keyTracking';
import { analyzeGlare, getGlareGuidanceMessage, makeGlareSnapshot } from '../utils/glareSense';
import { analyzeShapeMask, getShapeGuidanceMessage, makeShapeSnapshot } from '../utils/shapeMask';
import { analyzeTopdownNormalizer, makeTopdownSnapshot } from '../utils/topdownNormalizer';
import { analyzeContrast, makeContrastSnapshot } from '../utils/contrastSense';
import { analyzeKeyDissection, makeDissectionSnapshot } from '../utils/keyDissection';
import { analyzeTextZones, makeTextZonesSnapshot } from '../utils/textZones';
import { analyzeDamageSense, makeDamageSnapshot } from '../utils/damageSense';
import { analyzeQualityGateVision, makeQualityGateSnapshot } from '../utils/qualityGateVision';
import { analyzeFeatureFusion, makeFeatureFusionSnapshot } from '../utils/featureFusion';
import { analyzeBrandReconstruction, makeBrandReconstructionSnapshot } from '../utils/brandReconstruction';
import { runZonedOCR, makeOcrRealSnapshot } from '../utils/ocrReal';
import { runCatalogMatching, makeCatalogMatchingSnapshot } from '../utils/catalogMatchingActive';
import { evaluateAutoCapture, AUTO_CAPTURE_ENABLED_KEY } from '../utils/autoCapture';
import { analyzeLight, makeLightSnapshot } from '../utils/lightSense';
import { loadJSON } from '../utils/storage';

const MAX_DIM = 1920;
const TRACKING_FPS = 8;
const TRACK_INTERVAL_MS = 1000 / TRACKING_FPS;
const PREVIEW_UPDATE_MS = 250;
const SETTINGS_KEY = 'scn_settings';

const ANALYZE_W = 120;
const ANALYZE_H = 90;

function deriveScanStatus({ ocrRunning, lightStatusMsg, qualityGate, tracking }) {
  if (ocrRunning) return 'capturing';
  if (lightStatusMsg === 'Poca luz' || lightStatusMsg === 'Más luz, por favor') return 'low_light';
  if (qualityGate?.capture_ready) return 'ready';
  if (tracking?.key_detected) return 'detected';
  return 'searching';
}

export function WebCameraCapture({
  onCapture,
  onError,
  onUploadFallback,
  disabled,
  captureLabel = 'Capturar',
  mode = 'standalone',
  onScanState,
  captureRef,
}) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const trackingStateRef = useRef({ history: [], lastResult: null });
  const glareResultRef = useRef(null);
  const shapeResultRef = useRef(null);
  const topdownResultRef = useRef(null);
  const contrastResultRef = useRef(null);
  const dissectionResultRef = useRef(null);
  const textZonesResultRef = useRef(null);
  const damageResultRef = useRef(null);
  const qualityGateResultRef = useRef(null);
  const featureFusionResultRef = useRef(null);
  const brandReconstructionResultRef = useRef(null);
  const lightResultRef = useRef(null);
  const torchStateRef = useRef({ supported: false, requested: false, active: false });
  const trackingIntervalRef = useRef(null);
  const lastLogRef = useRef(0);
  const autoCaptureStateRef = useRef({ goodFramesCount: 0 });
  const autoCaptureTriggeredRef = useRef(false);
  const previewCanvasRef = useRef(null);
  const lastPreviewUpdateRef = useRef(0);
  const previewDataUrlRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);
  const [facingMode, setFacingMode] = useState('environment');
  const [trackingResult, setTrackingResult] = useState(null);
  const [glareResult, setGlareResult] = useState(null);
  const [shapeResult, setShapeResult] = useState(null);
  const [ocrRunning, setOcrRunning] = useState(false);
  const ocrRunningRef = useRef(false);
  ocrRunningRef.current = ocrRunning;
  const [lightStatus, setLightStatus] = useState(null);

  const stopStream = () => {
    if (trackingIntervalRef.current) {
      clearInterval(trackingIntervalRef.current);
      trackingIntervalRef.current = null;
    }
    autoCaptureStateRef.current = { goodFramesCount: 0 };
    autoCaptureTriggeredRef.current = false;
    previewDataUrlRef.current = null;
    setTrackingResult(null);
    setGlareResult(null);
    setShapeResult(null);
    setLightStatus(null);
    contrastResultRef.current = null;
    dissectionResultRef.current = null;
    textZonesResultRef.current = null;
    damageResultRef.current = null;
    qualityGateResultRef.current = null;
    featureFusionResultRef.current = null;
    brandReconstructionResultRef.current = null;
    lightResultRef.current = null;
    torchStateRef.current = { supported: false, requested: false, active: false };
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

      const glareRes = analyzeGlare(video, { roiBbox: result.bbox || null });
      glareResultRef.current = glareRes;
      setGlareResult(glareRes);

      const lightRes = analyzeLight(video, { roiBbox: result.bbox || null });
      const torchState = torchStateRef.current;
      lightRes.torch_supported = torchState.supported;
      lightRes.torch_requested = torchState.requested;
      lightRes.torch_active = torchState.active;
      lightResultRef.current = lightRes;

      if (lightRes.low_light_detected && torchState.supported && !torchState.requested) {
        const track = streamRef.current?.getVideoTracks?.()[0];
        if (track) {
          torchStateRef.current = { ...torchState, requested: true };
          track.applyConstraints({ advanced: [{ torch: true }] }).then(() => {
            torchStateRef.current = { ...torchStateRef.current, active: true };
          }).catch(() => {
            torchStateRef.current = { ...torchStateRef.current, requested: false, active: false };
          });
        }
      } else if (!lightRes.low_light_detected && torchState.active) {
        const track = streamRef.current?.getVideoTracks?.()[0];
        if (track) {
          torchStateRef.current = { supported: torchState.supported, requested: false, active: false };
          track.applyConstraints({ advanced: [{ torch: false }] }).catch(() => {});
        }
      }

      let lightStatusMsg = null;
      if (lightRes.light_level === 'very_low_light' && !torchState.supported) lightStatusMsg = 'Más luz, por favor';
      else if (lightRes.low_light_detected && torchState.active) lightStatusMsg = 'Linterna activada';
      else if (lightRes.low_light_detected) lightStatusMsg = 'Poca luz';

      const shapeRes = analyzeShapeMask(video, { roiBbox: result.bbox || null });
      shapeResultRef.current = shapeRes;
      setShapeResult(shapeRes);

      const topdownRes = analyzeTopdownNormalizer(video, { shapeResult: shapeRes });
      topdownResultRef.current = topdownRes;

      const contrastRes = analyzeContrast(video, { roiBbox: result.bbox || null });
      contrastResultRef.current = contrastRes;

      const dissectionRes = analyzeKeyDissection(video, {
        shapeResult: shapeRes,
        topdownResult: topdownRes,
      });
      dissectionResultRef.current = dissectionRes;

      const textZonesRes = analyzeTextZones(video, {
        dissectionResult: dissectionRes,
        contrastResult: contrastRes,
      });
      textZonesResultRef.current = textZonesRes;

      const damageRes = analyzeDamageSense(video, {
        shapeResult: shapeRes,
        dissectionResult: dissectionRes,
      });
      damageResultRef.current = damageRes;

      const qualityGateRes = analyzeQualityGateVision({
        tracking: result,
        glare: glareRes,
        shape: shapeRes,
        topdown: topdownRes,
        contrast: contrastRes,
        dissection: dissectionRes,
        textZones: textZonesRes,
        damage: damageRes,
      });
      qualityGateResultRef.current = qualityGateRes;

      const featureFusionRes = analyzeFeatureFusion({
        tracking: result,
        glare: glareRes,
        shape: shapeRes,
        topdown: topdownRes,
        contrast: contrastRes,
        dissection: dissectionRes,
        textZones: textZonesRes,
        damage: damageRes,
        qualityGate: qualityGateRes,
      });
      featureFusionResultRef.current = featureFusionRes;

      const brandReconstructionRes = analyzeBrandReconstruction({
        textZones: textZonesRes,
        dissection: dissectionRes,
        contrast: contrastRes,
        featureFusion: featureFusionRes,
        qualityGate: qualityGateRes,
        topdown: topdownRes,
        shape: shapeRes,
        glare: glareRes,
        damage: damageRes,
      });
      brandReconstructionResultRef.current = brandReconstructionRes;

      const autoCaptureRes = evaluateAutoCapture(
        { tracking: result, glare: glareRes, shape: shapeRes, qualityGate: qualityGateRes, light: lightRes },
        autoCaptureStateRef.current
      );
      autoCaptureStateRef.current = autoCaptureRes.nextState;

      const autoCaptureEnabled = Boolean(loadJSON(SETTINGS_KEY, {})[AUTO_CAPTURE_ENABLED_KEY]);
      const ocrRunningNow = ocrRunningRef.current;
      const aboutToAutoCapture = autoCaptureEnabled && autoCaptureRes.auto_capture_ready &&
        !autoCaptureTriggeredRef.current && !ocrRunningNow && !disabled;
      if (aboutToAutoCapture) {
        setLightStatus('Llave lista, capturando...');
        autoCaptureTriggeredRef.current = true;
        handleCapture();
      } else if (!lightStatusMsg) {
        setLightStatus(null);
      } else {
        setLightStatus(lightStatusMsg);
      }

      const scanStatus = deriveScanStatus({
        ocrRunning: ocrRunningNow,
        lightStatusMsg: lightStatusMsg || null,
        qualityGate: qualityGateRes,
        tracking: result,
      });
      const canCapture = ready && !disabled && !ocrRunningNow;
      let displayMsg = lightStatus || glareRes?.reflection_state === 'critical' ? getGlareGuidanceMessage(glareRes) : null;
      if (!displayMsg && result) displayMsg = getGuidanceMessage(result);
      if (!displayMsg && shapeRes) displayMsg = getShapeGuidanceMessage(shapeRes);

      if (scanStatus === 'searching') {
        previewDataUrlRef.current = null;
      } else if (result?.key_detected && (shapeRes?.shape_bbox || result?.bbox)) {
        const now = Date.now();
        if (now - lastPreviewUpdateRef.current >= PREVIEW_UPDATE_MS) {
          lastPreviewUpdateRef.current = now;
          const bbox = shapeRes?.shape_bbox || result.bbox;
          const vw = video.videoWidth;
          const vh = video.videoHeight;
          const scaleX = vw / ANALYZE_W;
          const scaleY = vh / ANALYZE_H;
          const pad = 4;
          const sx = Math.max(0, Math.round(bbox.x * scaleX) - pad);
          const sy = Math.max(0, Math.round(bbox.y * scaleY) - pad);
          const sw = Math.min(vw - sx, Math.round(bbox.w * scaleX) + pad * 2);
          const sh = Math.min(vh - sy, Math.round(bbox.h * scaleY) + pad * 2);
          if (sw > 8 && sh > 8) {
            let prevCanv = previewCanvasRef.current;
            if (!prevCanv) {
              prevCanv = document.createElement('canvas');
              previewCanvasRef.current = prevCanv;
            }
            const outSize = 160;
            prevCanv.width = outSize;
            prevCanv.height = Math.round(outSize * (sh / sw));
            const pctx = prevCanv.getContext('2d');
            if (pctx) {
              pctx.fillStyle = '#fafafa';
              pctx.fillRect(0, 0, prevCanv.width, prevCanv.height);
              pctx.drawImage(video, sx, sy, sw, sh, 0, 0, prevCanv.width, prevCanv.height);
              previewDataUrlRef.current = prevCanv.toDataURL('image/jpeg', 0.85);
            }
          }
        }
      }

      let effectiveBlockReason = null;
      if (disabled) effectiveBlockReason = 'disabled';
      else if (ocrRunningNow) effectiveBlockReason = 'ocr_running';
      else if (!autoCaptureEnabled) effectiveBlockReason = 'auto_capture_disabled';
      else effectiveBlockReason = autoCaptureRes.auto_capture_block_reason;

      if (onScanState) {
        onScanState({
          status: scanStatus,
          displayMessage: displayMsg || lightStatusMsg || null,
          canCapture,
          qualityGate: qualityGateRes,
          previewDataUrl: previewDataUrlRef.current,
          ocrRunning: ocrRunningNow,
          autoCaptureEnabled,
          auto_capture_ready: autoCaptureRes.auto_capture_ready,
          auto_capture_block_reason: effectiveBlockReason,
        });
      }

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
          console.debug('[glareSense]', {
            glare_score: glareRes.glare_score?.toFixed(2),
            specular_score: glareRes.specular_score?.toFixed(2),
            burned_area_ratio: glareRes.burned_area_ratio?.toFixed(3),
            highlight_cluster_score: glareRes.highlight_cluster_score?.toFixed(2),
            critical_glare_zone: glareRes.critical_glare_zone,
            reflection_state: glareRes.reflection_state,
          });
          console.debug('[shapeMask]', {
            mask_detected: shapeRes.mask_detected,
            mask_confidence: shapeRes.mask_confidence?.toFixed(2),
            contour_score: shapeRes.contour_score?.toFixed(2),
            key_complete: shapeRes.key_complete,
            shape_area_ratio: shapeRes.shape_area_ratio?.toFixed(3),
            edge_density: shapeRes.edge_density?.toFixed(3),
          });
          console.debug('[topdownNormalizer]', {
            topdown_ready: topdownRes.topdown_ready,
            alignment_score: topdownRes.alignment_score?.toFixed(2),
            rotation_deg: topdownRes.rotation_deg,
            topdown_confidence: topdownRes.topdown_confidence?.toFixed(2),
            pose_quality: topdownRes.pose_quality?.toFixed(2),
          });
          console.debug('[contrastSense]', {
            contrast_mode_used: contrastRes.contrast_mode_used,
            contrast_helpful: contrastRes.contrast_helpful,
            contrast_gain_score: contrastRes.contrast_gain_score?.toFixed(2),
            background_separation_score: contrastRes.background_separation_score?.toFixed(2),
            ocr_contrast_score: contrastRes.ocr_contrast_score?.toFixed(2),
            contour_contrast_score: contrastRes.contour_contrast_score?.toFixed(2),
          });
          console.debug('[keyDissection]', {
            dissection_ready: dissectionRes.dissection_ready,
            dissection_confidence: dissectionRes.dissection_confidence?.toFixed(2),
            head_blade_ratio: dissectionRes.head_blade_ratio?.toFixed(2),
            tip_visible: dissectionRes.tip_visible,
            cuts_visible: dissectionRes.cuts_visible,
            text_zone_head_visible: dissectionRes.text_zone_head_visible,
            text_zone_blade_visible: dissectionRes.text_zone_blade_visible,
          });
          console.debug('[textZones]', {
            text_zones_ready: textZonesRes.text_zones_ready,
            text_present_head: textZonesRes.text_present_head,
            text_present_blade: textZonesRes.text_present_blade,
            ocr_visibility_score: textZonesRes.ocr_visibility_score?.toFixed(2),
            text_contrast_score: textZonesRes.text_contrast_score?.toFixed(2),
          });
          console.debug('[damageSense]', {
            damage_ready: damageRes.damage_ready,
            wear_level: damageRes.wear_level,
            wear_score: damageRes.wear_score?.toFixed(2),
            oxidation_present: damageRes.oxidation_present,
            surface_damage: damageRes.surface_damage,
            damage_confidence: damageRes.damage_confidence?.toFixed(2),
          });
          console.debug('[qualityGateVision]', {
            quality_ready: qualityGateRes.quality_ready,
            quality_score: qualityGateRes.quality_score?.toFixed(2),
            capture_ready: qualityGateRes.capture_ready,
            recommended_action: qualityGateRes.recommended_action,
            reasons: qualityGateRes.reasons,
            positive_signals: qualityGateRes.positive_signals,
          });
          console.debug('[autoCapture]', {
            autoCaptureEnabled,
            auto_capture_ready: autoCaptureRes.auto_capture_ready,
            goodFramesCount: autoCaptureRes.goodFramesCount,
            key_detected: autoCaptureRes.key_detected ?? result?.key_detected,
            quality_score: autoCaptureRes.quality_score ?? qualityGateRes?.quality_score,
            recommended_action: autoCaptureRes.recommended_action ?? qualityGateRes?.recommended_action,
            auto_capture_block_reason: effectiveBlockReason,
          });
          console.debug('[featureFusion]', {
            fusion_ready: featureFusionRes.fusion_ready,
            fusion_confidence: featureFusionRes.fusion_confidence?.toFixed(2),
            ocr_support_score: featureFusionRes.ocr_support_score?.toFixed(2),
            brand_support_score: featureFusionRes.brand_support_score?.toFixed(2),
            ranking_supports: featureFusionRes.ranking_supports,
            ranking_conflicts: featureFusionRes.ranking_conflicts,
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
      const track = stream.getVideoTracks()[0];
      if (track) {
        try {
          const caps = track.getCapabilities?.();
          const hasTorch = caps && caps.torch === true;
          torchStateRef.current = { ...torchStateRef.current, supported: !!hasTorch };
        } catch (_) {
          torchStateRef.current = { ...torchStateRef.current, supported: false };
        }
      }
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

  const handleCapture = async () => {
    const video = videoRef.current;
    if (!video || !ready || disabled || ocrRunning) return;
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) return;

    setOcrRunning(true);
    const scale = Math.min(1, MAX_DIM / Math.max(w, h));
    const cw = Math.round(w * scale);
    const ch = Math.round(h * scale);
    const canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setOcrRunning(false);
      return;
    }
    ctx.drawImage(video, 0, 0, cw, ch);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);

    const lastResult = trackingStateRef.current?.lastResult;
    const trackingSnapshot = makeTrackingSnapshot(lastResult, w, h);
    const glareSnapshot = makeGlareSnapshot(glareResultRef.current);
    const shapeSnapshot = makeShapeSnapshot(shapeResultRef.current, w, h);
    const topdownSnapshot = makeTopdownSnapshot(topdownResultRef.current, w, h);
    const contrastSnapshot = makeContrastSnapshot(contrastResultRef.current);
    const dissectionSnapshot = makeDissectionSnapshot(dissectionResultRef.current, w, h);
    const textZonesSnapshot = makeTextZonesSnapshot(textZonesResultRef.current, w, h);
    const damageSnapshot = makeDamageSnapshot(damageResultRef.current);
    const qualityGateSnapshot = makeQualityGateSnapshot(qualityGateResultRef.current);
    const featureFusionSnapshot = makeFeatureFusionSnapshot(featureFusionResultRef.current);
    const brandReconstructionSnapshot = makeBrandReconstructionSnapshot(brandReconstructionResultRef.current);
    const lightSnapshot = makeLightSnapshot(lightResultRef.current);

    let ocrRealSnapshot = null;
    try {
      const ocrResult = await runZonedOCR(canvas, cw, ch, {
        dissectionResult: dissectionResultRef.current,
        textZonesResult: textZonesResultRef.current,
        contrastResult: contrastResultRef.current,
      });
      ocrRealSnapshot = makeOcrRealSnapshot(ocrResult);
    } catch (_) {
      ocrRealSnapshot = makeOcrRealSnapshot({ ocr_ready: false, ocr_reasons: ['error'] });
    } finally {
      setOcrRunning(false);
    }

    const snapshots = { ...EMPTY_SNAPSHOTS };
    snapshots.tracking = trackingSnapshot || null;
    snapshots.glare = glareSnapshot || null;
    snapshots.shape = shapeSnapshot || null;
    snapshots.topdown = topdownSnapshot || null;
    snapshots.contrast = contrastSnapshot || null;
    snapshots.dissection = dissectionSnapshot || null;
    snapshots.textZones = textZonesSnapshot || null;
    snapshots.damage = damageSnapshot || null;
    snapshots.qualityGate = qualityGateSnapshot || null;
    snapshots.featureFusion = featureFusionSnapshot || null;
    snapshots.brandReconstruction = brandReconstructionSnapshot || null;
    snapshots.light = lightSnapshot || null;
    snapshots.ocrReal = ocrRealSnapshot || null;

    const catalogMatchResult = runCatalogMatching({
      shape: shapeSnapshot,
      topdown: topdownSnapshot,
      dissection: dissectionSnapshot,
      textZones: textZonesSnapshot,
      ocrReal: ocrRealSnapshot,
      brandReconstruction: brandReconstructionSnapshot,
      featureFusion: featureFusionSnapshot,
    });
    snapshots.catalogMatching = makeCatalogMatchingSnapshot(catalogMatchResult) || null;

    if (onCapture) onCapture({ dataUrl, snapshots });
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
  const glareMsg = getGlareGuidanceMessage(glareResult);
  const trackingMsg = r ? getGuidanceMessage(r) : null;
  const shapeMsg = getShapeGuidanceMessage(shapeResult);
  const displayMessage = lightStatus || glareMsg || trackingMsg || shapeMsg;
  // bbox en keyTracking está en coords de análisis 120x90; convertir a % para overlay
  const bboxPercent = r?.bbox && r.key_detected ? {
    left: (r.bbox.x / 120) * 100,
    top: (r.bbox.y / 90) * 100,
    width: (r.bbox.w / 120) * 100,
    height: (r.bbox.h / 90) * 100,
  } : null;

  if (captureRef) captureRef.current = handleCapture;

  const isGuided = mode === 'guided';

  return (
    <div className="flex flex-col gap-2">
      <div className="relative aspect-[4/3] min-h-[200px] rounded-xl overflow-hidden bg-black">
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
                className="absolute border-2 border-[var(--accent)]/50 rounded-lg pointer-events-none transition-opacity"
                style={{
                  left: `${bboxPercent.left}%`,
                  top: `${bboxPercent.top}%`,
                  width: `${bboxPercent.width}%`,
                  height: `${bboxPercent.height}%`,
                }}
                aria-hidden
              />
            )}
            {displayMessage && (
              <div className="absolute bottom-2 left-2 right-2 flex justify-center">
                <span className="text-xs px-3 py-1.5 rounded-lg bg-black/70 text-white backdrop-blur-sm">
                  {displayMessage}
                </span>
              </div>
            )}
          </>
        )}
      </div>
      {!isGuided && (
        <div className="flex gap-2">
          <Button
            variant="primary"
            className="flex-1"
            onClick={handleCapture}
            disabled={!ready || disabled || ocrRunning}
            aria-label={captureLabel}
          >
            {ocrRunning ? 'Procesando…' : captureLabel}
          </Button>
          {hasMultipleCameras && (
            <Button variant="secondary" onClick={switchCamera} aria-label="Cambiar cámara">
              Cambiar cámara
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
