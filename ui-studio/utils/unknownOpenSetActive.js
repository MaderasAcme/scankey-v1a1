/**
 * unknownOpenSetActive — capa de decisión UNKNOWN / open-set.
 * Evita falsos positivos cuando la llave no encaja bien con lo conocido.
 *
 * Usa: quality_gate, feature_fusion, ranking_conflicts, consistency,
 *      text/brand support, shape quality.
 *
 * No dispara UNKNOWN por cualquier ruido. Umbrales claros y explicables.
 */

import { computeVisionAugmentedConsistency } from './consistencyActive';

const UNKNOWN_THRESHOLD = 0.65;
const KNOWN_LOW_THRESHOLD = 0.4;
const MIN_TOP1_CONF_KNOWN = 0.55;
const MIN_CONSISTENCY_KNOWN = 45;
const MIN_QUALITY_OPEN_SET = 0.35;

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

/**
 * Calcula decisión UNKNOWN/open-set.
 *
 * @param {Object} result - API result { results, debug }
 * @param {Object} capturedPhotos - { A: { snapshots } }
 * @returns {Object} { unknown_decision, unknown_score, unknown_reason, open_set_ready }
 */
export function computeUnknownDecision(result, capturedPhotos) {
  const snapshots = capturedPhotos?.A?.snapshots || {};
  const qg = snapshots.qualityGate;
  const ff = snapshots.featureFusion;
  const br = snapshots.brandReconstruction;
  const tz = snapshots.textZones;
  const shape = snapshots.shape;
  const damage = snapshots.damage;

  const results = result?.results || result?.candidates || [];
  const top1 = results[0] || {};
  const top1Conf = clamp01(top1.confidence ?? top1.conf ?? top1.score ?? 0);

  const rankingConflicts = Array.isArray(ff?.ranking_conflicts) ? ff.ranking_conflicts : [];
  const augmentedConsistency = capturedPhotos?.A?.snapshots
    ? computeVisionAugmentedConsistency(result, capturedPhotos)
    : null;
  const consistencyScore = augmentedConsistency?.consistency_score ?? result?.debug?.consistency_score ?? null;
  const consistencyConflicts = Array.isArray(augmentedConsistency?.consistency_conflicts)
    ? augmentedConsistency.consistency_conflicts
    : (Array.isArray(result?.debug?.consistency_conflicts) ? result.debug.consistency_conflicts : []);

  const hasVision = !!(qg || ff || br || tz || shape || damage);
  const open_set_ready = hasVision && ff?.fusion_ready;

  const reasons = [];
  let unknown_score = 0;

  if (!open_set_ready || !results.length) {
    return {
      unknown_decision: 'known',
      unknown_score: 0,
      unknown_reason: [],
      open_set_ready: false,
    };
  }

  // --- Señales que favorecen UNKNOWN (evidencia mala o contradictoria) ---

  if (consistencyScore != null && consistencyScore < MIN_CONSISTENCY_KNOWN) {
    unknown_score += 0.25;
    reasons.push('U-consistency_baja');
  }

  if (consistencyConflicts.includes('vision_brand_conflict') || consistencyConflicts.includes('brand_conflict')) {
    unknown_score += 0.22;
    reasons.push('U-brand_contradice');
  }

  const criticalGlare = rankingConflicts.includes('critical_glare');
  const keyNotDetected = rankingConflicts.includes('key_not_detected');
  const lowTextVis = rankingConflicts.includes('low_text_visibility');
  const keyIncomplete = rankingConflicts.includes('key_incomplete');
  const highWear = rankingConflicts.includes('high_wear');

  if (criticalGlare) {
    unknown_score += 0.15;
    reasons.push('U-glare_critico');
  }
  if (keyNotDetected) {
    unknown_score += 0.18;
    reasons.push('U-llave_no_detectada');
  }
  if (keyIncomplete && shape?.mask_detected) {
    unknown_score += 0.12;
    reasons.push('U-llave_incompleta');
  }
  if (lowTextVis && (tz?.text_zones_ready || br?.brand_reconstruction_ready)) {
    unknown_score += 0.10;
    reasons.push('U-texto_poco_visible');
  }
  if (highWear && (damage?.wear_score ?? 0) >= 0.65) {
    unknown_score += 0.08;
    reasons.push('U-desgaste_alto');
  }

  const qualityLow = (qg?.quality_score ?? 0) < MIN_QUALITY_OPEN_SET;
  const captureNotReady = qg?.capture_ready === false;
  if (qualityLow && captureNotReady) {
    unknown_score += 0.12;
    reasons.push('U-calidad_captura_baja');
  }

  const visionBrand = br?.brand_partial_match ? String(br.brand_partial_match).trim().toLowerCase() : '';
  const top1Brand = String(top1.brand || top1.model || top1.label || '').trim().toLowerCase();
  const brandsConflict = visionBrand && top1Brand && visionBrand.length > 2 && top1Brand.length > 2 &&
    visionBrand !== top1Brand && !visionBrand.includes(top1Brand) && !top1Brand.includes(visionBrand);
  if (brandsConflict && (br?.brand_match_confidence ?? 0) >= 0.5) {
    unknown_score += 0.20;
    reasons.push('U-marca_vision_vs_top1');
  }

  if (top1Conf < MIN_TOP1_CONF_KNOWN && unknown_score > 0.2) {
    unknown_score += 0.10;
    reasons.push('U-confianza_top1_baja');
  }

  unknown_score = clamp01(unknown_score);

  let unknown_decision;
  if (unknown_score >= UNKNOWN_THRESHOLD) {
    unknown_decision = 'UNKNOWN';
  } else if (unknown_score >= KNOWN_LOW_THRESHOLD || (top1Conf < MIN_TOP1_CONF_KNOWN && unknown_score > 0.15)) {
    unknown_decision = 'known_but_low_confidence';
  } else {
    unknown_decision = 'known';
  }

  return {
    unknown_decision,
    unknown_score,
    unknown_reason: [...new Set(reasons)].slice(0, 6),
    open_set_ready: true,
  };
}
