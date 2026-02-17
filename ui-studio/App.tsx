
import React, { useState, useEffect, useMemo, useCallback, memo, useRef } from 'react';
import { Navigation } from './components/Navigation';
import { ScanFlow } from './components/ScanFlow';
import { ResultsView } from './components/ResultsView';
import { ProfileModal } from './components/ProfileModal';
import { 
  analyzeKey, saveToHistory, flushFeedback, getHistory, getQueueLength, toUserMessage, getHealth 
} from './services/api';
import { getConnectivitySnapshot, subscribeConnectivity } from './utils/connectivity';
import { storage } from './utils/storage';
import { copy } from './utils/copy';
import { 
  Loader2, Camera, WifiOff, ShieldCheck, RefreshCw, Clock, 
  ChevronLeft, Lock, AlertOctagon, Activity, Zap, Mail, 
  KeyRound, ShieldAlert, ArrowLeft
} from 'lucide-react';

const AuthGate = ({ onLogin, lockoutTime }: any) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);

  useEffect(() => {
    if (lockoutTime) {
      const timer = setInterval(() => {
        const remaining = Math.max(0, Math.ceil((lockoutTime - Date.now()) / 1000));
        setTimeLeft(remaining);
        if (remaining === 0) clearInterval(timer);
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [lockoutTime]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (timeLeft > 0) return;
    setError('');
    setIsSubmitting(true);
    setTimeout(() => {
      const success = onLogin(email, password);
      if (!success) setError('Credenciales incorrectas');
      setIsSubmitting(false);
    }, 600);
  };

  const isLocked = timeLeft > 0;
  const canSubmit = email.length >= 4 && password.length >= 4 && !isSubmitting && !isLocked;

  return (
    <div className="flex-1 flex flex-col bg-black p-8 pt-24 animate-in fade-in duration-500 min-h-screen">
      <div className="mb-14">
        <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center mb-6 shadow-[0_0_30px_rgba(255,255,255,0.15)]">
          <ShieldCheck size={32} className="text-black" />
        </div>
        <h1 className="text-5xl font-black tracking-tighter text-white uppercase">ScanKey</h1>
        <p className="text-zinc-500 mt-2 text-xl font-bold uppercase tracking-tight">Acceso Técnico</p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-2">
          <label className="text-[11px] font-black text-zinc-500 uppercase tracking-[0.2em] ml-1">Email</label>
          <div className="relative">
             <Mail className="absolute left-5 top-1/2 -translate-y-1/2 text-zinc-600" size={20} />
             <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="scankey@scankey.com" className="w-full bg-[#1c1c1e] border border-zinc-800 rounded-2xl py-5 pl-14 pr-6 text-white font-semibold text-lg outline-none focus:border-white/20 transition-all" disabled={isLocked} />
          </div>
        </div>
        <div className="space-y-2">
          <label className="text-[11px] font-black text-zinc-500 uppercase tracking-[0.2em] ml-1">Password</label>
          <div className="relative">
             <KeyRound className="absolute left-5 top-1/2 -translate-y-1/2 text-zinc-600" size={20} />
             <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••" className="w-full bg-[#1c1c1e] border border-zinc-800 rounded-2xl py-5 pl-14 pr-6 text-white font-semibold text-lg outline-none focus:border-white/20 transition-all" disabled={isLocked} />
          </div>
        </div>
        {error && !isLocked && (
          <div className="flex items-center gap-2 text-red-500 px-1">
            <ShieldAlert size={14} />
            <p className="text-[11px] font-black uppercase tracking-widest">{error}</p>
          </div>
        )}
        {isLocked && <p className="text-red-500 text-[11px] font-black uppercase tracking-widest text-center">Bloqueado: {timeLeft}s</p>}
        <button type="submit" disabled={!canSubmit} className={`w-full h-20 rounded-[2rem] font-black text-xl uppercase tracking-widest flex items-center justify-center transition-all ${canSubmit ? 'bg-white text-black shadow-2xl' : 'bg-zinc-900 text-zinc-700 opacity-50'}`}>
          {isSubmitting ? <Loader2 className="animate-spin" /> : 'Entrar'}
        </button>
      </form>
    </div>
  );
};

// @ts-ignore
const HomeScreen = memo(({ onScan, setScreen, isOnline, onOpenProfile }: any) => (
  <div className="flex-1 overflow-y-auto px-6 pt-20 pb-32 bg-black text-white animate-in fade-in duration-500 relative">
    <button 
      onClick={onOpenProfile}
      className="absolute top-16 right-6 w-14 h-14 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center shadow-xl active:scale-90 transition-all z-20 overflow-hidden group"
    >
      <div className="w-full h-full flex items-center justify-center bg-white/5 backdrop-blur-md group-active:bg-white/10 transition-colors">
        <span className="text-white text-sm font-black tracking-tighter">SK</span>
      </div>
    </button>

    <header className="mb-12 flex justify-between items-start pr-16">
      <div>
        <h1 className="text-5xl font-black tracking-tighter">ScanKey</h1>
        <p className="text-zinc-500 mt-2 text-xl font-bold">Gestión profesional</p>
      </div>
    </header>
    
    <div className="space-y-4">
      {!isOnline && (
        <div className="p-5 bg-red-500/10 border border-red-500/20 rounded-3xl flex items-center space-x-4 mb-4">
          <WifiOff size={20} className="text-red-500" />
          <p className="text-red-500 text-sm font-black uppercase tracking-widest">{copy.common.offline}</p>
        </div>
      )}
      <button 
        onClick={onScan} 
        disabled={!isOnline} 
        className={`w-full h-20 rounded-[2.5rem] font-black text-xl uppercase tracking-widest flex items-center justify-center space-x-4 transition-all ${isOnline ? 'bg-white text-black shadow-2xl shadow-white/10' : 'bg-zinc-900 text-zinc-700 opacity-50'}`}
      >
        <Camera size={28} />
        <span>ESCANEAR</span>
      </button>
      <button 
        onClick={() => setScreen('History')} 
        className="w-full h-20 bg-zinc-950 border border-zinc-900 rounded-[2.5rem] font-black text-white uppercase tracking-widest flex items-center justify-center space-x-4 active:bg-zinc-900 transition-all"
      >
        <span>HISTORIAL</span>
      </button>
    </div>

    <div className="mt-16 p-8 bg-zinc-900/20 rounded-[2.5rem] border border-zinc-900/50">
       <div className="flex items-center gap-3 mb-4">
         <Activity size={16} className="text-zinc-600" />
         <span className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">Protocolo de luz</span>
       </div>
       <p className="text-zinc-400 text-sm font-medium leading-relaxed">
         Recuerda que para una identificación >95% es vital un fondo blanco mate y evitar sombras proyectadas.
       </p>
    </div>
  </div>
));

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(storage.get('scankey_auth_ok') === '1');
  const [screen, setScreen] = useState('Home');
  const [isScanning, setIsScanning] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [attemptCount, setAttemptCount] = useState(1);
  const [error, setError] = useState(null);
  const [isOnline, setIsOnline] = useState(getConnectivitySnapshot());
  const [pendingSync, setPendingSync] = useState(getQueueLength());
  
  const analysisResultRef = useRef(null);
  const capturedPhotosRef = useRef(null);

  useEffect(() => subscribeConnectivity(setIsOnline), []);
  useEffect(() => {
    const timer = setInterval(() => setPendingSync(getQueueLength()), 2000);
    return () => clearInterval(timer);
  }, []);

  const handleLogout = useCallback(() => {
    storage.remove('scankey_auth_ok');
    setIsAuthenticated(false);
    setShowProfile(false);
    setScreen('Home');
  }, []);

  /**
   * handleAnalyze
   * Implementa el flujo inmersivo de captura, reintento y navegación forzada a resultados.
   */
  const handleAnalyze = async (photos: any) => {
    setIsScanning(false);
    setIsAnalyzing(true);
    setError(null);
    setAttemptCount(1);
    capturedPhotosRef.current = photos;

    try {
      // Llamada al servicio con reintentos automáticos (Optimized -> Original)
      const result = await analyzeKey(
        { optimized: photos.A.optimized, original: photos.A.original },
        { optimized: photos.B.optimized, original: photos.B.original },
        (n: number) => setAttemptCount(n)
      );

      // Persistencia y navegación SIEMPRE a Results
      saveToHistory(result);
      analysisResultRef.current = result;
      setScreen("Results");
      setIsAnalyzing(false);
    } catch (err: any) {
      console.error("Critical analysis failure:", err);
      // Mantenemos pantalla de error técnica, SIN volver a Home automáticamente.
      setError(err?.message || toUserMessage(err));
      setIsAnalyzing(false);
    }
  };

  /**
   * resetAnalysis
   * Limpia el estado y redirige directamente al flujo de escaneo.
   */
  const resetAnalysis = () => {
    analysisResultRef.current = null;
    capturedPhotosRef.current = null;
    setError(null);
    setIsAnalyzing(false);
    setAttemptCount(1);

    // En vez de Home -> vuelve al flujo de escaneo directo
    setIsScanning(true);
  };

  if (!isAuthenticated) return <AuthGate onLogin={(e, p) => { if(p==='1357'){setIsAuthenticated(true); storage.set('scankey_auth_ok','1'); return true;} return false; }} lockoutTime={0} />;
  
  // Pantalla de Loader o Error Técnico
  if (isAnalyzing || error) return (
    <div className="flex-1 flex flex-col items-center justify-center bg-black p-8 text-center min-h-screen">
      <div className="relative mb-8 w-full max-w-sm">
        {!error ? (
          <div className="flex flex-col items-center space-y-6 animate-in fade-in duration-300">
            <Loader2 className="animate-spin text-white" size={64} strokeWidth={1.5} />
            <div className="space-y-2">
              <h2 className="text-4xl font-black text-white uppercase tracking-tighter">Analizando...</h2>
              <div className="bg-zinc-900 border border-zinc-800 px-4 py-1.5 rounded-full inline-block">
                <span className="text-zinc-400 font-black uppercase tracking-[0.3em] text-[10px]">
                  Intento {attemptCount}/2
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center space-y-6 animate-in zoom-in-95 duration-300">
            <div className="p-6 bg-red-500/10 rounded-full border border-red-500/30">
              <AlertOctagon className="text-red-500" size={64} />
            </div>
            <div className="space-y-2">
              <h2 className="text-4xl font-black text-red-500 uppercase tracking-tighter">Fallo Técnico</h2>
              <p className="text-zinc-500 font-bold text-sm leading-tight px-4">{error}</p>
            </div>
            <div className="flex flex-col w-full space-y-3 pt-4">
              <button 
                onClick={() => capturedPhotosRef.current && handleAnalyze(capturedPhotosRef.current)} 
                className="w-full h-18 bg-white text-black rounded-2xl font-black uppercase tracking-widest active:scale-95 transition-all shadow-xl"
              >
                Reintentar
              </button>
              <button 
                onClick={() => { setError(null); setScreen('Home'); }} 
                className="w-full h-18 bg-zinc-900 text-zinc-500 rounded-2xl font-black uppercase tracking-widest border border-zinc-800 active:scale-95 transition-all"
              >
                Volver a Inicio
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  if (isScanning) return <ScanFlow isOnline={isOnline} onComplete={handleAnalyze} onCancel={() => setIsScanning(false)} onManualCorrection={() => { setIsScanning(false); setScreen('Taller'); }} />;

  return (
    <div className="h-screen w-full flex flex-col bg-black overflow-hidden select-none">
      {screen === 'Home' && (
        <HomeScreen 
          isOnline={isOnline} 
          onScan={() => setIsScanning(true)} 
          setScreen={setScreen} 
          onOpenProfile={() => setShowProfile(true)}
        />
      )}
      {screen === 'Results' && <ResultsView data={analysisResultRef.current} onReset={resetAnalysis} photos={capturedPhotosRef.current} />}
      {screen === 'History' && (
        <div className="p-8 text-white h-full overflow-y-auto bg-black pb-32">
          <button onClick={()=>setScreen('Home')} className="flex items-center space-x-2 text-zinc-500 mb-8 active:scale-95 transition-all">
            <ChevronLeft /> <span>VOLVER</span>
          </button>
          <h2 className="text-4xl font-black uppercase tracking-tighter mb-8">Historial</h2>
          <div className="opacity-20 text-center py-20 font-black uppercase tracking-widest border border-dashed border-zinc-800 rounded-3xl">
            Cargando registros...
          </div>
        </div>
      )}
      {screen === 'Taller' && (
        <div className="flex-1 overflow-y-auto px-6 pt-20 pb-40 bg-black animate-in fade-in duration-500">
          <button onClick={()=>setScreen('Home')} className="flex items-center space-x-2 text-zinc-500 mb-8 active:scale-95 transition-all">
            <ChevronLeft /> <span>VOLVER</span>
          </button>
          <h2 className="text-4xl font-black tracking-tighter text-white mb-10 uppercase">Gestión Taller</h2>
          <div className="p-8 bg-zinc-900/40 rounded-[2.5rem] border border-zinc-800/60">
              <p className="text-[10px] font-black text-zinc-600 uppercase tracking-[0.3em] mb-2">Sync Pendiente</p>
              <p className="text-5xl font-black text-white mb-8">{pendingSync}</p>
              <button 
                onClick={() => flushFeedback().then(() => setPendingSync(0))} 
                disabled={pendingSync === 0 || !isOnline} 
                className={`w-full h-16 rounded-2xl font-black uppercase tracking-widest transition-all active:scale-95 ${pendingSync > 0 && isOnline ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/20' : 'bg-zinc-800 text-zinc-600'}`}
              >
                Sincronizar
              </button>
          </div>
        </div>
      )}
      {screen === 'Guide' && (
        <div className="p-8 text-white h-full overflow-y-auto bg-black pb-32">
          <button onClick={()=>setScreen('Home')} className="flex items-center space-x-2 text-zinc-500 mb-8 active:scale-95 transition-all">
            <ChevronLeft /> <span>VOLVER</span>
          </button>
          <h2 className="text-4xl font-black uppercase tracking-tighter mb-8">Guía de Uso</h2>
          <div className="prose prose-invert">
            <p className="text-zinc-400">Instrucciones para un análisis óptimo...</p>
          </div>
        </div>
      )}
      
      {screen !== 'Results' && <Navigation current={screen} setScreen={setScreen} />}
      
      <ProfileModal 
        isOpen={showProfile} 
        onClose={() => setShowProfile(false)} 
        onLogout={handleLogout} 
      />
    </div>
  );
}
