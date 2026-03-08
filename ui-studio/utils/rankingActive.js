/**
 * rankingActive — capa que aplica señales de visión al ranking de candidatos.
 * Usa: shape, topdown, text_zones, ocrReal, brand_reconstruction, damage,
 *      quality_gate, feature_fusion. Opcionalmente geo-aware (país/zona/tienda).
 *
 * Empuja candidatos buenos, penaliza malos, mantiene trazabilidad.
 * No reescribe el motor: añade delta sobre confidence base.
 * La visión sigue mandando; el bonus geo es pequeño.
 */

import { applyGeoAwareRanking, getGeoContext } from './geoAwareRanking';

const DELTA_CAP = 0.08;
const BOOST_BRAND_MATCH = 0.05;
const BOOST_OCR_MATCH = 0.04;
const BOOST_TEXT_ALIGNED = 0.02;
const PENALTY_BRAND_CONFLICT = -0.06;
const PENALTY_CAPTURE_BAD = -0.03;
const PENALTY_DAMAGE_HIGH = -0.02;
const PENALTY_LOW_VISIBILITY = -0.02;

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
 * Calcula delta y ajustes por candidato (visión + geo).
 *
 * @param {Object[]} results - candidatos del API
 * @param {Object} capturedPhotos - { A: { snapshots } }
 * @param {Object} [geoContext] - contexto geo opcional (si no se pasa, usa getGeoContext())
 * @returns {Object} { ranking_ready, ranking_adjustments, ranking_supports, ranking_conflicts, ranking_delta_score, sortedResults, geo_ranking_ready?, geo_bonus?, geo_reasoning?, geo_context_used? }
 */
export function applyVisionRanking(results, capturedPhotos, geoContext) {
  const snapshots = capturedPhotos?.A?.snapshots || {};
  const ff = snapshots.featureFusion;
  const br = snapshots.brandReconstruction;
  const tz = snapshots.textZones;
  const ocr = snapshots.ocrReal;
  const shape = snapshots.shape;
  const topdown = snapshots.topdown;
  const damage = snapshots.damage;
  const qg = snapshots.qualityGate;

  const ranking_supports = Array.isArray(ff?.ranking_supports) ? [...ff.ranking_supports] : [];
  const ranking_conflicts = Array.isArray(ff?.ranking_conflicts) ? [...ff.ranking_conflicts] : [];

  const hasVision = !!(ff || br || tz || ocr || shape || topdown || damage || qg);
  const ranking_ready = hasVision && ff?.fusion_ready;

  if (!results?.length || !Array.isArray(results)) {
    return {
      ranking_ready: false,
      ranking_adjustments: [],
      ranking_supports,
      ranking_conflicts,
      ranking_delta_score: [],
      sortedResults: results || [],
    };
  }

  const visionBrand = br?.brand_partial_match ? _strNorm(br.brand_partial_match) : '';
  const brandConf = br?.brand_match_confidence ?? 0;

  const captureBad =
    (shape?.mask_detected && shape?.key_complete === false) ||
    (qg?.capture_ready === false && (qg?.quality_score ?? 0) < 0.4);
  const damageHigh = damage?.wear_level === 'high' || (damage?.wear_score ?? 0) >= 0.65;
  const lowVisibility = (tz?.ocr_visibility_score ?? 0) < 0.35 && tz?.text_zones_ready;

  const adjustments = results.map((c, idx) => {
    const candSupports = [];
    const candConflicts = [];
    let delta = 0;

    const candBrand = _strNorm(c.brand || c.model || c.label);
    const candHeadText = _strNorm(c.brand_head_text || c.ocr_brand_guess);
    const candBladeText = _strNorm(c.brand_blade_text);

    if (visionBrand && brandConf >= 0.5) {
      if (_brandsMatch(visionBrand, candBrand)) {
        candSupports.push('vision_brand_match');
        delta += BOOST_BRAND_MATCH;
      } else if (_brandsConflict(visionBrand, candBrand)) {
        candConflicts.push('vision_brand_conflict');
        delta += PENALTY_BRAND_CONFLICT;
      }
    }

    if (ocr?.ocr_ready) {
      const headMatch = ocr.head_text && candBrand && _brandsMatch(ocr.head_text, candBrand);
      const bladeMatch = ocr.blade_text && candBrand && _brandsMatch(ocr.blade_text, candBrand);
      if (headMatch || bladeMatch) {
        candSupports.push('vision_ocr_match');
        delta += BOOST_OCR_MATCH;
      }
    }

    if (tz?.text_present_head || tz?.text_present_blade) {
      if ((candHeadText && _brandsMatch(candHeadText, candBrand)) || (candBladeText && _brandsMatch(candBladeText, candBrand))) {
        candSupports.push('vision_text_aligned');
        delta += BOOST_TEXT_ALIGNED;
      }
    }

    if (captureBad) {
      candConflicts.push('vision_capture_weak');
      delta += PENALTY_CAPTURE_BAD;
    }
    if (damageHigh) {
      candConflicts.push('vision_damage_high');
      delta += PENALTY_DAMAGE_HIGH;
    }
    if (lowVisibility && (candHeadText || candBladeText)) {
      candConflicts.push('vision_low_text_visibility');
      delta += PENALTY_LOW_VISIBILITY;
    }

    delta = Math.max(-DELTA_CAP, Math.min(DELTA_CAP, delta));

    return {
      rank: c.rank ?? idx + 1,
      index: idx,
      delta,
      supports: candSupports,
      conflicts: candConflicts,
    };
  });

  const ranking_delta_score = adjustments.map((a) => a.delta);

  const geoResult = applyGeoAwareRanking(results, geoContext ?? getGeoContext());
  const geoBonuses = geoResult.geo_bonus || results.map(() => 0);

  const baseConf = (c) => clamp01(c.confidence ?? c.conf ?? c.score ?? 0);
  const sortedResults = [...results].map((c, i) => ({ ...c, _rankIdx: i })).sort((a, b) => {
    const adjA = adjustments[a._rankIdx];
    const adjB = adjustments[b._rankIdx];
    const geoA = geoBonuses[a._rankIdx] ?? 0;
    const geoB = geoBonuses[b._rankIdx] ?? 0;
    const scoreA = baseConf(a) + (adjA?.delta ?? 0) + geoA;
    const scoreB = baseConf(b) + (adjB?.delta ?? 0) + geoB;
    return scoreB - scoreA;
  }).map((c, i) => {
    const { _rankIdx, ...rest } = c;
    const adj = adjustments[_rankIdx];
    const geoBonus = geoBonuses[_rankIdx] ?? 0;
    return {
      ...rest,
      rank: i + 1,
      ranking_delta: adj?.delta,
      ranking_supports: adj?.supports || [],
      ranking_conflicts: adj?.conflicts || [],
      ...(geoResult.geo_ranking_ready && geoBonus > 0 ? { ranking_geo_bonus: geoBonus } : {}),
    };
  });

  return {
    ranking_ready,
    ranking_adjustments: adjustments,
    ranking_supports,
    ranking_conflicts,
    ranking_delta_score,
    sortedResults,
    geo_ranking_ready: geoResult.geo_ranking_ready,
    geo_bonus: geoBonuses,
    geo_reasoning: geoResult.geo_reasoning,
    geo_context_used: geoResult.geo_context_used,
  };
}
