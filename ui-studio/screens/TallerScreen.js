import React, { useState, useEffect } from 'react';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { AlertBanner } from '../components/ui/AlertBanner';
import { getHealth, getMotorHealth, getApiConfig, getApiKey, getFeedbackQueue } from '../services/api';

const ENV_EXAMPLE = `# ui-studio/.env.local
VITE_GATEWAY_BASE_URL=http://localhost:8080
VITE_API_KEY=local-dev-key`;

/**
 * TallerScreen — panel operativo
 */
export function TallerScreen({
  onBack,
  onFlushQueue,
  feedbackPendingCount = 0,
  onRefreshFeedbackCount,
}) {
  const [gatewayHealth, setGatewayHealth] = useState(null);
  const [motorHealth, setMotorHealth] = useState(null);
  const [flushStatus, setFlushStatus] = useState(null);
  const [flushProgress, setFlushProgress] = useState({ sent: 0, remaining: 0 });

  const config = getApiConfig();
  const apiKey = getApiKey();
  const queueLen = feedbackPendingCount > 0 ? feedbackPendingCount : getFeedbackQueue().length;

  useEffect(() => {
    onRefreshFeedbackCount?.();
  }, [onRefreshFeedbackCount]);

  const testGatewayHealth = async () => {
    setGatewayHealth('loading');
    try {
      await getHealth();
      setGatewayHealth('ok');
    } catch (e) {
      setGatewayHealth(e.message || 'Error');
    }
  };

  const testMotorHealth = async () => {
    setMotorHealth('loading');
    try {
      await getMotorHealth();
      setMotorHealth('ok');
    } catch (e) {
      setMotorHealth(e.message || 'Error');
    }
  };

  const handleFlush = async () => {
    setFlushStatus('loading');
    setFlushProgress({ sent: 0, remaining: queueLen });
    try {
      const res = await onFlushQueue();
      setFlushProgress({ sent: res.sent, remaining: res.remaining });
      if (res.remaining > 0) {
        setFlushStatus('partial');
      } else {
        setFlushStatus('ok');
      }
      onRefreshFeedbackCount?.();
    } catch (e) {
      setFlushStatus('error');
    }
  };

  const copyEnvExample = () => {
    try {
      navigator.clipboard.writeText(ENV_EXAMPLE);
      setFlushStatus(null);
    } catch (e) {}
  };

  return (
    <div className="flex flex-col flex-1">
      <ScreenHeader title="Taller" onBack={onBack} />
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {/* Estado del sistema */}
        <Card>
          <h4 className="text-sm font-bold text-[var(--text)] mb-3">Estado del sistema</h4>
          <div className="flex gap-2 flex-wrap">
            <Button
              variant="secondary"
              onClick={testGatewayHealth}
              disabled={gatewayHealth === 'loading'}
            >
              Probar /health gateway
            </Button>
            <Button
              variant="secondary"
              onClick={testMotorHealth}
              disabled={motorHealth === 'loading'}
            >
              Probar /health motor
            </Button>
          </div>
          <div className="mt-2 text-xs text-[var(--text-secondary)] space-y-1">
            {gatewayHealth === 'loading' && <p>Gateway: comprobando…</p>}
            {gatewayHealth === 'ok' && <p className="text-[var(--success)]">Gateway: 200 OK</p>}
            {gatewayHealth && gatewayHealth !== 'loading' && gatewayHealth !== 'ok' && (
              <p className="text-[var(--danger)]">Gateway: {gatewayHealth}</p>
            )}
            {motorHealth === 'loading' && <p>Motor: comprobando…</p>}
            {motorHealth === 'ok' && <p className="text-[var(--success)]">Motor: 200 OK</p>}
            {motorHealth && motorHealth !== 'loading' && motorHealth !== 'ok' && (
              <p className="text-[var(--danger)]">Motor: {motorHealth}</p>
            )}
          </div>
        </Card>

        {/* Feedback pendientes */}
        <Card>
          <h4 className="text-sm font-bold text-[var(--text)] mb-3">Feedback pendientes</h4>
          <p className="text-sm text-[var(--text-secondary)] mb-2">Pendientes: {queueLen}</p>
          <Button
            variant="primary"
            onClick={handleFlush}
            disabled={queueLen === 0 || flushStatus === 'loading'}
          >
            Sincronizar ahora
          </Button>
          {flushStatus === 'loading' && <p className="text-xs mt-2">Enviando…</p>}
          {flushStatus === 'ok' && (
            <AlertBanner variant="success">Feedback sincronizado correctamente.</AlertBanner>
          )}
          {flushStatus === 'partial' && (
            <AlertBanner variant="warn">
              Enviados {flushProgress.sent}. Quedan {flushProgress.remaining} por red inestable.
            </AlertBanner>
          )}
          {flushStatus === 'error' && (
            <AlertBanner variant="error">Error al sincronizar.</AlertBanner>
          )}
        </Card>

        {/* Configuración local (solo DEV) */}
        <Card>
          <h4 className="text-sm font-bold text-[var(--text)] mb-3">Configuración local (solo DEV)</h4>
          <p className="text-xs text-[var(--text-secondary)] mb-2">
            BASE: {config.base || '(no configurada)'}
          </p>
          <p className="text-xs text-[var(--text-secondary)] mb-3">
            Edita ui-studio/.env.local y reinicia el servidor de desarrollo.
          </p>
          <Button variant="secondary" onClick={copyEnvExample}>
            Copiar ejemplo .env.local
          </Button>
        </Card>

        {/* Seguridad */}
        <Card>
          <h4 className="text-sm font-bold text-[var(--text)] mb-3">Seguridad</h4>
          <p className="text-xs text-[var(--text-secondary)]">
            Token taller: {apiKey ? 'presente' : 'ausente'} {apiKey ? '(no se muestra el valor)' : ''}
          </p>
        </Card>
      </div>
    </div>
  );
}
