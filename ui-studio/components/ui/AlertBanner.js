import React from 'react';
import { AlertCircle, AlertTriangle, Info, CheckCircle } from 'lucide-react';

const config = {
  info: { Icon: Info, bg: 'var(--info-muted)', border: 'var(--info)', text: 'var(--info)' },
  warn: { Icon: AlertTriangle, bg: 'var(--warning-muted)', border: 'var(--warning)', text: 'var(--warning)' },
  error: { Icon: AlertCircle, bg: 'var(--danger-muted)', border: 'var(--danger)', text: 'var(--danger)' },
  success: { Icon: CheckCircle, bg: 'var(--success-muted)', border: 'var(--success)', text: 'var(--success)' },
};

/**
 * AlertBanner — info | warn | error | success
 */
export function AlertBanner({ variant = 'info', children }) {
  const { Icon, bg, border, text } = config[variant] || config.info;
  return (
    <div
      className="flex items-start gap-3 p-4 rounded-[var(--r-md)] border"
      style={{ backgroundColor: bg, borderColor: border }}
    >
      <Icon size={20} style={{ color: text }} className="flex-shrink-0 mt-0.5" />
      <div className="text-sm font-medium flex-1 min-w-0" style={{ color: text }}>
        {children}
      </div>
    </div>
  );
}
