import React, { useState, useCallback } from 'react';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Pill } from '../components/ui/Pill';
import { AlertBanner } from '../components/ui/AlertBanner';
import { ConfidenceBar } from '../components/ui/ConfidenceBar';
import { CropThumbnail } from '../components/ui/CropThumbnail';
import { ComparePanel } from '../components/ui/ComparePanel';
import { CorrectionModal } from '../components/CorrectionModal';
import { copy } from '../utils/copy';

/**
 * Obtiene dataURL de la foto a usar para el recorte. Por defecto A optimizada.
 */
function getSourceDataUrl(capturedPhotos, result, resultIndex) {
  if (!capturedPhotos) return null;
  const sideHint = result?.roi_side ?? result?.side ?? result?.debug?.roi_side;
  const side = sideHint === 'B' || sideHint === 'back' ? 'B' : 'A';
  const s = capturedPhotos[side];
  return s ? (s.optimizedDataUrl || s.originalDataUrl) : (capturedPhotos.A?.optimizedDataUrl || capturedPhotos.A?.originalDataUrl);
}

/**
 * ResultsScreen — TOP3 cards, selección, corrección manual, feedback
 */
const POLICY_BANNER_ACTIONS = ['BLOCK', 'REQUIRE_MANUAL_REVIEW', 'ALLOW_WITH_OVERRIDE', 'RUN_OCR', 'WARN'];

/**
 * Badge de consistencia (Fase 3): Alta / Media / Baja.
 * En modo taller: hasta 2 supports/conflicts.
 */
function ConsistencyBadge({ result, modoTaller }) {
  const level = result?.debug?.consistency_level;
  const conflicts = Array.isArray(result?.debug?.consistency_conflicts) ? result.debug.consistency_conflicts : [];
  const supports = Array.isArray(result?.debug?.consistency_supports) ? result.debug.consistency_supports : [];
  if (!level) return null;
  const labels = { high: 'Alta', medium: 'Media', low: 'Baja' };
  const label = labels[level];
  if (!label) return null;
  const pillClass = level === 'high' ? 'border-[var(--success)] text-[var(--success)]' : level === 'low' ? 'border-[var(--warning)] text-[var(--warning)]' : '';
  return (
    <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
      <span>Consistencia:</span>
      <Pill className={pillClass}>{label}</Pill>
      {modoTaller && (conflicts.length > 0 || supports.length > 0) && (
        <span className="opacity-80">
          {[...supports.slice(0, 2), ...conflicts.slice(0, 2)].slice(0, 2).join(', ')}
        </span>
      )}
    </div>
  );
}

/**
 * Pills multi-label: prioridad type, orientation, patentada, high_security, requires_card,
 * head_color, visual_state, brand_head_text, brand_blade_text, tags.
 * Solo muestra atributos presentes. Sin huecos vacíos.
 */
function MultilabelPills({ result: r }) {
  if (!r) return null;
  const tags = Array.isArray(r.tags) && r.tags.length > 0 ? r.tags : (Array.isArray(r.compatibility_tags) ? r.compatibility_tags : []);
  const items = [];
  if (r.orientation) items.push({ k: 'orientation', v: r.orientation });
  if (r.patentada === true) items.push({ k: 'patentada', v: 'Sí' });
  if (r.high_security === true) items.push({ k: 'high_security', v: 'Alta seguridad' });
  if (r.requires_card === true) items.push({ k: 'requires_card', v: 'Requiere tarjeta' });
  if (r.head_color) items.push({ k: 'head_color', v: r.head_color });
  if (r.visual_state) items.push({ k: 'visual_state', v: r.visual_state });
  if (r.brand_head_text) items.push({ k: 'brand_head', v: r.brand_head_text });
  if (r.brand_blade_text) items.push({ k: 'brand_blade', v: r.brand_blade_text });
  tags.forEach((t) => items.push({ k: 'tag', v: t }));
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {items.map(({ k, v }, j) => (
        <Pill key={`${k}-${j}`}>{String(v)}</Pill>
      ))}
    </div>
  );
}

export function ResultsScreen({
  result,
  capturedPhotos,
  onBack,
  onConfirm,
  onQueueFeedback,
  feedbackPending,
  modoTaller = false,
}) {
  const results = result?.results || [];
  const lowConfidence = Boolean(result?.low_confidence);
  const highConfidence = Boolean(result?.high_confidence);
  const forceCorrection = lowConfidence;

  const policyAction = result?.debug?.policy_action;
  const policyUserMessage = result?.debug?.policy_user_message;
  const policyReasons = Array.isArray(result?.debug?.policy_reasons) ? result.debug.policy_reasons : [];
  const showPolicyBanner = POLICY_BANNER_ACTIONS.includes(policyAction) && policyUserMessage;

  const [selectedRank, setSelectedRank] = useState(null);
  const [showCorrectionModal, setShowCorrectionModal] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const fields = result?.manual_correction_hint?.fields || ['marca', 'modelo', 'tipo', 'orientacion', 'ocr_text'];

  const formatTitle = (r) => {
    const parts = [(r.brand || r.model || r.type || '').toUpperCase()].filter(Boolean);
    if (r.model && r.model !== r.brand) parts.push(String(r.model).toUpperCase());
    if (r.type && !parts.includes(String(r.type).toUpperCase())) parts.push(String(r.type).toUpperCase());
    return parts.join(' / ') || 'No identificado';
  };

  const buildFeedbackPayload = useCallback(
    (correction, manual, selectedRankVal, selectedIdModelRef) => {
      const r = results[selectedRankVal - 1];
      return {
        request_id: result?.request_id,
        input_id: result?.input_id,
        modo: 'cliente',
        selected_rank: selectedRankVal,
        selected_id_model_ref: selectedIdModelRef ?? r?.id_model_ref ?? null,
        correction: correction,
        manual: manual || null,
        meta: { gateway_base: '', ui_version: '2.1.0' },
      };
    },
    [result, results]
  );

  const handleCardClick = useCallback(
    (r, i) => {
      const rank = r.rank ?? i + 1;
      if (lowConfidence) {
        setSelectedRank(rank);
        setShowCorrectionModal(true);
      } else {
        setSelectedRank(rank);
      }
    },
    [lowConfidence]
  );

  const handleConfirmSelection = useCallback(
    async (rankOverride) => {
      if (lowConfidence) return;
      const rank = rankOverride ?? selectedRank ?? 1;
      const r = results[rank - 1];
      const payload = buildFeedbackPayload(false, null, rank, r?.id_model_ref);
      setConfirming(true);
      try {
        await onConfirm(payload);
        onBack?.();
      } catch (e) {
        if (onQueueFeedback) await onQueueFeedback(payload);
      } finally {
        setConfirming(false);
      }
    },
    [lowConfidence, selectedRank, results, buildFeedbackPayload, onConfirm, onQueueFeedback, onBack]
  );

  const handleSaveCorrection = useCallback(
    async (manual) => {
      const rank = selectedRank || 1;
      const r = results[rank - 1];
      const payload = buildFeedbackPayload(true, manual, rank, r?.id_model_ref);
      setConfirming(true);
      try {
        await onConfirm(payload);
        setShowCorrectionModal(false);
        if (forceCorrection) onBack?.();
      } catch (e) {
        if (onQueueFeedback) await onQueueFeedback(payload);
        setShowCorrectionModal(false);
        if (forceCorrection) onBack?.();
      } finally {
        setConfirming(false);
      }
    },
    [selectedRank, results, buildFeedbackPayload, onConfirm, onQueueFeedback, forceCorrection, onBack]
  );

  return (
    <div className="flex flex-col flex-1">
      <ScreenHeader title={copy.results.title} onBack={onBack} />

      <div className="flex-1 overflow-auto p-4 space-y-4">
        {lowConfidence && (
          <AlertBanner variant="warn">
            Resultado dudoso. Corrige manualmente para asegurar el duplicado.
          </AlertBanner>
        )}

        {showPolicyBanner && (
          <AlertBanner variant={policyAction === 'BLOCK' ? 'error' : 'warn'}>
            <div>
              <div>{policyUserMessage}</div>
              {modoTaller && policyReasons.length > 0 && (
                <div className="text-xs mt-1 opacity-80">
                  {policyReasons.slice(0, 2).join(', ')}
                </div>
              )}
            </div>
          </AlertBanner>
        )}

        <ConsistencyBadge result={result} modoTaller={modoTaller} />

        {feedbackPending && (
          <AlertBanner variant="info">Feedback pendiente. Se enviará al sincronizar.</AlertBanner>
        )}

        <ComparePanel
          capturedPhotos={capturedPhotos}
          results={results}
          hasB={Boolean(capturedPhotos?.B)}
          defaultMode={capturedPhotos?.B ? 'ab' : 'top'}
        />

        {results.slice(0, 3).map((r, i) => {
          const dataUrl = getSourceDataUrl(capturedPhotos, r, i);
          const bbox = r.crop_bbox && r.crop_bbox.w > 0 && r.crop_bbox.h > 0 ? r.crop_bbox : { x: 0, y: 0, w: 1, h: 1 };
          const rank = r.rank ?? i + 1;
          const isSelected = selectedRank === rank;

          return (
            <Card
              key={r.rank ?? i}
              onClick={() => handleCardClick(r, i)}
              className={isSelected ? 'ring-2 ring-[var(--accent)]' : ''}
            >
              <div className="space-y-3">
                <CropThumbnail dataUrl={dataUrl} bbox={bbox} alt={formatTitle(r)} />
                <h3 className="text-sm font-bold text-[var(--text)] uppercase tracking-wide">
                  {formatTitle(r)}
                </h3>
                <MultilabelPills result={r} />
                {r.explain_text && (
                  <p className="text-xs text-[var(--text-secondary)] line-clamp-2">{r.explain_text}</p>
                )}
                <ConfidenceBar value={r.confidence ?? 0} />
              </div>
            </Card>
          );
        })}

        {!lowConfidence && (
          <>
            {highConfidence && (
              <Button
                variant="primary"
                className="w-full"
                onClick={() => handleConfirmSelection(1)}
                disabled={confirming}
                aria-label="Aceptar y duplicar"
              >
                {copy.results.accept}
              </Button>
            )}
            <Button
              variant={highConfidence ? 'secondary' : 'primary'}
              className="w-full"
              onClick={() => handleConfirmSelection(selectedRank || 1)}
              disabled={confirming}
              aria-label="Confirmar selección"
            >
              Confirmar selección
            </Button>
          </>
        )}

        <Button
          variant={lowConfidence ? 'destructive' : 'secondary'}
          className="w-full"
          onClick={() => setShowCorrectionModal(true)}
          aria-label="Corregir manualmente"
        >
          {copy.results.manual}
        </Button>
      </div>

      <CorrectionModal
        isOpen={showCorrectionModal}
        onClose={() => !forceCorrection && setShowCorrectionModal(false)}
        onSave={handleSaveCorrection}
        forceCorrection={forceCorrection}
        fields={fields}
      />
    </div>
  );
}
