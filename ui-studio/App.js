import React, { useState, useCallback, useEffect } from 'react';
import { Navigation } from './components/Navigation';
import { LoaderOverlay } from './components/ui/LoaderOverlay';
import { HomeScreen } from './screens/HomeScreen';
import { ScanFlowScreen } from './screens/ScanFlowScreen';
import { ResultsScreen } from './screens/ResultsScreen';
import { HistoryScreen } from './screens/HistoryScreen';
import { TallerScreen } from './screens/TallerScreen';
import { GuideScreen } from './screens/GuideScreen';
import { LoginScreen } from './screens/LoginScreen';
import { ProfileModal } from './screens/ProfileModal';
import { isWorkshopSessionValid, clearWorkshopSession } from './services/auth';
import { AlertBanner } from './components/ui/AlertBanner';
import {
  analyzeKey,
  getApiConfig,
  sendFeedback,
  enqueueFeedback,
  getFeedbackQueue,
  flushFeedbackQueue,
} from './services/api';
import { safePushLimited, updateHistoryByInputId, loadJSON, saveJSON, incrementQualityGateStat } from './utils/storage';
import { computeQualityGateActiveDecision, mergeQualityGateSnapshots, QUALITY_GATE_ACTIVE_ENABLED_KEY } from './utils/qualityGateVision';

const SETTINGS_KEY = 'scn_settings';

const SCREENS = {
  home: HomeScreen,
  Scan: ScanFlowScreen,
  Results: ResultsScreen,
  History: HistoryScreen,
  Taller: TallerScreen,
  Guide: GuideScreen,
};

/**
 * App — shell con máquina de estados.
 * Login como puerta de entrada: sin sesión válida solo LoginScreen.
 * Con sesión válida: app completa (Home, Scan, History, Taller, Guide, Profile).
 */
export default function App() {
  const [refreshKey, setRefreshKey] = useState(0);
  const sessionValid = isWorkshopSessionValid();

  const [screen, setScreen] = useState('Home');
  const [profileOpen, setProfileOpen] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [attemptCount, setAttemptCount] = useState(1);
  const [result, setResult] = useState(null);
  const [capturedPhotos, setCapturedPhotos] = useState(null);
  const [analyzeError, setAnalyzeError] = useState(null);
  const [feedbackPendingCount, setFeedbackPendingCount] = useState(0);
  const [historyOpenLast, setHistoryOpenLast] = useState(false);

  const refreshFeedbackCount = useCallback(() => {
    setFeedbackPendingCount(getFeedbackQueue().length);
  }, []);

  const handleNavigate = useCallback((target) => {
    setScreen(target);
    if (target === 'Results' && !result) setResult(null);
    if (target !== 'Scan') setAnalyzeError(null);
  }, [result]);

  const handleAnalyze = useCallback(async (photos, opts = {}) => {
    const { qualityOverride } = opts;
    setCapturedPhotos(photos);
    setAnalyzeError(null);
    const settings = loadJSON(SETTINGS_KEY, {});
    const modo = settings.modo || 'cliente';
    const qualityGateActiveEnabled = Boolean(settings[QUALITY_GATE_ACTIVE_ENABLED_KEY]);
    const qgA = photos?.A?.snapshots?.qualityGate;
    const qgB = photos?.B?.snapshots?.qualityGate;
    const qgSnapshot = mergeQualityGateSnapshots(qgA, qgB);
    const canOverride = modo === 'taller' && isWorkshopSessionValid();

    if (qualityGateActiveEnabled && qgSnapshot) {
      const { shouldBlock, block_reason } = computeQualityGateActiveDecision(qgSnapshot, canOverride);
      if (shouldBlock && !qualityOverride) {
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
    try {
      const payload = await analyzeKey(photos, {
        modo: modo === 'taller' ? 'taller' : undefined,
        qualityOverride: Boolean(qualityOverride),
        onAttempt: (attempt, total) => setAttemptCount(attempt),
      });
      setResult(payload);
      setScreen('Results');
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
  }, []);

  const handleSendFeedback = useCallback(async (payload) => {
    await sendFeedback(payload);
    const inputId = payload.input_id;
    updateHistoryByInputId(inputId, {
      selected_rank: payload.selected_rank,
      correction_used: Boolean(payload.correction),
    });
  }, []);

  const handleQueueFeedback = useCallback(async (payload) => {
    await enqueueFeedback({
      ...payload,
      created_at: new Date().toISOString(),
    });
    updateHistoryByInputId(payload.input_id, {
      selected_rank: payload.selected_rank,
      correction_used: Boolean(payload.correction),
    });
    setFeedbackPendingCount(getFeedbackQueue().length);
  }, []);

  const handleFlushQueue = useCallback(async (opts = {}) => {
    const res = await flushFeedbackQueue({
      onProgress: (sent, remaining) => {
        setFeedbackPendingCount(getFeedbackQueue().length);
        opts.onProgress?.(sent, remaining);
      },
      onSent: (p) => updateHistoryByInputId(p.input_id, { selected_rank: p.selected_rank, correction_used: Boolean(p.correction) }),
    });
    setFeedbackPendingCount(getFeedbackQueue().length);
    return res;
  }, []);

  const handleLogout = useCallback(() => {
    clearWorkshopSession();
    const s = loadJSON(SETTINGS_KEY, {});
    saveJSON(SETTINGS_KEY, { ...s, modo: 'cliente' });
    setProfileOpen(false);
    setScreen('Home');
    setRefreshKey((k) => k + 1);
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      if (!isWorkshopSessionValid()) {
        clearWorkshopSession();
        const s = loadJSON(SETTINGS_KEY, {});
        saveJSON(SETTINGS_KEY, { ...s, modo: 'cliente' });
        setProfileOpen(false);
        setScreen('Home');
        setRefreshKey((k) => k + 1);
      }
    }, 30000);
    return () => clearInterval(id);
  }, []);

  const apiConfig = getApiConfig();

  if (!sessionValid) {
    return (
      <div className="min-h-screen bg-[var(--bg)] text-[var(--text)] flex flex-col">
        <LoginScreen
          key={refreshKey}
          onLoginSuccess={() => setRefreshKey((k) => k + 1)}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)] flex flex-col pb-20">
      {!apiConfig.hasBase && (
        <div className="m-4">
          <AlertBanner variant="warn">
            API no configurada. Configura VITE_GATEWAY_BASE_URL en .env para conectar al gateway.
          </AlertBanner>
        </div>
      )}
      <main className="flex-1">
        {screen === 'Home' && (
          <HomeScreen
            onNavigate={handleNavigate}
            onOpenProfile={() => setProfileOpen(true)}
          />
        )}
        {screen === 'Scan' && (
          <ScanFlowScreen
            onBack={() => setScreen('Home')}
            onAnalyze={handleAnalyze}
            onRetryWithOverride={
              capturedPhotos
                ? () => handleAnalyze(capturedPhotos, { qualityOverride: true })
                : undefined
            }
            analyzeError={analyzeError}
            capturedPhotos={capturedPhotos}
          />
        )}
        {screen === 'Results' && (
          <ResultsScreen
            result={result}
            capturedPhotos={capturedPhotos}
            onBack={() => setScreen('Home')}
            onConfirm={handleSendFeedback}
            onQueueFeedback={handleQueueFeedback}
            feedbackPending={feedbackPendingCount > 0}
            modoTaller={loadJSON(SETTINGS_KEY, {}).modo === 'taller'}
          />
        )}
        {screen === 'History' && (
          <HistoryScreen
            onBack={() => {
              setHistoryOpenLast(false);
              setScreen('Home');
            }}
            openLast={historyOpenLast}
            onConsumeOpenLast={() => setHistoryOpenLast(false)}
          />
        )}
        {screen === 'Taller' && (
          <TallerScreen
            onBack={() => setScreen('Home')}
            onNavigateToHistory={() => setScreen('History')}
            onFlushQueue={handleFlushQueue}
            feedbackPendingCount={feedbackPendingCount}
            onRefreshFeedbackCount={refreshFeedbackCount}
          />
        )}
        {screen === 'Guide' && (
          <GuideScreen onBack={() => setScreen('Home')} />
        )}
      </main>
      <Navigation current={screen} setScreen={setScreen} />
      {isAnalyzing && <LoaderOverlay attempt={attemptCount} total={2} />}
      <ProfileModal
        isOpen={profileOpen}
        onClose={() => setProfileOpen(false)}
        onLogout={handleLogout}
        onResetData={refreshFeedbackCount}
        onFlushQueue={handleFlushQueue}
        onViewLast={() => {
          setProfileOpen(false);
          setScreen('History');
          setHistoryOpenLast(true);
        }}
      />
    </div>
  );
}
