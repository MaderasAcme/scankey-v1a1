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
 * Badge de consistencia (Fase 3 + Fase 6): Alta / Media / Baja.
 * En modo taller: supports/conflicts; si hay strong/weak, etiquetas cortas (ej. "conflicto débil OCR").
 */
function ConsistencyBadge({ result, modoTaller }) {
  const level = result?.debug?.consistency_level;
  const conflicts = Array.isArray(result?.debug?.consistency_conflicts) ? result.debug.consistency_conflicts : [];
  const weakConflicts = Array.isArray(result?.debug?.consistency_weak_conflicts) ? result.debug.consistency_weak_conflicts : [];
  const supports = Array.isArray(result?.debug?.consistency_supports) ? result.debug.consistency_supports : [];
  const evidenceNotes = Array.isArray(result?.debug?.evidence_notes) ? result.debug.evidence_notes : [];
  if (!level) return null;
  const labels = { high: 'Alta', medium: 'Media', low: 'Baja' };
  const label = labels[level];
  if (!label) return null;
  const pillClass = level === 'high' ? 'border-[var(--success)] text-[var(--success)]' : level === 'low' ? 'border-[var(--warning)] text-[var(--warning)]' : '';
  let detail = '';
  if (modoTaller && (conflicts.length > 0 || weakConflicts.length > 0 || supports.length > 0)) {
    const parts = [];
    if (conflicts.length > 0) parts.push(conflicts.slice(0, 2).map((c) => `conflicto fuerte ${c}`).join(', '));
    if (weakConflicts.length > 0) parts.push(weakConflicts.slice(0, 2).map((c) => `conflicto débil ${c}`).join(', '));
    if (supports.length > 0 && parts.length < 2) parts.push(supports.slice(0, 2).map((s) => `coincidencia ${s}`).join(', '));
    detail = parts.slice(0, 2).join(' · ');
  }
  if (!detail && evidenceNotes.length > 0 && modoTaller) {
    const note = evidenceNotes[0];
    if (note && typeof note === 'string' && note.length < 35) detail = note;
  }
  return (
    <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
      <span>Consistencia:</span>
      <Pill className={pillClass}>{label}</Pill>
      {detail && <span className="opacity-80">{detail}</span>}
    </div>
  );
}

const BRAND_SIGNAL_THRESHOLD = 0.6;

/**
 * Señal pasiva de brandReconstruction en Top 3.
 * - Cliente: "Marca probable: X" solo si confidence >= 0.60.
 * - Taller: detalle técnico (zona, modo, razones).
 * No presenta certeza absoluta.
 */
function BrandSignalBadge({ capturedPhotos, modoTaller }) {
  const br = capturedPhotos?.A?.snapshots?.brandReconstruction;
  if (!br) return null;
  const conf = br.brand_match_confidence ?? 0;
  const match = br.brand_partial_match;
  const zone = br.brand_evidence_zone;
  const mode = br.brand_reconstruction_mode;
  const reasons = Array.isArray(br.brand_reconstruction_reason) ? br.brand_reconstruction_reason : [];

  if (conf < BRAND_SIGNAL_THRESHOLD) return null;
  if (!match) return null;

  const zoneLabels = { head: 'head', blade: 'blade', both: 'head+blade', none: '—' };
  const modeLabels = { combined: 'combined', partial_text: 'partial_text', partial_logo: 'partial_logo', metadata_assisted: 'metadata', none: '—' };

  return (
    <div className="flex flex-col gap-1 text-xs text-[var(--text-secondary)]">
      <span>
        Marca probable: <strong className="text-[var(--text)]">{match}</strong>
        {modoTaller && conf > 0 && (
          <span className="opacity-80 ml-1">({Math.round(conf * 100)}%)</span>
        )}
      </span>
      {modoTaller && (zone || mode || reasons.length > 0) && (
        <span className="text-[10px] opacity-75 font-mono">
          {[zoneLabels[zone] || zone, modeLabels[mode] || mode].filter(Boolean).join(' · ')}
          {reasons.length > 0 && ` · ${reasons.slice(0, 2).join(', ')}`}
        </span>
      )}
    </div>
  );
}

/**
 * Multi-label Fase 4: línea corta opcional en modo taller cuando multi_label activo.
 * No saturar UI. Solo si multi_label_enabled y hay campos present.
 */
function MultilabelDebugLine({ result, modoTaller }) {
  if (!modoTaller || !result?.debug?.multi_label_enabled) return null;
  const present = result.debug.multi_label_fields_present;
  if (!Array.isArray(present) || present.length === 0) return null;
  return (
    <div className="text-[10px] text-[var(--text-secondary)] opacity-80 font-mono">
      Multi-label activo · Campos: {present.slice(0, 5).join(', ')}{present.length > 5 ? '…' : ''}
    </div>
  );
}

/**
 * Formatea valor para mostrar. En modoTaller, si existe *_meta, muestra discreto (source conf).
 * Ej: "left (model 0.92)"
 */
function formatAttrDisplay(value, meta, modoTaller) {
  if (!value && value !== false) return null;
  const label = typeof value === 'boolean' ? (value ? 'Sí' : 'No') : String(value);
  if (!modoTaller || !meta || typeof meta !== 'object') return label;
  const src = meta.source;
  const conf = meta.confidence;
  if (src || (conf != null && conf !== undefined)) {
    const extra = [src, conf != null ? String(Math.round(conf * 100) / 100) : null].filter(Boolean).join(' ');
    return extra ? `${label} (${extra})` : label;
  }
  return label;
}

/**
 * Pills multi-label: prioridad type, orientation, patentada, high_security, requires_card,
 * head_color, visual_state, brand_head_text, brand_blade_text, tags.
 * Solo muestra atributos presentes. En modoTaller: meta discreto si existe (source/confidence).
 */
function MultilabelPills({ result: r, modoTaller = false }) {
  if (!r) return null;
  const tags = Array.isArray(r.tags) && r.tags.length > 0 ? r.tags : (Array.isArray(r.compatibility_tags) ? r.compatibility_tags : []);
  const items = [];
  if (r.orientation) items.push({ k: 'orientation', v: formatAttrDisplay(r.orientation, r.orientation_meta, modoTaller) });
  if (r.patentada === true) items.push({ k: 'patentada', v: formatAttrDisplay(true, r.patentada_meta, modoTaller) || 'Sí' });
  if (r.high_security === true) items.push({ k: 'high_security', v: formatAttrDisplay(true, r.high_security_meta, modoTaller) || 'Alta seguridad' });
  if (r.requires_card === true) items.push({ k: 'requires_card', v: formatAttrDisplay(true, r.requires_card_meta, modoTaller) || 'Requiere tarjeta' });
  if (r.head_color) items.push({ k: 'head_color', v: formatAttrDisplay(r.head_color, r.head_color_meta, modoTaller) });
  if (r.visual_state) items.push({ k: 'visual_state', v: formatAttrDisplay(r.visual_state, r.visual_state_meta, modoTaller) });
  if (r.brand_head_text) items.push({ k: 'brand_head', v: formatAttrDisplay(r.brand_head_text, r.brand_head_text_meta, modoTaller) });
  if (r.brand_blade_text) items.push({ k: 'brand_blade', v: formatAttrDisplay(r.brand_blade_text, r.brand_blade_text_meta, modoTaller) });
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
        <MultilabelDebugLine result={result} modoTaller={modoTaller} />
        <BrandSignalBadge capturedPhotos={capturedPhotos} modoTaller={modoTaller} />

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
                <MultilabelPills result={r} modoTaller={modoTaller} />
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
