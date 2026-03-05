import React, { memo, useState, useEffect, useCallback } from 'react';
import {
  LogOut,
  ShieldCheck,
  X,
  Cpu,
  Activity,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Trash2,
  RefreshCw,
} from 'lucide-react';
import { copy } from '../utils/copy';
import { getHealth, getMotorHealth } from '../services/api';
import {
  loadJSON,
  saveJSON,
  clearKey,
  getHistoryStats,
  getQueueStats,
  updateHealthStats,
  getHealthStats,
  calcPercentiles,
} from '../utils/storage';
import { Card } from './ui/Card';
import { Pill } from './ui/Pill';
import { AlertBanner } from './ui/AlertBanner';

const SETTINGS_KEY = 'scn_settings';
const HISTORY_KEY = 'scn_history';
const QUEUE_KEY = 'scn_feedback_queue';
const AUTO_REFRESH_MS = 30000;

function formatTimeAgo(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  const now = new Date();
  const diff = Math.floor((now - d) / 1000);
  if (diff < 60) return 'hace un momento';
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`;
  return d.toLocaleDateString();
}

/**
 * Lead Engineer - ProfileModal
 * Panel automático de estado + estadísticas. Sin configuración manual.
 */
function getNetworkStatusLabel(gatewayHealth, motorHealth) {
  if (!gatewayHealth) return null;
  const cause = gatewayHealth.cause;
  if (cause === 'SIN_RED') return 'SIN RED';
  if (cause === 'CORS_OR_DNS') return 'CORS/BLOQUEADO o DNS';
  if (cause === 'GATEWAY_DOWN') return 'GATEWAY DOWN';
  if (gatewayHealth.ok && motorHealth && !motorHealth.ok) return 'MOTOR DOWN';
  return null;
}

export const ProfileModal = memo(({ isOpen, onClose, onLogout, onResetData, onFlushQueue, onViewLast }) => {
  const [gatewayHealth, setGatewayHealth] = useState(null);
  const [motorHealth, setMotorHealth] = useState(null);
  const [modo, setModo] = useState('cliente');
  const [mostrarDebug, setMostrarDebug] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [flushStatus, setFlushStatus] = useState(null);
  const [flushResult, setFlushResult] = useState(null);

  const runHealthChecks = useCallback(async () => {
    const [gw, mot] = await Promise.all([
      getHealth({ timeoutMs: 5000 }),
      getMotorHealth({ timeoutMs: 5000 }),
    ]);
    setGatewayHealth(gw);
    setMotorHealth(mot);
    if (gw?.ok) updateHealthStats(true, gw.ms, mot?.ok ? mot.ms : null);
    else if (gw && !gw.ok) updateHealthStats(false);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setFlushStatus(null);
      setFlushResult(null);
      runHealthChecks();
      const s = loadJSON(SETTINGS_KEY, {});
      setModo(s.modo || 'cliente');
      setMostrarDebug(Boolean(s.mostrar_debug));
    }
  }, [isOpen, runHealthChecks]);

  useEffect(() => {
    if (!isOpen) return;
    const id = setInterval(runHealthChecks, AUTO_REFRESH_MS);
    return () => clearInterval(id);
  }, [isOpen, runHealthChecks]);

  const saveSettings = (updates) => {
    const s = { ...loadJSON(SETTINGS_KEY, {}), ...updates };
    saveJSON(SETTINGS_KEY, s);
  };

  const history = loadJSON(HISTORY_KEY, []);
  const queue = loadJSON(QUEUE_KEY, []);
  const histStats = getHistoryStats(history);
  const queueStats = getQueueStats(queue);
  const healthStats = getHealthStats();
  const latencies = (healthStats.healthLatencies || []).map((h) => h.gw).filter(Boolean);
  const percentiles = calcPercentiles(latencies);
  const networkStatus = getNetworkStatusLabel(gatewayHealth, motorHealth);

  const isOnline =
    gatewayHealth?.ok || (motorHealth != null && motorHealth.ok);
  const lastOk = healthStats.lastHealthOkAt;

  const handleSync = async () => {
    if (!onFlushQueue) return;
    setFlushStatus('loading');
    setFlushResult(null);
    try {
      const res = await onFlushQueue();
      setFlushResult(res);
      setFlushStatus('done');
      onResetData?.();
    } catch (e) {
      setFlushResult({ sent: 0, remaining: queue.length, failed: 1 });
      setFlushStatus('error');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-2xl z-[100] flex items-end animate-in fade-in duration-300">
      <div
        className="w-full bg-[#0a0a0a] rounded-t-[3rem] border-t border-zinc-800 p-8 pt-10 flex flex-col max-h-[95vh] shadow-[0_-20px_50px_rgba(0,0,0,1)] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-12 h-1 bg-zinc-800 rounded-full mx-auto mb-8 opacity-50" />

        <div className="flex justify-between items-center mb-8">
          <div className="flex flex-col">
            <h3 className="text-3xl font-black text-white uppercase tracking-tighter leading-none">
              {copy.profile.title}
            </h3>
            <span className="text-emerald-500 text-[10px] font-black uppercase tracking-[0.3em] mt-2 flex items-center gap-2">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
              SISTEMA OPERATIVO
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={runHealthChecks}
              className="p-2 bg-zinc-900/50 rounded-full border border-zinc-800 text-zinc-500 hover:text-white active:scale-90 transition-all"
              title="Actualizar"
            >
              <RefreshCw size={18} />
            </button>
            <button
              onClick={onClose}
              className="p-3 bg-zinc-900/50 rounded-full border border-zinc-800 text-zinc-500 active:scale-90 active:bg-zinc-800 transition-all"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="flex items-center space-x-6 mb-6 p-6 bg-zinc-900/30 rounded-[2rem] border border-zinc-800/50">
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

        {/* Card Estado */}
        <Card className="mb-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-black text-zinc-500 uppercase tracking-widest">Estado</h4>
            <Pill
              className={
                gatewayHealth?.ok
                  ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400'
                  : 'bg-red-500/20 border-red-500/50 text-red-400'
              }
            >
              {gatewayHealth === null ? (
                <Loader2 size={12} className="animate-spin" />
              ) : gatewayHealth?.ok ? (
                'ONLINE'
              ) : (
                'OFFLINE'
              )}
            </Pill>
          </div>
          {networkStatus && (
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-2">{networkStatus}</p>
          )}
          <div className="space-y-1 text-xs text-[var(--text-secondary)]">
            <div className="flex justify-between">
              <span>Gateway</span>
              <span>
                {gatewayHealth == null
                  ? 'Comprobando…'
                  : gatewayHealth.ok
                    ? `OK ${gatewayHealth.ms} ms`
                    : `ERROR ${gatewayHealth.error || gatewayHealth.status}`}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Motor</span>
              <span>
                {motorHealth == null && gatewayHealth != null
                  ? 'No disponible'
                  : motorHealth == null
                    ? '—'
                    : motorHealth.ok
                      ? `OK ${motorHealth.ms} ms`
                      : `ERROR ${motorHealth.status}`}
              </span>
            </div>
            {(percentiles.p50 != null || percentiles.p95 != null) && (
              <div className="flex justify-between text-[10px] opacity-80">
                <span>p50 / p95</span>
                <span>
                  {percentiles.p50 != null ? `${percentiles.p50} ms` : '—'} /{' '}
                  {percentiles.p95 != null ? `${percentiles.p95} ms` : '—'}
                </span>
              </div>
            )}
            {lastOk && (
              <div className="flex justify-between text-[10px] opacity-80">
                <span>Última verificación OK</span>
                <span>{formatTimeAgo(lastOk)}</span>
              </div>
            )}
            {gatewayHealth?.request_id && mostrarDebug && (
              <div className="text-[10px] font-mono opacity-60 truncate" title={gatewayHealth.request_id}>
                {gatewayHealth.request_id}
              </div>
            )}
          </div>
        </Card>

        {/* Card Modelo */}
        {(gatewayHealth?.body || motorHealth?.body) && (
          <Card className="mb-4">
            <h4 className="text-xs font-black text-zinc-500 uppercase tracking-widest mb-3">Modelo</h4>
            <div className="space-y-1 text-xs text-[var(--text-secondary)]">
              {(motorHealth?.body?.model_version ?? gatewayHealth?.body?.model_version) && (
                <div className="flex justify-between">
                  <span>Versión</span>
                  <span>{motorHealth?.body?.model_version ?? gatewayHealth?.body?.model_version}</span>
                </div>
              )}
              {motorHealth?.body?.labels_count != null && (
                <div className="flex justify-between">
                  <span>Etiquetas</span>
                  <span>{motorHealth.body.labels_count}</span>
                </div>
              )}
              {motorHealth?.body?.model_ready != null && (
                <div className="flex justify-between">
                  <span>Modelo listo</span>
                  <span>{motorHealth.body.model_ready ? 'Sí' : 'No'}</span>
                </div>
              )}
            </div>
          </Card>
        )}

        {/* Card Actividad */}
        <Card className="mb-4">
          <h4 className="text-xs font-black text-zinc-500 uppercase tracking-widest mb-3">Actividad</h4>
          <div className="space-y-1 text-xs text-[var(--text-secondary)]">
            <div className="flex justify-between">
              <span>Total análisis</span>
              <span>{histStats.total}</span>
            </div>
            <div className="flex justify-between">
              <span>Hoy</span>
              <span>{histStats.todayCount}</span>
            </div>
            <div className="flex justify-between">
              <span>Alta / Baja confianza</span>
              <span>
                {histStats.highCount} / {histStats.lowCount}
              </span>
            </div>
            {histStats.avgConfidence != null && (
              <div className="flex justify-between">
                <span>Confianza media</span>
                <span>{(histStats.avgConfidence * 100).toFixed(1)}%</span>
              </div>
            )}
            <div className="flex justify-between">
              <span>Último análisis</span>
              <span>{formatTimeAgo(histStats.lastScanAt)}</span>
            </div>
            {onViewLast && history?.length > 0 && (
              <button
                onClick={() => {
                  onClose();
                  onViewLast();
                }}
                className="w-full py-2 mt-2 rounded-xl bg-zinc-800/50 border border-zinc-700 text-zinc-300 text-sm font-bold hover:bg-zinc-700/50 transition-colors"
              >
                Ver último
              </button>
            )}
            {history?.[0]?.top1 && (
              <div className="pt-1 border-t border-zinc-800 mt-1 text-[10px]">
                Top1: {history[0].top1.brand} {history[0].top1.model}{' '}
                {history[0].top1.confidence != null ? `(${(history[0].top1.confidence * 100).toFixed(0)}%)` : ''}{' '}
                {histStats.lastScanAt ? formatTimeAgo(histStats.lastScanAt) : ''}
              </div>
            )}
          </div>
        </Card>

        {/* Card Feedback */}
        <Card className="mb-4">
          <h4 className="text-xs font-black text-zinc-500 uppercase tracking-widest mb-3">Feedback</h4>
          <div className="space-y-2 text-xs text-[var(--text-secondary)]">
            <div className="flex justify-between">
              <span>Pendientes cola</span>
              <span>{queueStats.pending}</span>
            </div>
            {(healthStats.sentToday != null || healthStats.failedToday > 0 || healthStats.retryStopToday > 0) && (
              <div className="space-y-0.5 text-[10px] opacity-80 pt-1 border-t border-zinc-800">
                <div className="flex justify-between">
                  <span>Hoy enviados</span>
                  <span>{healthStats.sentToday ?? 0}</span>
                </div>
                {healthStats.failedToday > 0 && (
                  <div className="flex justify-between">
                    <span>Hoy fallidos (4xx)</span>
                    <span>{healthStats.failedToday}</span>
                  </div>
                )}
                {healthStats.retryStopToday > 0 && (
                  <div className="flex justify-between">
                    <span>Hoy paradas retry</span>
                    <span>{healthStats.retryStopToday}</span>
                  </div>
                )}
              </div>
            )}
            {queueStats.oldestPendingAt && (
              <div className="flex justify-between">
                <span>Más antiguo</span>
                <span>{formatTimeAgo(queueStats.oldestPendingAt)}</span>
              </div>
            )}
            <button
              onClick={handleSync}
              disabled={queueStats.pending === 0 || flushStatus === 'loading'}
              className="w-full py-2 mt-2 rounded-xl bg-[var(--accent)]/20 border border-[var(--accent)]/50 text-[var(--accent)] text-sm font-bold hover:bg-[var(--accent)]/30 transition-colors disabled:opacity-50"
            >
              {flushStatus === 'loading' ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 size={14} className="animate-spin" /> Sincronizando…
                </span>
              ) : (
                'Sincronizar'
              )}
            </button>
            {flushStatus === 'done' && flushResult && (
              <AlertBanner variant="success">
                Enviados {flushResult.sent}, quedan {flushResult.remaining}
              </AlertBanner>
            )}
            {flushStatus === 'error' && (
              <AlertBanner variant="error">Error al sincronizar</AlertBanner>
            )}
          </div>
        </Card>

        {/* Preferencias */}
        <div className="bg-zinc-900/20 border border-zinc-800 rounded-3xl p-6 mb-4 space-y-4">
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

        {/* Reset */}
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
            className="w-full h-18 bg-red-500/10 border border-red-500/20 rounded-[2rem] flex items-center justify-center space-x-3 text-red-500 active:scale-100 active:bg-red-500 active:text-white transition-all duration-300"
          >
            <LogOut size={22} strokeWidth={2.5} />
            <span className="font-black text-lg uppercase tracking-widest">{copy.profile.logout}</span>
          </button>

          <p className="text-[9px] text-zinc-600 text-center">No se guardan fotos. Solo metadatos.</p>

          <div className="flex items-center justify-center gap-2 opacity-20">
            <ShieldCheck size={12} className="text-white" />
            <p className="text-center text-white text-[9px] font-black uppercase tracking-[0.4em]">
              Conexión segura (HTTPS)
            </p>
          </div>
        </div>
      </div>
    </div>
  );
});
