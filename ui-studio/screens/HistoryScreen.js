import React, { useState, useMemo } from 'react';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { Card } from '../components/ui/Card';
import { AlertBanner } from '../components/ui/AlertBanner';
import { loadJSON } from '../utils/storage';
import { getFeedbackQueue } from '../services/api';
import { copy } from '../utils/copy';

function formatTimestamp(ts) {
  if (!ts) return '';
  try {
    const d = new Date(ts);
    return d.toLocaleDateString('es-ES', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch (e) {
    return String(ts);
  }
}

function formatTitle(top1) {
  if (!top1) return 'No identificado';
  const parts = [(top1.brand || top1.model || top1.type || '').toUpperCase()].filter(Boolean);
  if (top1.model && top1.model !== top1.brand) parts.push(String(top1.model).toUpperCase());
  if (top1.type && !parts.includes(String(top1.type).toUpperCase())) parts.push(String(top1.type).toUpperCase());
  return parts.join(' / ') || 'No identificado';
}

/**
 * HistoryScreen — lista de scans + detalle
 */
export function HistoryScreen({ onBack, onNavigate, openLast, onConsumeOpenLast }) {
  const history = useMemo(() => loadJSON('scn_history', []), []);
  const queue = useMemo(() => getFeedbackQueue(), []);
  const [detailItem, setDetailItem] = useState(null);

  React.useEffect(() => {
    if (openLast && Array.isArray(history) && history.length > 0) {
      setDetailItem(history[0]);
      onConsumeOpenLast?.();
    }
  }, [openLast, history, onConsumeOpenLast]);

  const hasPendingForInput = (inputId) => queue.some((q) => q.input_id === inputId);

  if (detailItem) {
    return (
      <div className="flex flex-col flex-1">
        <ScreenHeader
          title="Detalle"
          onBack={() => setDetailItem(null)}
        />
        <div className="flex-1 overflow-auto p-4 space-y-4">
          <div className="text-sm text-[var(--text-secondary)]">
            {formatTimestamp(detailItem.timestamp)}
          </div>
          {(detailItem.results || []).slice(0, 3).map((r, i) => (
            <Card key={r.rank ?? i}>
              <h3 className="text-sm font-bold text-[var(--text)] uppercase tracking-wide">
                {formatTitle(r)}
              </h3>
              <p className="text-xs text-[var(--text-secondary)] mt-1">
                Confianza: {Math.round((r.confidence ?? 0) * 100)}%
              </p>
              {r.explain_text && (
                <p className="text-xs text-[var(--text-muted)] mt-1 line-clamp-2">{r.explain_text}</p>
              )}
            </Card>
          ))}
          {detailItem.debug && (
            <p className="text-[10px] text-[var(--text-muted)] opacity-80 pt-2 border-t border-[var(--border)]">
              model: {detailItem.debug.model_version} · roi: {detailItem.debug.roi_source}
            </p>
          )}
          {hasPendingForInput(detailItem.input_id) && (
            <AlertBanner variant="info">Feedback pendiente de envío para este escaneo.</AlertBanner>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1">
      <ScreenHeader title="Historial" onBack={onBack} />
      <div className="flex-1 overflow-auto p-4 space-y-3">
        {!Array.isArray(history) || history.length === 0 ? (
          <Card>
            <div className="text-center py-10 space-y-1">
              <p className="text-[var(--text-secondary)] text-sm">
                Sin historial aún
              </p>
              <p className="text-[var(--text-muted)] text-xs">
                Realiza tu primer escaneo desde Inicio
              </p>
            </div>
          </Card>
        ) : (
          history.map((item, idx) => {
            const top1 = item.top1 || item.results?.[0];
            const title = formatTitle(top1);
            const conf = top1?.confidence ?? 0;
            const confPct = Math.round(conf * 100);
            const badge = item.low_confidence ? 'LOW' : item.high_confidence ? 'HIGH' : null;

            return (
              <Card key={item.input_id || idx} onClick={() => setDetailItem(item)}>
                <div className="flex justify-between items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-bold text-[var(--text)] uppercase tracking-wide truncate">
                      {title}
                    </h3>
                    <p className="text-xs text-[var(--text-secondary)] mt-1">
                      {confPct}% {badge && `· ${badge}`} {item.correction_used && '· Corregido'}
                    </p>
                  </div>
                  <span className="text-xs text-[var(--text-muted)] flex-shrink-0">
                    {formatTimestamp(item.timestamp)}
                  </span>
                </div>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
