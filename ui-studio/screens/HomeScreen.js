import React, { useState, useEffect } from 'react';
import { Button } from '../components/ui/Button';
import { getConnectivitySnapshot, subscribeConnectivity } from '../utils/connectivity';

/**
 * HomeScreen — CTA principal + accesos secundarios + badge Online/Offline
 */
export function HomeScreen({ onNavigate, onOpenProfile }) {
  const [online, setOnline] = useState(getConnectivitySnapshot());

  useEffect(() => {
    return subscribeConnectivity(setOnline);
  }, []);

  return (
    <div className="flex flex-col flex-1 p-6">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-black text-[var(--text)] uppercase tracking-tight">ScanKey</h1>
        <div className="flex items-center gap-3">
          {onOpenProfile && (
            <button
              onClick={onOpenProfile}
              aria-label="Perfil"
              className="p-2 rounded-[var(--r-sm)] hover:bg-[var(--card)] text-[var(--text-secondary)]"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="8" r="4" />
                <path d="M4 20c0-4 4-6 8-6s8 2 8 6" />
              </svg>
            </button>
          )}
          <span
          className={`inline-flex items-center gap-2 px-2 py-1 rounded-full text-[10px] font-bold uppercase ${
            online ? 'bg-[var(--success-muted)] text-[var(--success)]' : 'bg-[var(--danger-muted)] text-[var(--danger)]'
          }`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${online ? 'bg-[var(--success)]' : 'bg-[var(--danger)]'}`} />
          {online ? 'Online' : 'Offline'}
        </span>
        </div>
      </div>

      <div className="flex-1 flex flex-col justify-center gap-6">
        <Button
          variant="primary"
          className="w-full py-4 text-base"
          onClick={() => onNavigate('Scan')}
          aria-label="Escanear llave"
        >
          Escanear
        </Button>

        <div className="flex flex-col gap-3">
          <Button variant="secondary" onClick={() => onNavigate('History')} aria-label="Ver historial">
            Historial
          </Button>
          <Button variant="secondary" onClick={() => onNavigate('Guide')} aria-label="Ver guía">
            Guía
          </Button>
          <Button variant="secondary" onClick={() => onNavigate('Taller')} aria-label="Modo taller">
            Taller
          </Button>
        </div>
      </div>
    </div>
  );
}
