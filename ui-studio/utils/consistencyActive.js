/**
 * consistencyActive — refuerza consistencia con señales del bloque visual.
 * Usa: brand_reconstruction, text_zones, ocrReal, key_dissection, damage_sense,
 *      feature_fusion, quality_gate_vision, glare, shape.
 *
 * No inventa conflictos. Reforza si varias señales apuntan a lo mismo.
 * Penaliza solo con señal clara: brand conflict, baja visibilidad texto,
 * glare crítico, daño alto, key incomplete.
 */

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function _strNorm(s) {
  if (s == null) return '';
  return String(s || '').trim().toLowerCase();
}

function _brandsMatch(a, b) {
  if (!a || !b) return false;
  const aa = _strNorm(a);
  const bb = _strNorm(b);
  return aa === bb || aa.includes(bb) || bb.includes(aa);
}

function _brandsConflict(a, b) {
  if (!a || !b) return false;
  if (_brandsMatch(a, b)) return false;
  return _strNorm(a).length > 2 && _strNorm(b).length > 2;
}

/**
 * Calcula consistencia aumentada con visión.
 *
 * @param {Object} result - API result { results, debug }
 * @param {Object} capturedPhotos - { A: { snapshots }, B?: { snapshots } }
 * @returns {Object} { consistency_score, consistency_level, consistency_supports, consistency_conflicts, consistency_reasoning }
 */
export function computeVisionAugmentedConsistency(result, capturedPhotos) {
  const snapshots = capturedPhotos?.A?.snapshots || {};
  const br = snapshots.brandReconstruction;
  const tz = snapshots.textZones;
  const ocr = snapshots.ocrReal;
  const dissection = snapshots.dissection;
  const damage = snapshots.damage;
  const ff = snapshots.featureFusion;
  const qg = snapshots.qualityGate;
  const glare = snapshots.glare;
  const shape = snapshots.shape;

  const results = result?.results || result?.candidates || [];
  const top1 = results[0] || {};
  const backendScore = result?.debug?.consistency_score;
  const backendSupports = Array.isArray(result?.debug?.consistency_supports) ? result.debug.consistency_supports : [];
  const backendConflicts = Array.isArray(result?.debug?.consistency_conflicts) ? result.debug.consistency_conflicts : [];

  let score = typeof backendScore === 'number' ? backendScore : 70;
  const supports = [...backendSupports];
  const conflicts = [...backendConflicts];
  const reasoning = [];

  const hasVision = !!(br || tz || ocr || dissection || damage || ff || qg || glare || shape);

  if (!hasVision) {
    return {
      consistency_score: score,
      consistency_level: score >= 75 ? 'high' : score >= 50 ? 'medium' : 'low',
      consistency_supports: supports,
      consistency_conflicts: conflicts,
      consistency_reasoning: reasoning,
    };
  }

  // --- SUPPORTS: reforzar cuando señales apuntan a lo mismo ---

  const top1Brand = _strNorm(top1.brand || top1.model || top1.label);
  const visionBrand = br?.brand_partial_match ? _strNorm(br.brand_partial_match) : '';
  const brandConf = br?.brand_match_confidence ?? 0;

  if (visionBrand && brandConf >= 0.5 && top1Brand && _brandsMatch(visionBrand, top1Brand)) {
    if (!supports.includes('vision_brand_support')) supports.push('vision_brand_support');
    score += 6;
    reasoning.push('Marca visión coherente con identificación');
  }

  const ocrVis = tz?.ocr_visibility_score ?? 0;
  const textPresent = tz?.text_present_head || tz?.text_present_blade;
  if (ocrVis >= 0.4 && textPresent && (top1.brand_head_text || top1.brand_blade_text || top1.ocr_brand_guess)) {
    if (!supports.includes('vision_text_support')) supports.push('vision_text_support');
    score += 4;
    reasoning.push('Texto visible apoya identificación');
  }

  if (ocr?.ocr_ready) {
    const headMatch = ocr.head_text && top1Brand && _brandsMatch(ocr.head_text, top1Brand);
    const bladeMatch = ocr.blade_text && top1Brand && _brandsMatch(ocr.blade_text, top1Brand);
    if (headMatch || bladeMatch) {
      if (!supports.includes('vision_ocr_support')) supports.push('vision_ocr_support');
      score += 5;
      reasoning.push('OCR zonal coherente');
    }
  }

  if (dissection?.dissection_ready && (dissection?.text_zone_head_visible || dissection?.text_zone_blade_visible)) {
    if (!supports.includes('vision_dissection_support')) supports.push('vision_dissection_support');
    score += 3;
  }

  if (qg?.capture_ready || (qg?.quality_score ?? 0) >= 0.6) {
    if (!supports.includes('vision_quality_support')) supports.push('vision_quality_support');
    score += 2;
  }

  if (ff?.fusion_ready && (ff?.brand_support_score ?? 0) >= 0.5) {
    if (!supports.includes('vision_feature_support')) supports.push('vision_feature_support');
    score += 2;
  }

  // --- CONFLICTS/PENALTIES: solo con señal clara, no inventar ---

  if (visionBrand && brandConf >= 0.5 && top1Brand && _brandsConflict(visionBrand, top1Brand)) {
    if (!conflicts.includes('vision_brand_conflict')) conflicts.push('vision_brand_conflict');
    score -= 15;
    reasoning.push('Marca visión contradice identificación');
  }

  if ((ocrVis < 0.35 && textPresent) || (tz?.text_zones_ready && ocrVis < 0.25)) {
    if (!conflicts.includes('vision_low_text_visibility')) conflicts.push('vision_low_text_visibility');
    score -= 6;
    reasoning.push('Baja visibilidad de texto');
  }

  if (glare?.critical_glare_zone || glare?.reflection_state === 'critical') {
    if (!conflicts.includes('vision_critical_glare')) conflicts.push('vision_critical_glare');
    score -= 8;
    reasoning.push('Reflejo crítico');
  }

  const wearHigh = damage?.wear_level === 'high' || (damage?.wear_score ?? 0) >= 0.65;
  const surfaceBad = damage?.surface_damage === true;
  if (wearHigh || surfaceBad) {
    if (!conflicts.includes('vision_high_damage')) conflicts.push('vision_high_damage');
    score -= 5;
    reasoning.push('Desgaste o daño superficial');
  }

  if (shape?.mask_detected && shape?.key_complete === false) {
    if (!conflicts.includes('vision_key_incomplete')) conflicts.push('vision_key_incomplete');
    score -= 4;
    reasoning.push('Llave recortada o incompleta');
  }

  score = Math.max(0, Math.min(100, score));
  const level = score >= 75 ? 'high' : score >= 50 ? 'medium' : 'low';

  return {
    consistency_score: Math.round(score * 10) / 10,
    consistency_level: level,
    consistency_supports: [...new Set(supports)].slice(0, 8),
    consistency_conflicts: [...new Set(conflicts)].slice(0, 8),
    consistency_reasoning: [...new Set(reasoning)].slice(0, 6),
  };
}
