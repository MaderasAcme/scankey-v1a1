import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Download, Copy, Loader2, ChevronRight } from 'lucide-react';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { AlertBanner } from '../components/ui/AlertBanner';
import {
  getHealth,
  getMotorHealth,
  getDeployPing,
  getFeedbackQueue,
} from '../services/api';
import { loadJSON } from '../utils/storage';
import {
  getDailyStats,
  getModelFrequency,
  getRiskStats,
  getLatencyStatsFromSettings,
  getQueueOpsStats,
  getQueueStats,
  updateHealthStats,
  sanitizeStoredObject,
} from '../utils/storage';

const HISTORY_KEY = 'scn_history';
const QUEUE_KEY = 'scn_feedback_queue';
const SETTINGS_KEY = 'scn_settings';

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

function formatTime(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  } catch (e) {
    return String(iso);
  }
}

function formatTop1(top1) {
  if (!top1) return '—';
  const parts = [(top1.brand || top1.model || top1.type || '').toUpperCase()].filter(Boolean);
  if (top1.model && top1.model !== top1.brand) parts.push(String(top1.model).toUpperCase());
  return parts.join(' ') || top1.type || top1.id_model_ref || '—';
}

/** Sanitiza history item: solo metadatos, sin dataURL ni fotos */
function sanitizeHistoryItem(it) {
  if (!it || typeof it !== 'object') return it;
  const out = sanitizeStoredObject(it);
  return out;
}

/**
 * Exporta diagnóstico JSON (sin fotos, sin secretos)
 */
function buildDiagnosticExport(meta) {
  const {
    timestamp,
    origin,
    deployPing,
    healthGw,
    healthMotor,
    settings,
    historyLast20,
    queueCount,
    queueSample,
    modelVersion,
    labelsCount,
    todayStats,
    riskStats,
    topModels,
    latencyStats,
    queueOpsStats,
  } = meta;
  return {
    timestamp,
    origin,
    build_id: deployPing?.commit || null,
    deploy_ping: deployPing?.deployPing || null,
    health: {
      gateway: healthGw
        ? { ok: healthGw.ok, status: healthGw.status, ms: healthGw.ms, last_check: timestamp }
        : null,
      motor: healthMotor
        ? { ok: healthMotor.ok, status: healthMotor.status, ms: healthMotor.ms }
        : null,
    },
    latency: latencyStats || {},
    feedback_ops: queueOpsStats || {},
    pending_feedback_count: queueCount ?? 0,
    pending_sample: queueSample || null,
    model_version: modelVersion ?? null,
    labels_count: labelsCount ?? null,
    today: todayStats || {},
    risk: riskStats || {},
    top_models: topModels || [],
    last_20_history: historyLast20 || [],
  };
}

/**
 * TallerScreen — panel operativo diario (métricas reales, export diagnóstico)
 */
export function TallerScreen({
  onBack,
  onNavigateToHistory,
  onFlushQueue,
  feedbackPendingCount = 0,
  onRefreshFeedbackCount,
}) {
  const [loadingHealth, setLoadingHealth] = useState(false);
  const [healthGw, setHealthGw] = useState(null);
  const [healthMotor, setHealthMotor] = useState(null);
  const [deployInfo, setDeployInfo] = useState(null);
  const [history, setHistory] = useState([]);
  const [queue, setQueue] = useState([]);
  const [settings, setSettings] = useState({});
  const [flushState, setFlushState] = useState({
    running: false,
    sent: 0,
    remaining: 0,
    lastError: null,
  });
  const [copySuccess, setCopySuccess] = useState(false);

  const todayKey = new Date().toISOString().slice(0, 10);
  const todayStats = getDailyStats(history, todayKey);
  const riskStats = getRiskStats(history, todayKey);
  const topModels = getModelFrequency(history, todayKey, 10);
  const latencyStats = getLatencyStatsFromSettings(settings);
  const queueOpsStats = getQueueOpsStats(settings);
  const queueStats = getQueueStats(queue);
  const queueLen = feedbackPendingCount > 0 ? feedbackPendingCount : queue.length;

  const runHealthChecks = useCallback(async () => {
    setLoadingHealth(true);
    try {
      const [gw, mot] = await Promise.all([
        getHealth({ timeoutMs: 5000 }),
        getMotorHealth({ timeoutMs: 5000 }),
      ]);
      setHealthGw(gw);
      setHealthMotor(mot);
      if (gw?.ok) updateHealthStats(true, gw.ms, mot?.ok ? mot.ms : null);
      else if (gw && !gw.ok) updateHealthStats(false);
      const deploy = await getDeployPing();
      setDeployInfo(deploy);
    } catch (_) {
      // Ya manejado en getHealth/getMotorHealth
    } finally {
      setLoadingHealth(false);
    }
  }, []);

  const loadFromStorage = useCallback(() => {
    setHistory(loadJSON(HISTORY_KEY, []));
    setQueue(loadJSON(QUEUE_KEY, []));
    setSettings(loadJSON(SETTINGS_KEY, {}));
    onRefreshFeedbackCount?.();
  }, [onRefreshFeedbackCount]);

  useEffect(() => {
    runHealthChecks();
    loadFromStorage();
  }, [runHealthChecks, loadFromStorage]);

  const handleRefresh = () => {
    runHealthChecks();
    loadFromStorage();
  };

  const handleFlush = async () => {
    setFlushState({ running: true, sent: 0, remaining: queueLen, lastError: null });
    try {
      const res = await onFlushQueue({
        onProgress: (sent, remaining) =>
          setFlushState((s) => ({ ...s, sent, remaining })),
      });
      setFlushState({
        running: false,
        sent: res.sent,
        remaining: res.remaining,
        lastError: null,
      });
      loadFromStorage();
    } catch (e) {
      setFlushState({
        running: false,
        sent: 0,
        remaining: queueLen,
        lastError: e?.message || 'Error al sincronizar',
      });
    }
  };

  const handleExportDiagnostic = () => {
    const last20 = (history || []).slice(0, 20).map(sanitizeHistoryItem);
    const q = loadJSON(QUEUE_KEY, []);
    const sample = q.length > 0
      ? sanitizeStoredObject({
          input_id: q[0].input_id,
          created_at: q[0].created_at,
          request_id: q[0].request_id ? '(presente)' : null,
        })
      : null;
    const motorBody = healthMotor?.body;
    const gwBody = healthGw?.body;
    const diag = buildDiagnosticExport({
      timestamp: new Date().toISOString(),
      origin: typeof location !== 'undefined' ? location.hostname : '—',
      deployPing: deployInfo,
      healthGw,
      healthMotor,
      settings,
      historyLast20: last20,
      queueCount: q.length,
      queueSample: sample,
      modelVersion: motorBody?.model_version ?? gwBody?.model_version ?? null,
      labelsCount: motorBody?.labels_count ?? gwBody?.labels_count ?? null,
      todayStats,
      riskStats,
      topModels,
      latencyStats,
      queueOpsStats,
    });
    const blob = new Blob([JSON.stringify(diag, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const ts = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    a.download = `a.scankey_diagnostic_${ts.getFullYear()}${pad(ts.getMonth() + 1)}${pad(ts.getDate())}_${pad(ts.getHours())}${pad(ts.getMinutes())}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportTopModels = () => {
    const blob = new Blob(
      [JSON.stringify({ date: todayKey, models: topModels }, null, 2)],
      { type: 'application/json' }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `scankey_top_modelos_${todayKey}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopySummary = async () => {
    const gwOk = healthGw?.ok ? 'OK' : 'FAIL';
    const motorOk = healthMotor?.ok ? 'OK' : healthMotor == null ? '—' : 'FAIL';
    const buildId = deployInfo?.commit?.slice(0, 7) || '—';
    const deploy = deployInfo?.deployPing || '—';
    const lines = [
      `Build: ${buildId}`,
      `Deploy: ${deploy}`,
      `Gateway: ${gwOk}`,
      `Motor: ${motorOk}`,
      `Cola pendiente: ${queueLen}`,
      `Escaneos hoy: ${todayStats.total_scans}`,
      `Alta/Baja confianza: ${todayStats.high_count}/${todayStats.low_count}`,
      `Top modelo: ${topModels[0]?.label || '—'} (${topModels[0]?.count ?? 0})`,
    ];
    const text = lines.join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (_) {
      // Fallback: no disponible en algunos contextos
    }
  };

  const lastTop1 = history?.[0]?.top1 || history?.[0]?.results?.[0];

  return (
    <div className="flex flex-col flex-1">
      <ScreenHeader title="Taller PRO" onBack={onBack} />
      <div className="flex-1 overflow-auto p-4 pb-24">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* CARD 1 — Estado del sistema */}
          <Card>
            <h4 className="text-sm font-bold text-[var(--text)] mb-3 flex items-center justify-between">
              Estado del sistema
              <Button
                variant="ghost"
                className="!px-2 !py-1 !min-h-0"
                onClick={handleRefresh}
                disabled={loadingHealth}
              >
                {loadingHealth ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <RefreshCw size={16} />
                )}
              </Button>
            </h4>
            <div className="space-y-1.5 text-xs text-[var(--text-secondary)]">
              <div className="flex justify-between">
                <span>Gateway</span>
                <span className={healthGw?.ok ? 'text-[var(--success)]' : healthGw ? 'text-[var(--danger)]' : ''}>
                  {healthGw == null ? (loadingHealth ? 'Comprobando…' : '—') : healthGw.ok ? `OK ${healthGw.ms} ms` : `ERROR ${healthGw.error || healthGw.status || ''}`}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Motor</span>
                <span className={healthMotor?.ok ? 'text-[var(--success)]' : healthMotor ? 'text-[var(--danger)]' : ''}>
                  {healthMotor == null ? (healthGw != null && !loadingHealth ? 'No disponible' : '—') : healthMotor.ok ? `OK ${healthMotor.ms} ms` : `ERROR ${healthMotor.status || ''}`}
                </span>
              </div>
              <div className="flex justify-between text-[10px] opacity-80 pt-1 border-t border-[var(--border)]">
                <span>Build ID</span>
                <span className="font-mono">{deployInfo?.commit?.slice(0, 7) || '—'}</span>
              </div>
              <div className="flex justify-between text-[10px] opacity-80">
                <span>Deploy</span>
                <span>{deployInfo?.deployPing || '—'}</span>
              </div>
            </div>
          </Card>

          {/* CARD 2 — Operación de hoy */}
          <Card>
            <h4 className="text-sm font-bold text-[var(--text)] mb-3">Operación de hoy</h4>
            <div className="space-y-1.5 text-xs text-[var(--text-secondary)]">
              <div className="flex justify-between">
                <span>Total escaneos</span>
                <span>{todayStats.total_scans}</span>
              </div>
              <div className="flex justify-between">
                <span>Alta confianza</span>
                <span className="text-[var(--success)]">{todayStats.high_count}</span>
              </div>
              <div className="flex justify-between">
                <span>Baja confianza</span>
                <span className="text-[var(--danger)]">{todayStats.low_count}</span>
              </div>
              <div className="flex justify-between">
                <span>Correcciones</span>
                <span>{todayStats.corrected_count}</span>
              </div>
              {(todayStats.avg_confidence != null || todayStats.median_confidence != null) && (
                <div className="flex justify-between">
                  <span>Confianza media / p50</span>
                  <span>
                    {todayStats.avg_confidence != null ? `${(todayStats.avg_confidence * 100).toFixed(1)}%` : '—'} /{' '}
                    {todayStats.median_confidence != null ? `${(todayStats.median_confidence * 100).toFixed(0)}%` : '—'}
                  </span>
                </div>
              )}
              <div className="flex justify-between items-start gap-2">
                <span>Último scan</span>
                <span className="text-right">
                  {formatTime(todayStats.last_scan_at)}
                  {lastTop1 && (
                    <span className="block text-[10px] opacity-80 truncate max-w-[120px]">
                      {formatTop1(lastTop1)}
                    </span>
                  )}
                </span>
              </div>
              {onNavigateToHistory && (
                <Button
                  variant="secondary"
                  className="w-full mt-2 flex items-center justify-center gap-2"
                  onClick={onNavigateToHistory}
                >
                  Ver historial <ChevronRight size={14} />
                </Button>
              )}
            </div>
          </Card>

          {/* CARD 3 — Riesgo */}
          <Card>
            <h4 className="text-sm font-bold text-[var(--text)] mb-3">Riesgo</h4>
            <div className="space-y-1.5 text-xs text-[var(--text-secondary)]">
              <div className="flex justify-between">
                <span>HIGH hoy</span>
                <span className="text-[var(--danger)]">{riskStats.high_risk_count}</span>
              </div>
              <div className="flex justify-between">
                <span>MEDIUM hoy</span>
                <span className="text-amber-500">{riskStats.medium_risk_count}</span>
              </div>
              <div className="pt-1 border-t border-[var(--border)]">
                <span className="text-[10px] opacity-80">Top razones:</span>
                <p className="text-[10px] mt-0.5">
                  {riskStats.top_risk_reasons.length > 0
                    ? riskStats.top_risk_reasons.slice(0, 3).join(', ')
                    : '—'}
                </p>
              </div>
            </div>
          </Card>

          {/* CARD 4 — Modelos más frecuentes */}
          <Card>
            <h4 className="text-sm font-bold text-[var(--text)] mb-3">Modelos más frecuentes</h4>
            <div className="max-h-40 overflow-auto space-y-1 text-xs">
              {topModels.length === 0 ? (
                <p className="text-[var(--text-muted)]">—</p>
              ) : (
                topModels.map((m, i) => (
                  <div key={i} className="flex justify-between items-center py-0.5">
                    <span className="truncate flex-1">{m.label || m.id_model_ref || '—'}</span>
                    <span className="flex-shrink-0 ml-2">
                      {m.count}
                      {m.high_ratio > 0 && (
                        <span className="ml-1 text-[10px] text-[var(--success)]">
                          {Math.round(m.high_ratio * 100)}% HIGH
                        </span>
                      )}
                    </span>
                  </div>
                ))
              )}
            </div>
            <Button
              variant="secondary"
              className="w-full mt-2 flex items-center justify-center gap-2"
              onClick={handleExportTopModels}
            >
              <Download size={14} /> Exportar top modelos
            </Button>
          </Card>

          {/* CARD 5 — Feedback */}
          <Card>
            <h4 className="text-sm font-bold text-[var(--text)] mb-3">Feedback</h4>
            <div className="space-y-2 text-xs text-[var(--text-secondary)]">
              <div className="flex justify-between">
                <span>Pendientes en cola</span>
                <span>{queueLen}</span>
              </div>
              {flushState.running && (
                <p className="text-[10px]">
                  Enviados {flushState.sent}, quedan {flushState.remaining}
                </p>
              )}
              {(queueOpsStats.sentToday > 0 || queueOpsStats.failedToday > 0 || queueOpsStats.retryStopToday > 0) && (
                <div className="space-y-0.5 text-[10px] pt-1 border-t border-[var(--border)]">
                  <div className="flex justify-between">
                    <span>Hoy enviados</span>
                    <span>{queueOpsStats.sentToday}</span>
                  </div>
                  {queueOpsStats.failedToday > 0 && (
                    <div className="flex justify-between">
                      <span>Hoy fallidos 4xx</span>
                      <span>{queueOpsStats.failedToday}</span>
                    </div>
                  )}
                  {queueOpsStats.retryStopToday > 0 && (
                    <div className="flex justify-between">
                      <span>Paradas retry</span>
                      <span>{queueOpsStats.retryStopToday}</span>
                    </div>
                  )}
                </div>
              )}
              {queueStats.oldestPendingAt && (
                <p className="text-[10px]">Más antiguo: {formatTimeAgo(queueStats.oldestPendingAt)}</p>
              )}
              <Button
                variant="primary"
                className="w-full"
                onClick={handleFlush}
                disabled={queueLen === 0 || flushState.running}
              >
                {flushState.running ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 size={14} className="animate-spin" /> Sincronizar…
                  </span>
                ) : (
                  'Sincronizar ahora'
                )}
              </Button>
              {flushState.lastError && (
                <AlertBanner variant="error">{flushState.lastError}</AlertBanner>
              )}
              {!flushState.running && flushState.sent > 0 && !flushState.lastError && (
                flushState.remaining > 0 ? (
                  <AlertBanner variant="warn">
                    Enviados {flushState.sent}. Quedan {flushState.remaining} por red inestable.
                  </AlertBanner>
                ) : (
                  <AlertBanner variant="success">
                    Feedback sincronizado correctamente.
                  </AlertBanner>
                )
              )}
            </div>
          </Card>

          {/* CARD 6 — Diagnóstico / Soporte */}
          <Card className="md:col-span-2">
            <h4 className="text-sm font-bold text-[var(--text)] mb-3">Diagnóstico / Soporte</h4>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                onClick={handleExportDiagnostic}
                className="flex items-center gap-2"
              >
                <Download size={14} /> Exportar diagnóstico (JSON)
              </Button>
              <Button
                variant="secondary"
                onClick={handleCopySummary}
                className="flex items-center gap-2"
              >
                <Copy size={14} /> {copySuccess ? 'Copiado' : 'Copiar resumen'}
              </Button>
            </div>
            <p className="text-[10px] text-[var(--text-muted)] mt-2">
              Sin fotos ni datos sensibles. Para soporte técnico.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
