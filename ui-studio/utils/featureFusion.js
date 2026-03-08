/**
 * featureFusion — módulo pasivo que fusiona todas las señales de visión en un paquete estructurado.
 * Modo PASIVO: resume, estructura, expone. NO bloquea captura.
 *
 * Prepara para: ranking, consistency, OCR, brand reconstruction, quality gate activo, UNKNOWN/open-set.
 */

const MIN_MODULES_FOR_READY = 4;

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

/**
 * Construye feature_bundle estructurado desde los módulos.
 */
function buildFeatureBundle(opts) {
  const t = opts.tracking;
  const g = opts.glare;
  const s = opts.shape;
  const td = opts.topdown;
  const c = opts.contrast;
  const d = opts.dissection;
  const tz = opts.textZones;
  const dm = opts.damage;
  const qg = opts.qualityGate;

  const geometry = {
    bbox: t?.key_detected && t?.bbox ? t.bbox : null,
    alignment: td?.alignment_score ?? 0,
    pose: t?.pose_score ?? 0,
    axis_ratio: td?.pose_quality ?? 0,
    centering: t?.centering_score ?? 0,
  };

  const visibility = {
    glare: 1 - (g?.glare_score ?? 0.5),
    text_visibility: tz?.ocr_visibility_score ?? 0,
    contrast: c?.contrast_helpful ? (0.6 + (c.contrast_gain_score ?? 0) * 0.4) : 0.5,
    mask_quality: s?.mask_confidence ?? 0,
    critical_glare: g?.critical_glare_zone ?? false,
  };

  const anatomy = {
    head_blade_ratio: d?.head_blade_ratio ?? 0,
    tip_visible: d?.tip_visible ?? false,
    cuts_visible: d?.cuts_visible ?? false,
    zone_confidence: d?.zone_confidence ?? {},
    dissection_ready: d?.dissection_ready ?? false,
  };

  const text_support = {
    text_present_head: tz?.text_present_head ?? false,
    text_present_blade: tz?.text_present_blade ?? false,
    ocr_candidate_regions: tz?.ocr_candidate_regions ?? [],
    text_contrast_score: tz?.text_contrast_score ?? 0,
  };

  const damage = {
    wear_level: dm?.wear_level ?? 'unknown',
    wear_score: dm?.wear_score ?? 0,
    oxidation_present: dm?.oxidation_present ?? false,
    oxidation_score: dm?.oxidation_score ?? 0,
    surface_damage: dm?.surface_damage ?? false,
    surface_damage_score: dm?.surface_damage_score ?? 0,
  };

  const quality = {
    quality_score: qg?.quality_score ?? 0,
    reasons: qg?.reasons ?? [],
    positive_signals: qg?.positive_signals ?? [],
    capture_ready: qg?.capture_ready ?? false,
    recommended_action: qg?.recommended_action ?? 'allow',
  };

  const capture_context = {
    key_detected: t?.key_detected ?? false,
    roi_score: t?.roi_score ?? 0,
    stability: t?.stability_score ?? 0,
    coverage: t?.coverage_score ?? 0,
    modules_present: [
      t, g, s, td, c, d, tz, dm, qg,
    ].filter(Boolean).length,
  };

  return {
    geometry,
    visibility,
    anatomy,
    text_support,
    damage,
    quality,
    capture_context,
  };
}

/**
 * Pesos de visibilidad según qué señales pesan más para legibilidad.
 */
function buildVisibilityWeights(bundle) {
  const v = bundle?.visibility ?? {};
  return {
    glare: clamp01(v.glare ?? 0.5),
    text_visibility: clamp01(v.text_visibility ?? 0.3),
    contrast: clamp01(v.contrast ?? 0.5),
    mask_quality: clamp01(v.mask_quality ?? 0.5),
  };
}

/**
 * Construye ranking_supports y ranking_conflicts.
 */
function buildRankingSignals(opts, bundle) {
  const supports = [];
  const conflicts = [];

  if (opts.shape?.mask_detected && (opts.shape?.mask_confidence ?? 0) >= 0.5) {
    supports.push('shape_good');
  }
  if (opts.topdown?.topdown_ready && (opts.topdown?.topdown_confidence ?? 0) >= 0.5) {
    supports.push('topdown_good');
  }
  if (opts.textZones?.text_present_head) {
    supports.push('text_visible_head');
  }
  if (opts.textZones?.text_present_blade) {
    supports.push('text_visible_blade');
  }
  if (opts.dissection?.cuts_visible) {
    supports.push('cuts_visible');
  }
  if ((opts.damage?.wear_score ?? 1) < 0.5) {
    supports.push('damage_low');
  }
  if ((opts.glare?.glare_score ?? 0) < 0.3 && !opts.glare?.critical_glare_zone) {
    supports.push('glare_ok');
  }

  if (opts.glare?.critical_glare_zone || opts.glare?.reflection_state === 'critical') {
    conflicts.push('critical_glare');
  }
  if (opts.shape?.mask_detected && !opts.shape?.key_complete) {
    conflicts.push('key_incomplete');
  }
  if ((opts.textZones?.ocr_visibility_score ?? 0) < 0.35 && opts.textZones?.text_zones_ready) {
    conflicts.push('low_text_visibility');
  }
  if ((opts.damage?.wear_score ?? 0) >= 0.65) {
    conflicts.push('high_wear');
  }
  if (opts.damage?.surface_damage) {
    conflicts.push('surface_damage_detected');
  }
  if (!opts.tracking?.key_detected) {
    conflicts.push('key_not_detected');
  }

  return { supports, conflicts };
}

/**
 * Score de apoyo para OCR futuro.
 */
function computeOcrSupportScore(bundle) {
  const ts = bundle?.text_support ?? {};
  const v = bundle?.visibility ?? {};
  const score =
    (ts.text_contrast_score ?? 0) * 0.3 +
    (v.text_visibility ?? 0) * 0.4 +
    (v.contrast ?? 0.5) * 0.2 +
    ((ts.text_present_head || ts.text_present_blade) ? 0.1 : 0);
  return clamp01(score);
}

/**
 * Score de apoyo para brand reconstruction (forma + texto + anatómico).
 */
function computeBrandSupportScore(bundle) {
  const geom = bundle?.geometry ?? {};
  const anat = bundle?.anatomy ?? {};
  const ts = bundle?.text_support ?? {};
  const q = bundle?.quality ?? {};
  const score =
    (geom.pose ?? 0) * 0.2 +
    (anat.dissection_ready ? 0.2 : 0.1) +
    ((ts.text_present_head || ts.text_present_blade) ? 0.2 : 0.05) +
    (q.quality_score ?? 0) * 0.35 +
    (anat.cuts_visible ? 0.1 : 0);
  return clamp01(score);
}

/**
 * Fusiona todas las señales y produce el paquete estructurado.
 *
 * @param {Object} opts - { tracking, glare, shape, topdown, contrast, dissection, textZones, damage, qualityGate }
 * @returns {Object} feature fusion result
 */
export function analyzeFeatureFusion(opts = {}) {
  const bundle = buildFeatureBundle(opts);
  const visibility_weights = buildVisibilityWeights(bundle);
  const { supports, conflicts } = buildRankingSignals(opts, bundle);
  const ocr_support_score = computeOcrSupportScore(bundle);
  const brand_support_score = computeBrandSupportScore(bundle);

  const modulesPresent = [
    opts.tracking,
    opts.glare,
    opts.shape,
    opts.topdown,
    opts.contrast,
    opts.dissection,
    opts.textZones,
    opts.damage,
    opts.qualityGate,
  ].filter(Boolean).length;

  const hasShape = opts.shape?.mask_detected ?? false;
  const hasQuality = opts.qualityGate != null;
  const fusion_ready =
    modulesPresent >= MIN_MODULES_FOR_READY &&
    (hasShape || hasQuality);

  const fusion_confidence = clamp01(
    0.2 + (modulesPresent / 9) * 0.5 + (hasShape ? 0.15 : 0) + (hasQuality ? 0.15 : 0)
  );

  return {
    fusion_ready,
    fusion_confidence,
    feature_bundle: bundle,
    visibility_weights,
    ranking_supports: supports,
    ranking_conflicts: conflicts,
    ocr_support_score,
    brand_support_score,
  };
}

/**
 * Snapshot de featureFusion para incluir al capturar.
 */
export function makeFeatureFusionSnapshot(result) {
  if (!result) return null;
  return {
    fusion_ready: result.fusion_ready,
    fusion_confidence: result.fusion_confidence,
    feature_bundle: result.feature_bundle,
    visibility_weights: result.visibility_weights,
    ranking_supports: result.ranking_supports || [],
    ranking_conflicts: result.ranking_conflicts || [],
    ocr_support_score: result.ocr_support_score,
    brand_support_score: result.brand_support_score,
  };
}
