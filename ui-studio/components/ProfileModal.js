import React, { memo, useState, useEffect } from 'react';
import { LogOut, ShieldCheck, X, Cpu, Key, Globe, Activity, Loader2, CheckCircle2, AlertCircle, Eye, EyeOff, Trash2 } from 'lucide-react';
import { copy } from '../utils/copy';
import { getApiBase, setApiBase, getApiKey, setApiKey, getHealth } from '../services/api';
import { loadJSON, saveJSON, clearKey } from '../utils/storage';

const SETTINGS_KEY = 'scn_settings';
const HISTORY_KEY = 'scn_history';
const QUEUE_KEY = 'scn_feedback_queue';

/**
 * Lead Engineer - ProfileModal
 * Preferencias locales (modo, debug, reset). No guarda fotos.
 */
export const ProfileModal = memo(({ isOpen, onClose, onLogout, onResetData }) => {
  const [apiKey, setApiKeyLocal] = useState(getApiKey());
  const [apiBase, setApiBaseLocal] = useState(getApiBase());
  const [showApiKey, setShowApiKey] = useState(false);
  const [healthStatus, setHealthStatus] = useState('idle');
  const [healthError, setHealthError] = useState('');
  const [modo, setModo] = useState('cliente');
  const [mostrarDebug, setMostrarDebug] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setApiKeyLocal(getApiKey());
      setApiBaseLocal(getApiBase());
      setHealthStatus('idle');
      setHealthError('');
      const s = loadJSON(SETTINGS_KEY, {});
      setModo(s.modo || 'cliente');
      setMostrarDebug(Boolean(s.mostrar_debug));
    }
  }, [isOpen]);

  const saveSettings = (updates) => {
    const s = { ...loadJSON(SETTINGS_KEY, {}), ...updates };
    saveJSON(SETTINGS_KEY, s);
  };

  const handleApiKeyChange = (val) => {
    setApiKeyLocal(val);
    setApiKey(val);
  };

  const handleApiBaseChange = (val) => {
    setApiBaseLocal(val);
    setApiBase(val);
  };

  const testHealth = async () => {
    setHealthStatus('loading');
    setHealthError('');
    try {
      await getHealth();
      setHealthStatus('ok');
    } catch (e) {
      setHealthStatus('error');
      setHealthError(e.message || 'Fallo de conexión');
    }
  };

  const maskedKey = apiKey ? `${'*'.repeat(Math.max(0, apiKey.length - 4))}${apiKey.slice(-4)}` : '';

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-2xl z-[100] flex items-end animate-in fade-in duration-300">
      <div
        className="w-full bg-[#0a0a0a] rounded-t-[3rem] border-t border-zinc-800 p-8 pt-10 flex flex-col max-h-[95vh] shadow-[0_-20px_50px_rgba(0,0,0,1)] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-12 h-1 bg-zinc-800 rounded-full mx-auto mb-8 opacity-50" />

        <div className="flex justify-between items-center mb-10">
          <div className="flex flex-col">
            <h3 className="text-3xl font-black text-white uppercase tracking-tighter leading-none">
              {copy.profile.title}
            </h3>
            <span className="text-emerald-500 text-[10px] font-black uppercase tracking-[0.3em] mt-2 flex items-center gap-2">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
              SISTEMA OPERATIVO
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-3 bg-zinc-900/50 rounded-full border border-zinc-800 text-zinc-500 active:scale-90 active:bg-zinc-800 transition-all"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex items-center space-x-6 mb-8 p-6 bg-zinc-900/30 rounded-[2rem] border border-zinc-800/50">
          <div className="w-20 h-20 bg-white rounded-3xl flex items-center justify-center shadow-[0_0_30px_rgba(255,255,255,0.15)] rotate-3">
            <span className="text-black text-3xl font-black -rotate-3">SK</span>
          </div>
          <div className="flex-1">
            <h4 className="text-2xl font-black text-white uppercase tracking-tight">{copy.profile.operator}</h4>
            <div className="flex items-center gap-2 mt-1">
              <Cpu size={12} className="text-zinc-600" />
              <span className="text-zinc-500 font-black text-[10px] uppercase tracking-[0.2em]">{copy.profile.id}</span>
            </div>
          </div>
        </div>

        <div className="bg-zinc-900/20 border border-zinc-800 rounded-3xl p-6 mb-8 space-y-6">
          <div className="flex items-center space-x-3">
            <ShieldCheck size={18} className="text-zinc-500" />
            <h4 className="text-[11px] font-black text-zinc-500 uppercase tracking-widest">Configuración Técnica</h4>
          </div>

          <div className="space-y-2">
            <label className="text-[9px] font-black text-zinc-600 uppercase tracking-[0.2em] ml-1 flex items-center gap-2">
              <Globe size={10} /> BASE URL
            </label>
            <input
              type="text"
              value={apiBase}
              onChange={(e) => handleApiBaseChange(e.target.value)}
              placeholder="https://scankey-gateway-..."
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-4 px-5 text-white font-mono text-xs outline-none focus:border-emerald-500/50 transition-all"
            />
          </div>

          <div className="space-y-2">
            <label className="text-[9px] font-black text-zinc-600 uppercase tracking-[0.2em] ml-1 flex items-center gap-2">
              <Key size={10} /> API KEY
            </label>
            <div className="relative">
              <input
                type={showApiKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => handleApiKeyChange(e.target.value)}
                placeholder="Introduce API Key..."
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-4 px-5 pr-12 text-white font-mono text-xs outline-none focus:border-emerald-500/50 transition-all"
              />
              <button
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-600 active:text-white"
              >
                {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {apiKey && !showApiKey && (
              <p className="text-[8px] text-zinc-700 font-mono tracking-widest mt-1 ml-1 uppercase">
                IDENTIFICADOR: {maskedKey}
              </p>
            )}
          </div>

          <button
            onClick={testHealth}
            disabled={healthStatus === 'loading'}
            className="w-full flex items-center justify-between p-4 bg-zinc-900 rounded-2xl border border-zinc-800 active:scale-[0.98] transition-all"
          >
            <div className="flex items-center gap-3">
              <Activity size={16} className="text-zinc-500" />
              <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Probar Conexión</span>
            </div>
            <div>
              {healthStatus === 'loading' && <Loader2 size={16} className="animate-spin text-zinc-500" />}
              {healthStatus === 'ok' && <CheckCircle2 size={16} className="text-emerald-500" />}
              {healthStatus === 'error' && <AlertCircle size={16} className="text-red-500" />}
              {healthStatus === 'idle' && <ChevronRight size={16} className="text-zinc-700" />}
            </div>
          </button>

          {healthStatus === 'error' && (
            <p className="text-[9px] text-red-500 font-black uppercase tracking-widest px-2">{healthError}</p>
          )}
        </div>

        <div className="bg-zinc-900/20 border border-zinc-800 rounded-3xl p-6 mb-6 space-y-4">
          <h4 className="text-[11px] font-black text-zinc-500 uppercase tracking-widest">Preferencias</h4>
          <div className="flex justify-between items-center">
            <span className="text-sm text-zinc-400">Modo</span>
            <select
              value={modo}
              onChange={(e) => {
                const v = e.target.value;
                setModo(v);
                saveSettings({ modo: v });
              }}
              className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white"
            >
              <option value="cliente">Cliente</option>
              <option value="taller">Taller</option>
            </select>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-zinc-400">Mostrar debug</span>
            <input
              type="checkbox"
              checked={mostrarDebug}
              onChange={(e) => {
                const v = e.target.checked;
                setMostrarDebug(v);
                saveSettings({ mostrar_debug: v });
              }}
              className="rounded"
            />
          </div>
        </div>

        <div className="space-y-3 mb-6">
          {showResetConfirm ? (
            <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4">
              <p className="text-sm text-red-400 mb-2">¿Borrar historial, cola de feedback y preferencias?</p>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    clearKey(HISTORY_KEY);
                    clearKey(QUEUE_KEY);
                    clearKey(SETTINGS_KEY);
                    setShowResetConfirm(false);
                    onResetData?.();
                  }}
                  className="flex-1 py-2 rounded-xl bg-red-500/30 text-red-400 text-sm font-bold"
                >
                  Sí, borrar
                </button>
                <button
                  onClick={() => setShowResetConfirm(false)}
                  className="flex-1 py-2 rounded-xl bg-zinc-800 text-zinc-400 text-sm"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowResetConfirm(true)}
              className="w-full flex items-center justify-center gap-2 py-3 border border-zinc-700 rounded-2xl text-zinc-400 hover:text-white transition-colors"
            >
              <Trash2 size={18} />
              <span className="text-sm font-bold uppercase tracking-wider">Borrar datos locales</span>
            </button>
          )}
        </div>

        <div className="mt-auto space-y-4 pb-4">
          <button
            onClick={onLogout}
            className="w-full h-18 bg-red-500/10 border border-red-500/20 rounded-[2rem] flex items-center justify-center space-x-3 text-red-500 active:bg-red-500 active:text-white transition-all duration-300"
          >
            <LogOut size={22} strokeWidth={2.5} />
            <span className="font-black text-lg uppercase tracking-widest">{copy.profile.logout}</span>
          </button>

          <p className="text-[9px] text-zinc-600 text-center">No se guardan fotos. Solo metadatos.</p>

          <div className="flex items-center justify-center gap-2 opacity-20">
            <ShieldCheck size={12} className="text-white" />
            <p className="text-center text-white text-[9px] font-black uppercase tracking-[0.4em]">
              SESIÓN ENCRIPTADA AES-256
            </p>
          </div>
        </div>
      </div>
    </div>
  );
});

const ChevronRight = ({ size, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="m9 18 6-6-6-6"/>
  </svg>
);
