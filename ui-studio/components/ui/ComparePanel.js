import React, { useState } from 'react';
import { CropThumbnail } from './CropThumbnail';

/**
 * Obtiene dataURL de la foto base para un result (preferir lado según roi_side/side).
 */
function getSourceDataUrl(capturedPhotos, r) {
  if (!capturedPhotos) return null;
  const sideHint = r?.roi_side ?? r?.side ?? r?.debug?.roi_side;
  const side = sideHint === 'B' || sideHint === 'back' ? 'B' : 'A';
  const s = capturedPhotos[side];
  return s ? (s.optimizedDataUrl || s.originalDataUrl) : (capturedPhotos.A?.optimizedDataUrl || capturedPhotos.A?.originalDataUrl);
}

function formatTitle(r) {
  const parts = [(r.brand || r.model || r.type || '').toUpperCase()].filter(Boolean);
  if (r.model && r.model !== r.brand) parts.push(String(r.model).toUpperCase());
  if (r.type && !parts.includes(String(r.type).toUpperCase())) parts.push(String(r.type).toUpperCase());
  return parts.join(' / ') || 'No identificado';
}

function isBboxReliable(bbox) {
  if (!bbox || typeof bbox !== 'object') return false;
  const w = Number(bbox.w) || 0;
  const h = Number(bbox.h) || 0;
  return w > 0 && h > 0 && (w < 0.99 || h < 0.99);
}

/**
 * ComparePanel — Comparador visual A vs B y Top1 vs Top2.
 * Modos: ab (fotos capturadas) | top (candidatos con crop_bbox).
 */
export function ComparePanel({ capturedPhotos, results = [], hasB, defaultMode = 'ab' }) {
  const [activeTab, setActiveTab] = useState(defaultMode);
  const [useCrop, setUseCrop] = useState(true);

  const top1 = results[0];
  const top2 = results[1];
  const hasTopComparison = top1 && top2;
  const showAbTab = hasB;
  const showTopTab = hasTopComparison;

  if (!showAbTab && !showTopTab) return null;

  const effectiveTab = (showAbTab && activeTab === 'ab') ? 'ab' : 'top';
  const showTabs = showAbTab && showTopTab;

  return (
    <section
      className="rounded-[var(--r-lg)] bg-[var(--card)] border border-[var(--border)] p-4 space-y-4"
      aria-label="Comparador visual de resultados"
    >
      {showTabs && (
        <div className="flex gap-2 border-b border-[var(--border)] pb-2" role="tablist" aria-label="Modo de comparación">
          {showAbTab && (
            <button
              type="button"
              role="tab"
              aria-selected={effectiveTab === 'ab'}
              aria-controls="compare-ab-panel"
              id="tab-ab"
              className={`px-3 py-1.5 rounded text-sm font-medium transition ${
                effectiveTab === 'ab'
                  ? 'bg-[var(--accent)] text-white'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text)]'
              }`}
              onClick={() => setActiveTab('ab')}
            >
              A vs B
            </button>
          )}
          {showTopTab && (
            <button
              type="button"
              role="tab"
              aria-selected={effectiveTab === 'top'}
              aria-controls="compare-top-panel"
              id="tab-top"
              className={`px-3 py-1.5 rounded text-sm font-medium transition ${
                effectiveTab === 'top'
                  ? 'bg-[var(--accent)] text-white'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text)]'
              }`}
              onClick={() => setActiveTab('top')}
            >
              Top1 vs Top2
            </button>
          )}
        </div>
      )}

      {effectiveTab === 'ab' && showAbTab && (
        <div
          id="compare-ab-panel"
          role="tabpanel"
          aria-labelledby="tab-ab"
          className="space-y-3"
        >
          <p className="text-xs text-[var(--text-secondary)]">
            Compara la cara A y la cara B antes de decidir.
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-[var(--muted)] uppercase">A</span>
              <div
                className="w-full aspect-square rounded-[var(--r-sm)] bg-[var(--border)] overflow-hidden flex items-center justify-center"
                role="img"
                aria-label="Cara A capturada"
              >
                {capturedPhotos?.A?.optimizedDataUrl || capturedPhotos?.A?.originalDataUrl ? (
                  <img
                    src={capturedPhotos.A.optimizedDataUrl || capturedPhotos.A.originalDataUrl}
                    alt="Cara A"
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <span className="text-[var(--muted)] text-xs">—</span>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-[var(--muted)] uppercase">B</span>
              <div
                className="w-full aspect-square rounded-[var(--r-sm)] bg-[var(--border)] overflow-hidden flex items-center justify-center"
                role="img"
                aria-label="Cara B capturada"
              >
                {capturedPhotos?.B?.optimizedDataUrl || capturedPhotos?.B?.originalDataUrl ? (
                  <img
                    src={capturedPhotos.B.optimizedDataUrl || capturedPhotos.B.originalDataUrl}
                    alt="Cara B"
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <span className="text-[var(--muted)] text-xs">—</span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {effectiveTab === 'top' && showTopTab && (
        <div
          id="compare-top-panel"
          role="tabpanel"
          aria-labelledby="tab-top"
          className="space-y-3"
        >
          <p className="text-xs text-[var(--text-secondary)]">
            Compara los dos candidatos principales.
          </p>

          <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
            <input
              type="checkbox"
              checked={useCrop}
              onChange={(e) => setUseCrop(e.target.checked)}
              aria-label="Usar recorte de región de interés"
              className="rounded border-[var(--border)] bg-[var(--bg)]"
            />
            Usar recorte
          </label>

          <div className="grid grid-cols-2 gap-4">
            <ComparisonCell
              label="TOP1"
              result={top1}
              capturedPhotos={capturedPhotos}
              useCrop={useCrop}
            />
            <ComparisonCell
              label="TOP2"
              result={top2}
              capturedPhotos={capturedPhotos}
              useCrop={useCrop}
            />
          </div>
        </div>
      )}
    </section>
  );
}

function ComparisonCell({ label, result, capturedPhotos, useCrop }) {
  const dataUrl = getSourceDataUrl(capturedPhotos, result);
  const rawBbox = result?.crop_bbox ?? result?.bbox;
  const bboxReliable = useCrop && isBboxReliable(rawBbox);
  const bbox = bboxReliable ? rawBbox : { x: 0, y: 0, w: 1, h: 1 };
  const confidence = result?.confidence ?? result?.conf ?? 0;
  const pct = Math.round(confidence * 100);
  const title = formatTitle(result);

  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-[var(--muted)] uppercase">{label}</span>
      <div
        className="w-full h-32 rounded-[var(--r-sm)] overflow-hidden"
        role="img"
        aria-label={`${label}: ${title}, confianza ${pct}%`}
      >
        <CropThumbnail
          dataUrl={dataUrl}
          bbox={bbox}
          alt={title}
          className="!h-full !min-h-0"
        />
      </div>
      <span className="text-xs font-bold text-[var(--text)]">{title}</span>
      <span className="text-xs text-[var(--text-secondary)]">{pct}%</span>
    </div>
  );
}
