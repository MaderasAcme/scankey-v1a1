/**
 * Hook useAnalyzeFlow — encapsula flujo de análisis de llave.
 * Quality gate activo, retry con override, navegación a Results, historial, stats.
 */
import { useState, useCallback } from 'react';
import { analyzeKey } from '../services/api';
import { loadJSON, saveJSON } from '../utils/storage';
import { computeQualityGateActiveDecision, mergeQualityGateSnapshots, QUALITY_GATE_ACTIVE_ENABLED_KEY } from '../utils/qualityGateVision';
import { safePushLimited, incrementQualityGateStat } from '../utils/storage';
import { isWorkshopSessionValid } from '../services/auth';

const SETTINGS_KEY = 'scn_settings';
const _isDev = typeof import.meta !== 'undefined' && import.meta.env?.DEV;
const _devLog = (tag, obj) => {
  if (_isDev) console.log(`[scankey] ${tag}`, obj);
};

export function useAnalyzeFlow(onNavigateToResults) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [attemptCount, setAttemptCount] = useState(1);
  const [result, setResult] = useState(null);
  const [capturedPhotos, setCapturedPhotos] = useState(null);
  const [analyzeError, setAnalyzeError] = useState(null);
  const [softAnalyzeWarning, setSoftAnalyzeWarning] = useState(null);

  const handleAnalyze = useCallback(async (photos, opts = {}) => {
    const { qualityOverride } = opts;
    _devLog('handleAnalyze start', { hasA: Boolean(photos?.A), hasB: Boolean(photos?.B), qualityOverride });
    setCapturedPhotos(photos);
    setAnalyzeError(null);
    setSoftAnalyzeWarning(null);
    const settings = loadJSON(SETTINGS_KEY, {});
    const modo = settings.modo || 'cliente';
    const qualityGateActiveEnabled = Boolean(settings[QUALITY_GATE_ACTIVE_ENABLED_KEY]);
    const qgA = photos?.A?.snapshots?.qualityGate;
    const qgB = photos?.B?.snapshots?.qualityGate;
    const qgSnapshot = mergeQualityGateSnapshots(qgA, qgB);
    const canOverride = modo === 'taller' && isWorkshopSessionValid();
    _devLog('quality-gate check', {
      qualityGateActiveEnabled,
      hasQgSnapshot: Boolean(qgSnapshot),
      canOverride,
      qgDecision: qgSnapshot?.quality_decision || qgSnapshot?.recommended_action,
    });

    if (qualityGateActiveEnabled && qgSnapshot) {
      const { shouldBlock, block_reason } = computeQualityGateActiveDecision(qgSnapshot, canOverride);
      if (shouldBlock && !qualityOverride) {
        _devLog('quality-gate blocked before fetch', { block_reason });
        incrementQualityGateStat('block');
        setAnalyzeError({
          type: 'QUALITY_GATE',
          message: 'Calidad insuficiente. Ajusta la llave o activa override.',
          reasons: block_reason ? [block_reason] : [],
          debug: { source: 'vision', block_reason },
        });
        return;
      }
    }

    setIsAnalyzing(true);
    setAttemptCount(1);
    if (qgSnapshot?.soft_warning_message) {
      setSoftAnalyzeWarning(qgSnapshot.soft_warning_message);
    }
    try {
      _devLog('calling analyzeKey', { modo: modo === 'taller' ? 'taller' : undefined });
      const payload = await analyzeKey(photos, {
        modo: modo === 'taller' ? 'taller' : undefined,
        qualityOverride: Boolean(qualityOverride),
        onAttempt: (attempt, total) => setAttemptCount(attempt),
      });
      setResult(payload);
      _devLog('analyze success, navigating to Results', {
        request_id: payload?.request_id,
        results_count: payload?.results?.length,
      });
      onNavigateToResults?.();
      const top1 = payload?.results?.[0];
      const historyItem = {
        input_id: payload?.input_id,
        timestamp: payload?.timestamp,
        request_id: payload?.request_id,
        top1: top1
          ? {
              id_model_ref: top1.id_model_ref,
              brand: top1.brand,
              model: top1.model,
              type: top1.type,
              confidence: top1.confidence,
            }
          : null,
        low_confidence: payload?.low_confidence,
        high_confidence: payload?.high_confidence,
        manufacturer_hint: payload?.manufacturer_hint,
        debug: payload?.debug,
        results: payload?.results?.slice(0, 3),
      };
      safePushLimited('scn_history', historyItem, 100);
      if (payload?.debug?.override_used) incrementQualityGateStat('override');
      if (payload?.debug?.quality_warning) incrementQualityGateStat('warning');
    } catch (e) {
      _devLog('handleAnalyze error', { message: e?.message, code: e?.code });
      if (e.code === 'QUALITY_GATE') {
        incrementQualityGateStat('block');
        setAnalyzeError({
          type: 'QUALITY_GATE',
          message: e.message || 'Calidad insuficiente',
          reasons: e.reasons || [],
          debug: e.debug || {},
        });
      } else {
        setAnalyzeError(e.message || 'Error al analizar');
      }
    } finally {
      setIsAnalyzing(false);
      setAttemptCount(1);
    }
  }, [onNavigateToResults]);

  const clearAnalyzeError = useCallback(() => {
    setAnalyzeError(null);
    setSoftAnalyzeWarning(null);
  }, []);

  return {
    handleAnalyze,
    isAnalyzing,
    attemptCount,
    result,
    capturedPhotos,
    analyzeError,
    softAnalyzeWarning,
    clearAnalyzeError,
  };
}
