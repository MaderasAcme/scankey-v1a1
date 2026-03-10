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
import { getApiConfig } from './services/api';
import { loadJSON, saveJSON } from './utils/storage';
import { useAnalyzeFlow } from './hooks/useAnalyzeFlow';
import { useFeedbackFlow } from './hooks/useFeedbackFlow';

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
  const [historyOpenLast, setHistoryOpenLast] = useState(false);

  const handleNavigateToResults = useCallback(() => setScreen('Results'), []);

  const {
    handleAnalyze,
    isAnalyzing,
    attemptCount,
    result,
    capturedPhotos,
    analyzeError,
    clearAnalyzeError,
  } = useAnalyzeFlow(handleNavigateToResults);

  const {
    handleSendFeedback,
    handleQueueFeedback,
    handleFlushQueue,
    feedbackPendingCount,
    refreshFeedbackCount,
  } = useFeedbackFlow();

  const handleNavigate = useCallback((target) => {
    setScreen(target);
    if (target !== 'Scan') clearAnalyzeError();
  }, [clearAnalyzeError]);

  const handleLogout = useCallback(() => {
    clearWorkshopSession();
    const s = loadJSON(SETTINGS_KEY, {});
    saveJSON(SETTINGS_KEY, { ...s, modo: 'cliente' });
    setProfileOpen(false);
    setScreen('Home');
    setRefreshKey((k) => k + 1);
  }, []);

  useEffect(() => {
    if (typeof import.meta !== 'undefined' && import.meta.env?.DEV) {
      const cfg = getApiConfig();
      if (!cfg.hasBase) {
        console.warn('[scankey] Base URL vacía. Configure VITE_GATEWAY_BASE_URL en .env.local');
      } else {
        console.info('[scankey] Dev: base=', cfg.base, '| Smoke: 1) solo A  2) A+B  3) captura mala → quality gate');
      }
    }
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
