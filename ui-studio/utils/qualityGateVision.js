/**
 * qualityGateVision — módulo pasivo que fusiona señales de visión.
 * Modo PASIVO: mide, resume, recomienda. NO bloquea captura.
 * Fusiona: tracking, glare, shape, topdown, contrast, dissection, textZones, damage.
 *
 * Diseñado para alimentar: bloqueo real, auto-capture, retry guidance, quality_gate activo.
 */

const QUALITY_CAPTURE_READY = 0.65;
const QUALITY_ALLOW = 0.65;
const QUALITY_OVERRIDE = 0.45;

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

/**
 * Calcula subscore y reasons/positives para tracking.
 */
function scoreTracking(t, breakdown, reasons, positive) {
  if (!t) {
    breakdown.tracking = 0;
    reasons.push('key_not_detected');
    return;
  }
  const keyDetected = t.key_detected ?? false;
  if (!keyDetected) {
    breakdown.tracking = 0;
    reasons.push('key_not_detected');
    return;
  }
  const centering = t.centering_score ?? 0;
  const coverage = t.coverage_score ?? 0;
  const stability = t.stability_score ?? 0;
  const pose = t.pose_score ?? 0;
  const sub = clamp01(
    centering * 0.3 + coverage * 0.25 + stability * 0.25 + pose * 0.2
  );
  breakdown.tracking = sub;
  if (centering < 0.5) reasons.push('key_not_centered');
  if (coverage < 0.4) reasons.push('low_coverage');
  if (stability < 0.5) reasons.push('low_stability');
  if (pose < 0.5) reasons.push('poor_pose');
  if (sub >= 0.6) positive.push('tracking_good');
}

/**
 * Calcula subscore para glare.
 */
function scoreGlare(g, breakdown, reasons, positive) {
  if (!g) {
    breakdown.glare = 0.5;
    return;
  }
  const glareScore = g.glare_score ?? 0;
  const critical = g.critical_glare_zone ?? false;
  const state = g.reflection_state ?? 'ok';
  const sub = clamp01(1 - glareScore * 1.2);
  breakdown.glare = sub;
  if (critical || state === 'critical') reasons.push('critical_glare');
  if (sub >= 0.7) positive.push('glare_ok');
}

/**
 * Calcula subscore para shape.
 */
function scoreShape(s, breakdown, reasons, positive) {
  if (!s) {
    breakdown.shape = 0;
    reasons.push('poor_mask');
    return;
  }
  const maskDetected = s.mask_detected ?? false;
  const maskConf = s.mask_confidence ?? 0;
  const contour = s.contour_score ?? 0;
  const keyComplete = s.key_complete ?? false;
  const sub = maskDetected
    ? clamp01(maskConf * 0.5 + contour * 0.35 + (keyComplete ? 0.15 : 0))
    : 0;
  breakdown.shape = sub;
  if (!maskDetected || maskConf < 0.3) reasons.push('poor_mask');
  if (!keyComplete && maskDetected) reasons.push('key_incomplete');
  if (sub >= 0.6) positive.push('shape_good');
}

/**
 * Calcula subscore para topdown.
 */
function scoreTopdown(td, breakdown, reasons, positive) {
  if (!td) {
    breakdown.topdown = 0.3;
    return;
  }
  const ready = td.topdown_ready ?? false;
  const align = td.alignment_score ?? 0;
  const conf = td.topdown_confidence ?? 0;
  const sub = ready
    ? clamp01(align * 0.4 + conf * 0.6)
    : clamp01(conf * 0.5);
  breakdown.topdown = sub;
  if (ready && conf < 0.4) reasons.push('low_topdown_confidence');
  if (sub >= 0.6) positive.push('topdown_good');
}

/**
 * Calcula subscore para contrast.
 */
function scoreContrast(c, breakdown) {
  if (!c) {
    breakdown.contrast = 0.5;
    return;
  }
  const gain = c.contrast_gain_score ?? 0;
  const helpful = c.contrast_helpful ?? false;
  const base = helpful ? 0.7 : 0.5;
  breakdown.contrast = clamp01(base + gain * 0.3);
}

/**
 * Calcula subscore para dissection.
 */
function scoreDissection(d, breakdown) {
  if (!d) {
    breakdown.dissection = 0.2;
    return;
  }
  const conf = d.dissection_confidence ?? 0;
  const tipVisible = d.tip_visible ?? false;
  const cutsVisible = d.cuts_visible ?? false;
  const sub = clamp01(conf * 0.6 + (tipVisible ? 0.2 : 0) + (cutsVisible ? 0.2 : 0));
  breakdown.dissection = sub;
}

/**
 * Calcula subscore para textZones.
 */
function scoreTextZones(tz, breakdown, reasons, positive) {
  if (!tz) {
    breakdown.textZones = 0.4;
    return;
  }
  const ocrVis = tz.ocr_visibility_score ?? 0;
  const textHead = tz.text_present_head ?? false;
  const textBlade = tz.text_present_blade ?? false;
  const sub = clamp01(ocrVis * 0.6 + (textHead || textBlade ? 0.2 : 0) + 0.2);
  breakdown.textZones = sub;
  if (ocrVis < 0.3 && tz.text_zones_ready) reasons.push('low_text_visibility');
  if (sub >= 0.5) positive.push('text_visible');
}

/**
 * Calcula subscore para damage.
 */
function scoreDamage(dmg, breakdown, reasons, positive) {
  if (!dmg) {
    breakdown.damage = 0.7;
    return;
  }
  const wearScore = dmg.wear_score ?? 0;
  const oxidation = dmg.oxidation_present ?? false;
  const surface = dmg.surface_damage ?? false;
  const sub = clamp01(1 - wearScore * 0.4 - (oxidation ? 0.2 : 0) - (surface ? 0.2 : 0));
  breakdown.damage = sub;
  if (wearScore >= 0.65) reasons.push('high_wear');
  if (oxidation) reasons.push('oxidation_present');
  if (surface) reasons.push('surface_damage_detected');
  if (sub >= 0.6) positive.push('damage_low');
}

/**
 * Fusiona señales y produce quality_score, reasons, recommended_action.
 *
 * @param {Object} opts - { tracking, glare, shape, topdown, contrast, dissection, textZones, damage }
 * @returns {Object} quality gate result
 */
export function analyzeQualityGateVision(opts = {}) {
  const breakdown = {
    tracking: 0,
    glare: 0.5,
    shape: 0,
    topdown: 0.3,
    contrast: 0.5,
    dissection: 0.2,
    textZones: 0.4,
    damage: 0.7,
  };
  const reasons = [];
  const positive = [];

  scoreTracking(opts.tracking, breakdown, reasons, positive);
  scoreGlare(opts.glare, breakdown, reasons, positive);
  scoreShape(opts.shape, breakdown, reasons, positive);
  scoreTopdown(opts.topdown, breakdown, reasons, positive);
  scoreContrast(opts.contrast, breakdown);
  scoreDissection(opts.dissection, breakdown);
  scoreTextZones(opts.textZones, breakdown, reasons, positive);
  scoreDamage(opts.damage, breakdown, reasons, positive);

  const weights = {
    tracking: 0.25,
    glare: 0.12,
    shape: 0.2,
    topdown: 0.1,
    contrast: 0.08,
    dissection: 0.1,
    textZones: 0.08,
    damage: 0.07,
  };

  let quality_score = 0;
  let weightSum = 0;
  for (const [k, w] of Object.entries(weights)) {
    quality_score += (breakdown[k] ?? 0.5) * w;
    weightSum += w;
  }
  quality_score = clamp01(weightSum > 0 ? quality_score / weightSum : 0.5);

  const hasCritical = reasons.some((r) =>
    ['critical_glare', 'key_not_detected'].includes(r)
  );
  const capture_ready =
    quality_score >= QUALITY_CAPTURE_READY && !hasCritical;

  let recommended_action = 'allow';
  if (quality_score >= QUALITY_ALLOW && !hasCritical) {
    recommended_action = 'allow';
  } else if (quality_score >= QUALITY_OVERRIDE) {
    recommended_action = 'allow_with_override';
  } else {
    recommended_action = 'block_recommended';
  }

  const block_reason = reasons[0] || (hasCritical ? 'critical_glare_or_key_not_detected' : 'quality_below_threshold');
  const quality_decision = recommended_action === 'block_recommended' ? 'block' : recommended_action;
  const quality_action = quality_decision;

  const modulesPresent =
    [opts.tracking, opts.glare, opts.shape].filter(Boolean).length;
  const quality_confidence = clamp01(0.3 + (modulesPresent / 8) * 0.7);
  const quality_ready = modulesPresent >= 2;

  return {
    quality_ready,
    quality_score,
    capture_ready,
    recommended_action,
    quality_decision,
    quality_action,
    block_reason,
    reasons,
    positive_signals: positive,
    quality_breakdown: breakdown,
    quality_confidence,
  };
}

/**
 * Snapshot de qualityGate para incluir al capturar.
 */
export function makeQualityGateSnapshot(result) {
  if (!result) return null;
  return {
    quality_ready: result.quality_ready,
    quality_score: result.quality_score,
    capture_ready: result.capture_ready,
    recommended_action: result.recommended_action,
    quality_decision: result.quality_decision || (result.recommended_action === 'block_recommended' ? 'block' : result.recommended_action),
    quality_action: result.quality_action || result.quality_decision || result.recommended_action,
    block_reason: result.block_reason || null,
    reasons: result.reasons || [],
    positive_signals: result.positive_signals || [],
    quality_breakdown: result.quality_breakdown || {},
    quality_confidence: result.quality_confidence,
  };
}

/** Flag para activar bloqueo real. Default false = no bloquear. */
export const QUALITY_GATE_ACTIVE_ENABLED_KEY = 'quality_gate_active_enabled';

/**
 * Decide si aplicar bloqueo activo y si override está permitido.
 * @param {Object} qualitySnapshot - snapshot de qualityGate
 * @param {boolean} canOverride - modo taller + sesión + debug
 * @returns {{ shouldBlock: boolean, override_allowed: boolean, block_reason: string|null }}
 */
export function computeQualityGateActiveDecision(qualitySnapshot, canOverride) {
  if (!qualitySnapshot) return { shouldBlock: false, override_allowed: false, block_reason: null };
  const decision = qualitySnapshot.quality_decision || qualitySnapshot.recommended_action;
  const isBlock = decision === 'block' || decision === 'block_recommended';
  const isOverride = decision === 'allow_with_override';
  const override_allowed = (isBlock || isOverride) && canOverride;
  return {
    shouldBlock: isBlock,
    override_allowed,
    block_reason: qualitySnapshot.block_reason || qualitySnapshot.reasons?.[0] || null,
  };
}
