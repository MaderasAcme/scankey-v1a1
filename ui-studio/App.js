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
import { analyzeKey } from './services/api';

const SCREENS = {
  home: HomeScreen,
  Scan: ScanFlowScreen,
  Results: ResultsScreen,
  History: HistoryScreen,
  Taller: TallerScreen,
  Guide: GuideScreen,
};

/**
 * App — shell con máquina de estados: screen, isAnalyzing, attemptCount, result
 */
export default function App() {
  const [screen, setScreen] = useState('Home');
  const [profileOpen, setProfileOpen] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [attemptCount, setAttemptCount] = useState(1);
  const [result, setResult] = useState(null);
  const [analyzeError, setAnalyzeError] = useState(null);

  const handleNavigate = useCallback((target) => {
    setScreen(target);
    if (target === 'Results' && !result) setResult(null);
  }, [result]);

  const handleAnalyze = useCallback(async ({ frontDataUrl, backDataUrl }) => {
    setIsAnalyzing(true);
    setAttemptCount(1);
    setAnalyzeError(null);
    try {
      const payload = await analyzeKey({
        frontDataUrl,
        backDataUrl: backDataUrl || undefined,
        onAttempt: (attempt) => setAttemptCount(attempt),
      });
      setResult(payload);
      setScreen('Results');
    } catch (e) {
      setAnalyzeError(e.message || 'Error al analizar');
    } finally {
      setIsAnalyzing(false);
      setAttemptCount(1);
    }
  }, []);

  const handleCorrect = useCallback(() => {
    // Placeholder: abrir modal de corrección cuando exista
  }, []);

  const handleLogout = useCallback(() => {
    setProfileOpen(false);
  }, []);

  const ScreenComponent = SCREENS[screen] || SCREENS.home;

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)] flex flex-col pb-20">
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
          />
        )}
        {screen === 'Results' && (
          <ResultsScreen
            result={result}
            onBack={() => setScreen('Home')}
            onCorrect={handleCorrect}
          />
        )}
        {screen === 'History' && (
          <HistoryScreen onBack={() => setScreen('Home')} />
        )}
        {screen === 'Taller' && (
          <TallerScreen onBack={() => setScreen('Home')} />
        )}
        {screen === 'Guide' && (
          <GuideScreen onBack={() => setScreen('Home')} />
        )}
      </main>
      <Navigation current={screen} setScreen={setScreen} />
      {isAnalyzing && <LoaderOverlay attempt={attemptCount} total={2} />}
      <ProfileModal isOpen={profileOpen} onClose={() => setProfileOpen(false)} onLogout={handleLogout} />
    </div>
  );
}
