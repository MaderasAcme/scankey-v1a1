/**
 * catalogMatchingActive — matching activo contra catálogo desde señales de visión.
 * NO hace matching ciego. Usa: shape, topdown, dissection, text_zones, OCR, brand_reconstruction, feature_fusion.
 * Mantiene trazabilidad del porqué del match.
 */

import { getCatalogRefs, hasCatalogRefs } from './catalogRefs';

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

/**
 * Extrae tokens alfanuméricos útiles para matching (ref, model, family).
 */
function extractTokens(text) {
  if (!text || typeof text !== 'string') return [];
  const normalized = text.toUpperCase().replace(/[^A-Z0-9]/g, ' ');
  const tokens = normalized.split(/\s+/).filter(Boolean);
  return [...new Set(tokens)].filter((t) => t.length >= 2);
}

/**
 * Cruza señales de visión con catálogo y devuelve candidatos puntuados.
 *
 * @param {Object} snapshots - { shape, topdown, dissection, textZones, ocrReal, brandReconstruction, featureFusion }
 * @returns {Object} { catalog_match_ready, catalog_match_candidates, catalog_match_confidence, catalog_match_reasoning }
 */
export function runCatalogMatching(snapshots = {}) {
  const refs = getCatalogRefs();
  const empty = {
    catalog_match_ready: false,
    catalog_match_candidates: [],
    catalog_match_confidence: 0,
    catalog_match_reasoning: [],
  };

  if (!hasCatalogRefs() || !refs || Object.keys(refs).length === 0) {
    return { ...empty, catalog_match_reasoning: ['catalog_empty'] };
  }

  const ocr = snapshots.ocrReal || {};
  const br = snapshots.brandReconstruction || {};
  const tz = snapshots.textZones || {};
  const ff = snapshots.featureFusion || {};
  const shape = snapshots.shape || {};
  const dissection = snapshots.dissection || {};

  const reasoning = [];

  // Señales mínimas para activar matching
  const hasOcr = ocr.ocr_ready && (ocr.head_text || ocr.blade_text);
  const hasBrand = !!br.brand_partial_match && (br.brand_match_confidence ?? 0) >= 0.4;
  const hasShape = shape.mask_detected && (shape.mask_confidence ?? 0) >= 0.4;
  const hasDissection = dissection.dissection_ready === true;
  const hasTextZones = tz.text_zones_ready === true;

  const catalog_match_ready =
    hasCatalogRefs() &&
    (hasOcr || hasBrand || (hasShape && hasDissection && (hasTextZones || hasBrand)));

  if (!catalog_match_ready) {
    if (!hasOcr && !hasBrand) reasoning.push('no_ocr_no_brand');
    if (!hasShape && !hasDissection) reasoning.push('insufficient_vision');
    return { ...empty, catalog_match_reasoning: reasoning.length ? reasoning : ['signals_weak'] };
  }

  // Tokens de búsqueda
  const tokens = new Set();
  if (br.brand_partial_match) {
    tokens.add(String(br.brand_partial_match).toUpperCase());
    reasoning.push('brand_signal');
  }
  extractTokens(ocr.head_text || '').forEach((t) => {
    tokens.add(t);
    if (ocr.head_confidence >= 0.5) reasoning.push('ocr_head');
  });
  extractTokens(ocr.blade_text || '').forEach((t) => {
    tokens.add(t);
    if (ocr.blade_confidence >= 0.5) reasoning.push('ocr_blade');
  });

  if (tokens.size === 0 && !hasBrand) {
    return { ...empty, catalog_match_ready: true, catalog_match_reasoning: ['no_search_tokens'] };
  }

  // Puntuación por coincidencia
  const candidates = [];
  const refList = Object.values(refs);

  for (const entry of refList) {
    const ref = (entry.ref || entry.model || '').toUpperCase();
    const model = (entry.model || '').toUpperCase();
    const family = (entry.family || '').toUpperCase();
    const brand = (entry.brand || '').toUpperCase();

    let score = 0;
    const matchReasons = [];

    // Coincidencia exacta ref
    if (tokens.has(ref)) {
      score += 0.9;
      matchReasons.push('ref_exact');
    }
    if (ref !== model && tokens.has(model)) {
      score += 0.85;
      matchReasons.push('model_exact');
    }
    if (tokens.has(family)) {
      score += 0.5;
      matchReasons.push('family_match');
    }
    if (brand && tokens.has(brand)) {
      score += 0.35;
      matchReasons.push('brand_match');
    }

    // Substring (ref contiene token o token contiene ref)
    if (matchReasons.length === 0) {
      for (const t of tokens) {
        if (ref.includes(t) || t.includes(ref)) {
          score += 0.6;
          matchReasons.push('ref_partial');
          break;
        }
        if (model && (model.includes(t) || t.includes(model))) {
          score += 0.5;
          matchReasons.push('model_partial');
          break;
        }
      }
    }

    if (score <= 0) continue;

    // Peso por calidad de señales
    let signalWeight = 1;
    if (ocr.head_confidence >= 0.6 || ocr.blade_confidence >= 0.6) {
      signalWeight *= 1.1;
    }
    if ((br.brand_match_confidence ?? 0) >= 0.5 && brand && tokens.has(brand)) {
      signalWeight *= 1.05;
    }
    if ((ff.fusion_ready && ff.brand_support_score >= 0.4) || (tz.ocr_visibility_score ?? 0) >= 0.5) {
      signalWeight *= 1.05;
    }

    const priority = (entry.priority ?? 50) / 100;
    const finalScore = clamp01(score * signalWeight * (0.7 + priority * 0.3));

    candidates.push({
      ref: entry.ref,
      model: entry.model,
      family: entry.family,
      brand: entry.brand,
      score: finalScore,
      reasons: matchReasons,
      catalog_priority: entry.priority,
    });
  }

  candidates.sort((a, b) => b.score - a.score);
  const top = candidates.slice(0, 5);

  const catalog_match_confidence =
    top.length > 0 ? top[0].score : 0;

  return {
    catalog_match_ready: true,
    catalog_match_candidates: top,
    catalog_match_confidence,
    catalog_match_reasoning: [...new Set(reasoning)],
  };
}

/**
 * Snapshot de catalogMatching para incluir al capturar.
 */
export function makeCatalogMatchingSnapshot(result) {
  if (!result) return null;
  return {
    catalog_match_ready: result.catalog_match_ready,
    catalog_match_candidates: result.catalog_match_candidates || [],
    catalog_match_confidence: result.catalog_match_confidence ?? 0,
    catalog_match_reasoning: result.catalog_match_reasoning || [],
  };
}
