import React, { useState, useCallback } from 'react';
import { Navigation } from './components/Navigation';
import { LoaderOverlay } from './components/ui/LoaderOverlay';
import { HomeScreen } from './screens/HomeScreen';
import { ScanFlowScreen } from './screens/ScanFlowScreen';
import { ResultsScreen } from './screens/ResultsScreen';
import { HistoryScreen } from './screens/HistoryScreen';
import { TallerScreen } from './screens/TallerScreen';
import { GuideScreen } from './screens/GuideScreen';
import { ProfileModal } from './screens/ProfileModal';
import { AlertBanner } from './components/ui/AlertBanner';
import {
  analyzeKey,
  getApiConfig,
  sendFeedback,
  enqueueFeedback,
  getFeedbackQueue,
  flushFeedbackQueue,
} from './services/api';
import { safePushLimited, updateHistoryByInputId } from './utils/storage';

const SCREENS = {
  home: HomeScreen,
  Scan: ScanFlowScreen,
  Results: ResultsScreen,
  History: HistoryScreen,
  Taller: TallerScreen,
  Guide: GuideScreen,
};

/**
 * App — shell con máquina de estados: screen, isAnalyzing, attemptCount, result, capturedPhotos
 * capturedPhotos en memoria (NO localStorage).
 */
export default function App() {
  const [screen, setScreen] = useState('Home');
  const [profileOpen, setProfileOpen] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [attemptCount, setAttemptCount] = useState(1);
  const [result, setResult] = useState(null);
  const [capturedPhotos, setCapturedPhotos] = useState(null);
  const [analyzeError, setAnalyzeError] = useState(null);
  const [feedbackPendingCount, setFeedbackPendingCount] = useState(0);

  const refreshFeedbackCount = useCallback(() => {
    setFeedbackPendingCount(getFeedbackQueue().length);
  }, []);

  const handleNavigate = useCallback((target) => {
    setScreen(target);
    if (target === 'Results' && !result) setResult(null);
    if (target !== 'Scan') setAnalyzeError(null);
  }, [result]);

  const handleAnalyze = useCallback(async (photos) => {
    setCapturedPhotos(photos);
    setIsAnalyzing(true);
    setAttemptCount(1);
    setAnalyzeError(null);
    try {
      const payload = await analyzeKey(photos, {
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
    } catch (e) {
      setAnalyzeError(e.message || 'Error al analizar');
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

  const handleQueueFeedback = useCallback((payload) => {
    enqueueFeedback({
      ...payload,
      created_at: new Date().toISOString(),
    });
    updateHistoryByInputId(payload.input_id, {
      selected_rank: payload.selected_rank,
      correction_used: Boolean(payload.correction),
    });
    setFeedbackPendingCount(getFeedbackQueue().length);
  }, []);

  const handleFlushQueue = useCallback(async () => {
    const res = await flushFeedbackQueue({
      onProgress: () => setFeedbackPendingCount(getFeedbackQueue().length),
      onSent: (p) => updateHistoryByInputId(p.input_id, { selected_rank: p.selected_rank, correction_used: Boolean(p.correction) }),
    });
    setFeedbackPendingCount(getFeedbackQueue().length);
    return res;
  }, []);

  const handleLogout = useCallback(() => {
    setProfileOpen(false);
  }, []);

  const ScreenComponent = SCREENS[screen] || SCREENS.home;

  const apiConfig = getApiConfig();

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)] flex flex-col pb-20">
      {!apiConfig.hasBase && (
        <div className="m-4">
          <AlertBanner variant="warn">
            API no configurada. Configura VITE_GATEWAY_BASE_URL o entra en Perfil para indicar la URL del gateway.
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
            analyzeError={analyzeError}
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
          />
        )}
        {screen === 'History' && (
          <HistoryScreen onBack={() => setScreen('Home')} />
        )}
        {screen === 'Taller' && (
          <TallerScreen
            onBack={() => setScreen('Home')}
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
      />
    </div>
  );
}
