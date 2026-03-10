import React from 'react';

/**
 * Estado de conexión motor/gateway.
 * motor_checking | motor_online | motor_offline
 */
const STATE_CONFIG = {
  motor_checking: {
    label: 'Comprobando motor…',
    icon: '⋯',
    className: 'bg-[var(--border)]/60 text-[var(--text-muted)] border-[var(--border)] animate-pulse',
  },
  motor_online: {
    label: 'Motor conectado',
    icon: '✓',
    className: 'bg-[var(--success-muted)] text-[var(--success)] border-[var(--success)]/40',
  },
  motor_offline: {
    label: 'Motor desconectado',
    icon: '○',
    className: 'bg-[var(--danger-muted)] text-[var(--danger)] border-[var(--danger)]/40',
  },
};

export function MotorConnectionBadge({ status }) {
  const config = STATE_CONFIG[status] || STATE_CONFIG.motor_checking;
  return (
    <div
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${config.className}`}
      role="status"
      aria-live="polite"
    >
      <span className="text-sm" aria-hidden>{config.icon}</span>
      <span>{config.label}</span>
    </div>
  );
}
