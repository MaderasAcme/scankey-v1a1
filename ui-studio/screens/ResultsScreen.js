import React from 'react';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Pill } from '../components/ui/Pill';
import { AlertBanner } from '../components/ui/AlertBanner';
import { ConfidenceBar } from '../components/ui/ConfidenceBar';
import { copy } from '../utils/copy';

/**
 * ResultsScreen — TOP3 cards, reglas low/high confidence, corrección manual
 */
export function ResultsScreen({ result, onBack, onCorrect }) {
  const results = result?.results || [];
  const lowConfidence = Boolean(result?.low_confidence);
  const highConfidence = Boolean(result?.high_confidence);

  const formatTitle = (r) => {
    const parts = [(r.brand || r.model || r.type || '').toUpperCase()].filter(Boolean);
    if (r.model && r.model !== r.brand) parts.push(String(r.model).toUpperCase());
    if (r.type && !parts.includes(String(r.type).toUpperCase())) parts.push(String(r.type).toUpperCase());
    return parts.join(' / ') || 'No identificado';
  };

  return (
    <div className="flex flex-col flex-1">
      <ScreenHeader title={copy.results.title} onBack={onBack} />

      <div className="flex-1 overflow-auto p-4 space-y-4">
        {lowConfidence && (
          <AlertBanner variant="warn">
            {copy.results.lowConfidence}. {copy.results.lowConfidenceDesc}
          </AlertBanner>
        )}

        <Button
          variant="destructive"
          className="w-full"
          onClick={onCorrect}
          aria-label="Corregir manualmente"
        >
          {copy.results.manual}
        </Button>

        {results.slice(0, 3).map((r, i) => (
          <Card key={r.rank ?? i}>
            <div className="space-y-3">
              {r.crop_bbox && r.crop_bbox.w > 0 && r.crop_bbox.h > 0 ? (
                <div
                  className="w-full h-24 rounded-[var(--r-sm)] bg-[var(--border)] flex items-center justify-center"
                  aria-hidden
                >
                  <span className="text-[var(--muted)] text-xs">Recorte</span>
                </div>
              ) : (
                <div className="w-full h-24 rounded-[var(--r-sm)] bg-[var(--border)] flex items-center justify-center">
                  <span className="text-[var(--muted)] text-xs">—</span>
                </div>
              )}
              <h3 className="text-sm font-bold text-[var(--text)] uppercase tracking-wide">
                {formatTitle(r)}
              </h3>
              {Array.isArray(r.compatibility_tags) && r.compatibility_tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {r.compatibility_tags.map((t, j) => (
                    <Pill key={j}>{t}</Pill>
                  ))}
                </div>
              )}
              {r.explain_text && (
                <p className="text-xs text-[var(--text-secondary)] line-clamp-2">{r.explain_text}</p>
              )}
              <ConfidenceBar value={r.confidence ?? 0} />
            </div>
          </Card>
        ))}

        {!lowConfidence && highConfidence && (
          <Button
            variant="primary"
            className="w-full"
            aria-label="Aceptar y duplicar"
          >
            {copy.results.accept}
          </Button>
        )}

        <Button
          variant="secondary"
          className="w-full"
          onClick={onCorrect}
          aria-label="Corregir manualmente"
        >
          {copy.results.manual}
        </Button>
      </div>
    </div>
  );
}
