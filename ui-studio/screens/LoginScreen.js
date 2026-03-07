/**
 * LoginScreen — Acceso técnico taller 1:1 con referencia
 * Fondo negro, card blanca con escudo, inputs grandes oscuros, botón ENTRAR
 */
import React, { useState, useCallback } from 'react';
import { Shield } from 'lucide-react';
import { loginWorkshop } from '../services/auth';

const DEFAULT_EMAIL = 'scankey@scankey.com';

export function LoginScreen({ onSuccess, onBack }) {
  const [email, setEmail] = useState(DEFAULT_EMAIL);
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const canSubmit = Boolean(email?.trim() && password?.trim());

  const handleSubmit = useCallback(
    async (e) => {
      e.preventDefault();
      if (!canSubmit || loading) return;
      setError(null);
      setLoading(true);
      try {
        await loginWorkshop(email.trim(), password);
        onSuccess?.();
      } catch (err) {
        setError('Credenciales incorrectas');
      } finally {
        setLoading(false);
      }
    },
    [email, password, canSubmit, loading, onSuccess]
  );

  return (
    <div className="fixed inset-0 bg-[#000000] flex flex-col overflow-auto z-[90]">
      <div className="flex-1 flex flex-col justify-center px-8 py-12 max-w-md mx-auto w-full">
        <div className="flex flex-col items-center mb-10">
          <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center mb-6 shadow-none">
            <Shield className="w-8 h-8 text-black" strokeWidth={2} />
          </div>
          <h1 className="text-4xl font-black text-white uppercase tracking-tight leading-tight">
            SCANKEY
          </h1>
          <p className="text-sm text-[#8b9cb8] uppercase tracking-wider mt-2">
            ACCESO TÉCNICO
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <label
              htmlFor="login-email"
              className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#a1a1aa]"
            >
              EMAIL
            </label>
            <div className="relative">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[#71717a]">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                  <polyline points="22,6 12,13 2,6" />
                </svg>
              </div>
              <input
                id="login-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={DEFAULT_EMAIL}
                className="w-full h-14 pl-12 pr-4 bg-[#1a1a1e] rounded-2xl border-0 text-white placeholder:text-[#71717a] text-base focus:outline-none focus:ring-0"
                autoComplete="email"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label
              htmlFor="login-password"
              className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#a1a1aa]"
            >
              PASSWORD
            </label>
            <div className="relative">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[#71717a]">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </div>
              <input
                id="login-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder=""
                className="w-full h-14 pl-12 pr-4 bg-[#1a1a1e] rounded-2xl border-0 text-white placeholder:text-[#71717a] text-base focus:outline-none focus:ring-0"
                autoComplete="current-password"
              />
            </div>
          </div>

          {error && (
            <p className="text-sm text-[var(--danger)] -mt-2">{error}</p>
          )}

          <div className="pt-2">
            <button
              type="submit"
              disabled={!canSubmit || loading}
              className="w-full h-14 rounded-2xl bg-[#0d1117] text-white font-bold text-base uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed enabled:bg-[#151b24] enabled:hover:bg-[#1c2430] transition-colors"
            >
              {loading ? '…' : 'ENTRAR'}
            </button>
          </div>
        </form>

        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="mt-8 text-sm text-[#71717a] hover:text-[#a1a1aa] uppercase tracking-wider"
          >
            Volver
          </button>
        )}
      </div>
    </div>
  );
}
