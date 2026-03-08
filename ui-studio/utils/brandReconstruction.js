/**
 * brand_reconstruction — módulo pasivo de estimación de marca/logo.
 * Modo PASIVO: estima marca parcial usando evidencia visual incompleta.
 * Combina evidencia con metadatos ligeros si existen.
 *
 * NO ejecuta OCR real. NO vende certeza absoluta. NO bloquea captura.
 * Degrada con gracia si no hay evidencia suficiente.
 */

import { getBrandCandidatesByZone, hasMetadataSupport } from './brandMetadataLite';

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

/**
 * Determina zona de evidencia desde textZones y dissection.
 */
function inferEvidenceZone(opts) {
  const tz = opts.textZones;
  const d = opts.dissection;
  const head = (tz?.text_present_head ?? d?.text_zone_head_visible ?? false);
  const blade = (tz?.text_present_blade ?? d?.text_zone_blade_visible ?? false);
  if (head && blade) return 'both';
  if (head) return 'head';
  if (blade) return 'blade';
  return 'none';
}

/**
 * Recolecta razones de reconstrucción según evidencia y penalizaciones.
 */
function buildReconstructionReasons(opts, zone, mode) {
  const reasons = [];
  const tz = opts.textZones;
  const g = opts.glare;
  const s = opts.shape;
  const c = opts.contrast;
  const qg = opts.qualityGate;
  const dm = opts.damage;
  const ff = opts.featureFusion;

  if (tz?.text_present_head) reasons.push('text_visible_head');
  if (tz?.text_present_blade) reasons.push('text_visible_blade');
  if ((tz?.ocr_visibility_score ?? 0) < 0.35 && tz?.text_zones_ready) {
    reasons.push('low_text_visibility');
  }
  if (c?.contrast_helpful || (c?.contrast_gain_score ?? 0) > 0.1) {
    reasons.push('contrast_helpful');
  }
  if (g?.critical_glare_zone) reasons.push('critical_glare');
  if ((qg?.quality_score ?? 0) >= 0.5) reasons.push('quality_support');
  if (hasMetadataSupport() && zone !== 'none') {
    reasons.push('metadata_zone_match');
  } else if (hasMetadataSupport() && zone === 'none') {
    reasons.push('metadata_zone_weak');
  }
  if (s?.mask_detected && (s?.mask_confidence ?? 0) >= 0.5) {
    reasons.push('shape_support');
  }

  if (s?.mask_detected && !s?.key_complete) {
    reasons.push('key_incomplete');
  }
  if (dm?.surface_damage) {
    reasons.push('surface_damage_detected');
  }

  if (mode === 'none' || reasons.length === 0) {
    reasons.push('insufficient_evidence');
  }

  return [...new Set(reasons)];
}

/**
 * Calcula confianza de coincidencia (0..1).
 */
function computeMatchConfidence(opts, zone, reasons) {
  const tz = opts.textZones;
  const c = opts.contrast;
  const qg = opts.qualityGate;
  const ff = opts.featureFusion;
  const g = opts.glare;
  const s = opts.shape;
  const dm = opts.damage;

  let conf = 0;
  if (zone === 'both') conf += 0.25;
  else if (zone === 'head') conf += 0.2;
  else if (zone === 'blade') conf += 0.15;

  conf += (tz?.ocr_visibility_score ?? 0) * 0.25;
  conf += (tz?.text_contrast_score ?? 0) * 0.15;
  conf += (c?.contrast_gain_score ?? 0) * 0.1;
  conf += (qg?.quality_score ?? 0) * 0.15;
  conf += (ff?.brand_support_score ?? 0) * 0.2;

  if (g?.critical_glare_zone) conf *= 0.5;
  if (s?.mask_detected && !s?.key_complete) conf *= 0.85;
  if ((tz?.ocr_visibility_score ?? 0) < 0.35) conf *= 0.7;
  if (dm?.surface_damage) conf *= 0.9;

  return clamp01(conf);
}

/**
 * Determina modo de reconstrucción.
 */
function inferReconstructionMode(opts, zone, matchConf) {
  const tz = opts.textZones;
  const hasText = tz?.text_present_head || tz?.text_present_blade;
  const textStrong = hasText && (tz?.ocr_visibility_score ?? 0) >= 0.4;
  const hasMetadata = hasMetadataSupport();
  const metadataZoneOk = hasMetadata && zone !== 'none';
  const qualityOk = (opts.qualityGate?.quality_score ?? 0) >= 0.5;
  const shapeOk = opts.shape?.mask_detected && (opts.shape?.mask_confidence ?? 0) >= 0.5;

  if (matchConf < 0.25) return 'none';
  if (textStrong && metadataZoneOk && qualityOk) return 'combined';
  if (textStrong) return 'partial_text';
  if (!hasText && metadataZoneOk && (shapeOk || qualityOk)) return 'partial_logo';
  if (metadataZoneOk) return 'metadata_assisted';
  return 'none';
}

/**
 * Construye candidatos de marca.
 */
function buildBrandCandidates(zone, mode, matchConf, reasons) {
  if (mode === 'none') return [];
  const meta = getBrandCandidatesByZone(zone);
  if (meta.length === 0) return [];

  const reasonStr = reasons.filter(r =>
    ['text_visible_head', 'text_visible_blade', 'metadata_zone_match', 'metadata_assisted', 'contrast_helpful'].includes(r)
  ).join(' + ') || 'metadata_assisted';

  return meta.slice(0, 3).map(({ brand, priority }) => ({
    brand,
    confidence: clamp01(matchConf * priority),
    reason: reasonStr,
  })).filter(c => c.confidence >= 0.2);
}

/**
 * Analiza brand reconstruction a partir de señales de visión.
 *
 * @param {Object} opts - { textZones, dissection, contrast, featureFusion, qualityGate, topdown?, shape?, glare?, damage? }
 * @returns {Object} resultado brand_reconstruction
 */
export function analyzeBrandReconstruction(opts = {}) {
  const tz = opts.textZones;
  const ff = opts.featureFusion;

  const zone = inferEvidenceZone(opts);

  const hasBase = (tz?.text_zones_ready && ff?.fusion_ready) ||
    (hasMetadataSupport() && (tz?.ocr_visibility_score ?? 0) >= 0.25);
  const brand_reconstruction_ready = hasBase;

  let mode = 'none';
  let matchConf = 0;
  let reasons = [];

  if (brand_reconstruction_ready) {
    reasons = buildReconstructionReasons(opts, zone, 'pending');
    matchConf = computeMatchConfidence(opts, zone, reasons);
    mode = inferReconstructionMode(opts, zone, matchConf);
    if (mode === 'none') {
      reasons = buildReconstructionReasons(opts, zone, 'none');
    }
  } else {
    reasons = buildReconstructionReasons(opts, zone, 'none');
  }

  const brand_partial_match = matchConf >= 0.45
    ? (buildBrandCandidates(zone, mode, matchConf, reasons)[0]?.brand ?? null)
    : null;

  const candidates = buildBrandCandidates(zone, mode, matchConf, reasons);
  const brand_support_score = ff?.brand_support_score ?? clamp01(
    (tz?.text_contrast_score ?? 0) * 0.3 +
    ((tz?.text_present_head || tz?.text_present_blade) ? 0.3 : 0) +
    (zone !== 'none' ? 0.2 : 0) +
    ((opts.qualityGate?.quality_score ?? 0) * 0.2)
  );

  return {
    brand_reconstruction_ready,
    brand_partial_match,
    brand_match_confidence: clamp01(matchConf),
    brand_evidence_zone: zone,
    brand_reconstruction_reason: reasons,
    brand_reconstruction_mode: mode,
    brand_candidates: candidates,
    brand_support_score,
  };
}

/**
 * Snapshot de brandReconstruction para incluir al capturar.
 */
export function makeBrandReconstructionSnapshot(result) {
  if (!result) return null;
  return {
    brand_reconstruction_ready: result.brand_reconstruction_ready,
    brand_partial_match: result.brand_partial_match,
    brand_match_confidence: result.brand_match_confidence,
    brand_evidence_zone: result.brand_evidence_zone,
    brand_reconstruction_reason: result.brand_reconstruction_reason || [],
    brand_reconstruction_mode: result.brand_reconstruction_mode,
    brand_candidates: result.brand_candidates || [],
    brand_support_score: result.brand_support_score,
  };
}
