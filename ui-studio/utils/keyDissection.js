/**
 * keyDissection — módulo pasivo de división anatómica de la llave.
 * Modo PASIVO: mide y expone señales, NO bloquea captura.
 * Heurísticas ligeras basadas en shape_bbox y topdown_normalizer.
 *
 * Divide la llave en zonas funcionales para alimentar:
 * OCR por zonas, brand reconstruction, consistency, ranking, quality_gate_vision.
 */

const ANALYZE_WIDTH = 120;
const ANALYZE_HEIGHT = 90;
const BORDER_MARGIN_PX = 3;
const MIN_DISSECTION_CONFIDENCE = 0.2;

// Proporciones típicas de una llave a lo largo del eje longitudinal (head → tip)
const HEAD_END = 0.22;      // head: 0% - 22%
const NECK_END = 0.30;      // neck: 22% - 30%
const BLADE_END = 0.85;     // blade: 30% - 85%
// tip: 85% - 100%

// Subzonas de texto
const TEXT_HEAD_CENTER = 0.6;   // centro 60% del head
const TEXT_BLADE_CENTER = 0.6;  // centro 60% del blade (perpendicular al eje)

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

/**
 * Clamp bbox a límites de la imagen.
 */
function clampBbox(bbox, w, h) {
  if (!bbox) return null;
  const x1 = Math.max(0, bbox.x);
  const y1 = Math.max(0, bbox.y);
  const x2 = Math.min(w, bbox.x + bbox.w);
  const y2 = Math.min(h, bbox.y + bbox.h);
  if (x2 <= x1 || y2 <= y1) return null;
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

/**
 * Comprueba si un bbox está dentro de los márgenes (no recortado).
 */
function isZoneInsideFrame(bbox, w, h, margin) {
  if (!bbox || bbox.w < 1 || bbox.h < 1) return false;
  return (
    bbox.x >= margin &&
    bbox.y >= margin &&
    bbox.x + bbox.w <= w - margin &&
    bbox.y + bbox.h <= h - margin
  );
}

/**
 * Particiona un rectángulo base a lo largo del eje longitudinal.
 * baseBbox: { x, y, w, h } en coords de imagen
 * horizontal: true si el eje largo es w (llave horizontal)
 * Devuelve zonas como { x, y, w, h } en coords de imagen.
 */
function partitionZones(baseBbox, horizontal) {
  if (!baseBbox || baseBbox.w < 2 || baseBbox.h < 2) return null;

  const { x, y, w, h } = baseBbox;
  const len = horizontal ? w : h;
  const wid = horizontal ? h : w;

  const slice = (t0, t1) => {
    const a = t0 * len;
    const b = t1 * len;
    const segLen = b - a;
    if (segLen < 1) return null;
    if (horizontal) {
      return { x: x + a, y, w: segLen, h };
    }
    return { x, y: y + a, w, h: segLen };
  };

  const head = slice(0, HEAD_END);
  const neck = slice(HEAD_END, NECK_END);
  const blade = slice(NECK_END, BLADE_END);
  const tip = slice(BLADE_END, 1);

  // cuts_region: borde funcional de la blade (misma zona que blade en Fase 1)
  const cuts_region = blade ? { ...blade } : null;

  // text_region_head: subzona central del head
  const text_region_head = head
    ? (() => {
        const m = (1 - TEXT_HEAD_CENTER) / 2;
        if (horizontal) {
          const dw = head.w * m;
          const dh = head.h * m;
          return { x: head.x + dw, y: head.y + dh, w: head.w * TEXT_HEAD_CENTER, h: head.h * TEXT_HEAD_CENTER };
        }
        const dw = head.w * m;
        const dh = head.h * m;
        return { x: head.x + dw, y: head.y + dh, w: head.w * TEXT_HEAD_CENTER, h: head.h * TEXT_HEAD_CENTER };
      })()
    : null;

  // text_region_blade: franja central longitudinal de la blade
  const text_region_blade = blade
    ? (() => {
        const m = (1 - TEXT_BLADE_CENTER) / 2;
        if (horizontal) {
          const dh = blade.h * m;
          return { x: blade.x, y: blade.y + dh, w: blade.w, h: blade.h * TEXT_BLADE_CENTER };
        }
        const dw = blade.w * m;
        return { x: blade.x + dw, y: blade.y, w: blade.w * TEXT_BLADE_CENTER, h: blade.h };
      })()
    : null;

  return {
    head: head ? clampBbox(head, ANALYZE_WIDTH, ANALYZE_HEIGHT) : null,
    neck: neck ? clampBbox(neck, ANALYZE_WIDTH, ANALYZE_HEIGHT) : null,
    blade: blade ? clampBbox(blade, ANALYZE_WIDTH, ANALYZE_HEIGHT) : null,
    tip: tip ? clampBbox(tip, ANALYZE_WIDTH, ANALYZE_HEIGHT) : null,
    cuts_region: cuts_region ? clampBbox(cuts_region, ANALYZE_WIDTH, ANALYZE_HEIGHT) : null,
    text_region_head: text_region_head ? clampBbox(text_region_head, ANALYZE_WIDTH, ANALYZE_HEIGHT) : null,
    text_region_blade: text_region_blade ? clampBbox(text_region_blade, ANALYZE_WIDTH, ANALYZE_HEIGHT) : null,
  };
}

/**
 * Calcula head_blade_ratio (área head / área blade) para proporción anatómica.
 */
function computeHeadBladeRatio(zones) {
  if (!zones?.head || !zones?.blade) return 0;
  const headArea = zones.head.w * zones.head.h;
  const bladeArea = zones.blade.w * zones.blade.h;
  if (bladeArea <= 0) return 0;
  return clamp01(headArea / bladeArea);
}

function makeEmptyResult() {
  const zoneNames = ['head', 'neck', 'blade', 'tip', 'cuts_region', 'text_region_head', 'text_region_blade'];
  const zone_confidence = {};
  zoneNames.forEach((z) => { zone_confidence[z] = 0; });
  return {
    dissection_ready: false,
    zone_confidence,
    zones: null,
    head_blade_ratio: 0,
    tip_visible: false,
    cuts_visible: false,
    text_zone_head_visible: false,
    text_zone_blade_visible: false,
    dissection_confidence: 0,
  };
}

/**
 * Analiza el frame y devuelve métricas de división anatómica.
 *
 * @param {HTMLVideoElement} video - elemento de video (no usado en Fase 1 heurística)
 * @param {Object} opts - { shapeResult, topdownResult } desde shape_mask y topdown_normalizer
 * @returns {Object} dissection result
 */
export function analyzeKeyDissection(video, opts = {}) {
  const shapeResult = opts.shapeResult || null;
  const topdownResult = opts.topdownResult || null;

  if (!shapeResult?.mask_detected || !shapeResult?.shape_bbox) {
    return makeEmptyResult();
  }

  const shapeBbox = shapeResult.shape_bbox;
  if (shapeBbox.w < 4 || shapeBbox.h < 4) return makeEmptyResult();

  // Usar normalized_bbox si topdown está listo; si no, shape_bbox
  let baseBbox = shapeBbox;
  const topdownReady = topdownResult?.topdown_ready && topdownResult?.normalized_bbox;
  if (topdownReady && topdownResult.normalized_bbox.w >= 2 && topdownResult.normalized_bbox.h >= 2) {
    baseBbox = topdownResult.normalized_bbox;
  }

  const horizontal = baseBbox.w >= baseBbox.h;
  const zones = partitionZones(baseBbox, horizontal);
  if (!zones) return makeEmptyResult();

  const w = ANALYZE_WIDTH;
  const h = ANALYZE_HEIGHT;
  const margin = BORDER_MARGIN_PX;

  const tip_visible = isZoneInsideFrame(zones.tip, w, h, margin);
  const cuts_visible = isZoneInsideFrame(zones.cuts_region, w, h, margin);
  const text_zone_head_visible = isZoneInsideFrame(zones.text_region_head, w, h, margin);
  const text_zone_blade_visible = isZoneInsideFrame(zones.text_region_blade, w, h, margin);

  const head_blade_ratio = computeHeadBladeRatio(zones);

  // zone_confidence: basado en si la zona existe, tiene tamaño útil y no está recortada
  const zone_confidence = {
    head: zones.head && zones.head.w >= 2 && zones.head.h >= 2
      ? (isZoneInsideFrame(zones.head, w, h, margin) ? 0.9 : 0.6) : 0.3,
    neck: zones.neck && zones.neck.w >= 2 && zones.neck.h >= 2
      ? (isZoneInsideFrame(zones.neck, w, h, margin) ? 0.85 : 0.55) : 0.25,
    blade: zones.blade && zones.blade.w >= 2 && zones.blade.h >= 2
      ? (isZoneInsideFrame(zones.blade, w, h, margin) ? 0.9 : 0.6) : 0.3,
    tip: tip_visible ? 0.9 : (zones.tip ? 0.4 : 0.2),
    cuts_region: cuts_visible ? 0.85 : (zones.cuts_region ? 0.5 : 0.2),
    text_region_head: text_zone_head_visible ? 0.8 : (zones.text_region_head ? 0.45 : 0.2),
    text_region_blade: text_zone_blade_visible ? 0.8 : (zones.text_region_blade ? 0.45 : 0.2),
  };

  // dissection_confidence: combinación de shape + topdown + zonas visibles
  const shapeContrib = (shapeResult.mask_confidence || 0) * 0.3;
  const topdownContrib = topdownReady ? (topdownResult.topdown_confidence || 0) * 0.3 : 0.15;
  const zoneContrib = (Object.values(zone_confidence).reduce((a, b) => a + b, 0) / 7) * 0.4;
  const dissection_confidence = clamp01(shapeContrib + topdownContrib + zoneContrib);

  const dissection_ready =
    dissection_confidence >= MIN_DISSECTION_CONFIDENCE &&
    shapeResult.mask_detected &&
    (shapeResult.key_complete || dissection_confidence >= 0.35);

  return {
    dissection_ready,
    zone_confidence,
    zones,
    head_blade_ratio,
    tip_visible,
    cuts_visible,
    text_zone_head_visible,
    text_zone_blade_visible,
    dissection_confidence,
  };
}

/**
 * Snapshot de dissection para incluir al capturar.
 */
export function makeDissectionSnapshot(result, frameWidth, frameHeight) {
  if (!result) return null;
  const scaleX = frameWidth && frameHeight ? frameWidth / ANALYZE_WIDTH : 1;
  const scaleY = frameWidth && frameHeight ? frameHeight / ANALYZE_HEIGHT : 1;

  const scaleBbox = (bbox) => {
    if (!bbox) return null;
    return {
      x: bbox.x * scaleX,
      y: bbox.y * scaleY,
      w: bbox.w * scaleX,
      h: bbox.h * scaleY,
    };
  };

  const zones = result.zones
    ? {
        head: scaleBbox(result.zones.head),
        neck: scaleBbox(result.zones.neck),
        blade: scaleBbox(result.zones.blade),
        tip: scaleBbox(result.zones.tip),
        cuts_region: scaleBbox(result.zones.cuts_region),
        text_region_head: scaleBbox(result.zones.text_region_head),
        text_region_blade: scaleBbox(result.zones.text_region_blade),
      }
    : null;

  return {
    dissection_ready: result.dissection_ready,
    zone_confidence: result.zone_confidence,
    zones,
    head_blade_ratio: result.head_blade_ratio,
    tip_visible: result.tip_visible,
    cuts_visible: result.cuts_visible,
    text_zone_head_visible: result.text_zone_head_visible,
    text_zone_blade_visible: result.text_zone_blade_visible,
    dissection_confidence: result.dissection_confidence,
  };
}
