/**
 * damageSense — módulo pasivo de detección de desgaste, oxidación y daño superficial.
 * Modo PASIVO: mide y expone señales, NO bloquea captura.
 * Heurísticas ligeras sin modelo pesado.
 *
 * Diseñado para alimentar: visual_state, wear_level, consistency, risk, quality_gate_vision, ranking.
 */

const ANALYZE_WIDTH = 120;
const ANALYZE_HEIGHT = 90;
const MIN_DAMAGE_READY = 0.2;
const WEAR_LOW = 0.35;
const WEAR_MEDIUM = 0.65;
const OXIDATION_THRESHOLD = 0.4;
const SURFACE_DAMAGE_THRESHOLD = 0.4;

let _canvas = null;
let _ctx = null;

function getCanvas() {
  if (typeof document === 'undefined') return null;
  if (!_canvas) {
    _canvas = document.createElement('canvas');
    _canvas.width = ANALYZE_WIDTH;
    _canvas.height = ANALYZE_HEIGHT;
    _ctx = _canvas.getContext('2d');
  }
  return { canvas: _canvas, ctx: _ctx };
}

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function lum(r, g, b) {
  return (r * 0.299 + g * 0.587 + b * 0.114) | 0;
}

/**
 * ROI válido dentro del frame.
 */
function validRoi(bbox) {
  if (!bbox || bbox.w < 4 || bbox.h < 4) return null;
  const x = Math.max(0, Math.min(ANALYZE_WIDTH - 4, bbox.x));
  const y = Math.max(0, Math.min(ANALYZE_HEIGHT - 4, bbox.y));
  const w = Math.min(bbox.w, ANALYZE_WIDTH - x, 116);
  const h = Math.min(bbox.h, ANALYZE_HEIGHT - y, 86);
  if (w < 4 || h < 4) return null;
  return { x, y, w, h };
}

/**
 * Acumula ROI combinado desde zonas (blade, cuts_region, tip).
 */
function getKeyRoi(dissectionResult, shapeResult) {
  const zones = dissectionResult?.zones;
  if (zones?.blade || zones?.cuts_region || zones?.tip) {
    const parts = [zones.blade, zones.cuts_region, zones.tip].filter(Boolean);
    if (parts.length === 0) return null;
    let xMin = ANALYZE_WIDTH;
    let yMin = ANALYZE_HEIGHT;
    let xMax = 0;
    let yMax = 0;
    for (const p of parts) {
      xMin = Math.min(xMin, p.x);
      yMin = Math.min(yMin, p.y);
      xMax = Math.max(xMax, p.x + p.w);
      yMax = Math.max(yMax, p.y + p.h);
    }
    return validRoi({ x: xMin, y: yMin, w: xMax - xMin, h: yMax - yMin });
  }
  const bbox = shapeResult?.shape_bbox;
  if (bbox && bbox.w >= 4 && bbox.h >= 4) {
    return validRoi(bbox);
  }
  return null;
}

/**
 * Nitidez de bordes en ROI. Alta = bordes nítidos (bajo desgaste). Baja = bordes suaves (alto desgaste).
 */
function edgeSharpnessScore(data, w, h, roi) {
  if (!roi || roi.w < 2 || roi.h < 2) return 0;
  let sumMag = 0;
  let count = 0;
  const thresh = 30;

  for (let y = roi.y; y < roi.y + roi.h - 1; y++) {
    for (let x = roi.x; x < roi.x + roi.w - 1; x++) {
      const i = (y * w + x) << 2;
      const lC = lum(data[i], data[i + 1], data[i + 2]);
      const lR = lum(data[i + 4], data[i + 5], data[i + 6]);
      const iD = ((y + 1) * w + x) << 2;
      const lD = lum(data[iD], data[iD + 1], data[iD + 2]);
      const gx = Math.abs(lR - lC);
      const gy = Math.abs(lD - lC);
      const mag = Math.sqrt(gx * gx + gy * gy);
      sumMag += mag > thresh ? mag : 0;
      count++;
    }
  }
  return clamp01((count ? sumMag / count : 0) / 70);
}

/**
 * Irregularidad de textura (varianza entre bloques). Alta = textura irregular = posible desgaste.
 */
function textureIrregularityScore(data, w, h, roi) {
  if (!roi || roi.w < 6 || roi.h < 6) return 0;
  const block = 4;
  const vars = [];

  for (let y = roi.y; y < roi.y + roi.h - block; y += 2) {
    for (let x = roi.x; x < roi.x + roi.w - block; x += 2) {
      let mean = 0;
      let n = 0;
      for (let dy = 0; dy < block; dy++) {
        for (let dx = 0; dx < block; dx++) {
          const i = ((y + dy) * w + (x + dx)) << 2;
          mean += lum(data[i], data[i + 1], data[i + 2]);
          n++;
        }
      }
      mean /= n;
      let v = 0;
      for (let dy = 0; dy < block; dy++) {
        for (let dx = 0; dx < block; dx++) {
          const i = ((y + dy) * w + (x + dx)) << 2;
          const d = lum(data[i], data[i + 1], data[i + 2]) - mean;
          v += d * d;
        }
      }
      vars.push(Math.sqrt(v / n));
    }
  }
  if (vars.length < 2) return 0;
  const avg = vars.reduce((a, b) => a + b, 0) / vars.length;
  const std = Math.sqrt(
    vars.reduce((s, v) => s + (v - avg) ** 2, 0) / vars.length
  );
  return clamp01(std / 40);
}

/**
 * Manchas oscuras (oxidación). Píxeles en rango medio-oscuro con agrupación local.
 */
function darkSpotScore(data, w, h, roi) {
  if (!roi || roi.w < 3 || roi.h < 3) return 0;
  const LUM_LOW = 45;
  const LUM_HIGH = 110;
  let darkCount = 0;
  let total = 0;

  for (let dy = 0; dy < roi.h; dy++) {
    for (let dx = 0; dx < roi.w; dx++) {
      const x = roi.x + dx;
      const y = roi.y + dy;
      const i = (y * w + x) << 2;
      const l = lum(data[i], data[i + 1], data[i + 2]);
      total++;
      if (l >= LUM_LOW && l <= LUM_HIGH) darkCount++;
    }
  }
  const ratio = total ? darkCount / total : 0;
  return clamp01(ratio * 3);
}

/**
 * Anomalías superficiales: bloques con varianza muy alta (discontinuidades).
 */
function surfaceAnomalyScore(data, w, h, roi) {
  if (!roi || roi.w < 6 || roi.h < 6) return 0;
  const block = 4;
  let maxVar = 0;
  let sumVar = 0;
  let n = 0;

  for (let y = roi.y; y < roi.y + roi.h - block; y += 2) {
    for (let x = roi.x; x < roi.x + roi.w - block; x += 2) {
      let mean = 0;
      let count = 0;
      for (let dy = 0; dy < block; dy++) {
        for (let dx = 0; dx < block; dx++) {
          const i = ((y + dy) * w + (x + dx)) << 2;
          mean += lum(data[i], data[i + 1], data[i + 2]);
          count++;
        }
      }
      mean /= count;
      let v = 0;
      for (let dy = 0; dy < block; dy++) {
        for (let dx = 0; dx < block; dx++) {
          const i = ((y + dy) * w + (x + dx)) << 2;
          const d = lum(data[i], data[i + 1], data[i + 2]) - mean;
          v += d * d;
        }
      }
      const std = Math.sqrt(v / count);
      maxVar = Math.max(maxVar, std);
      sumVar += std;
      n++;
    }
  }
  const avgVar = n ? sumVar / n : 0;
  const outlierRatio = avgVar > 0 ? Math.min(1, maxVar / (avgVar * 2.5)) : 0;
  return clamp01(outlierRatio);
}

/**
 * Analiza frame y devuelve métricas de daño.
 *
 * @param {HTMLVideoElement} video - elemento de video
 * @param {Object} opts - { shapeResult, dissectionResult }
 * @returns {Object} damage result
 */
export function analyzeDamageSense(video, opts = {}) {
  const shapeResult = opts.shapeResult || null;
  const dissectionResult = opts.dissectionResult || null;

  const empty = makeEmptyResult();
  const roi = getKeyRoi(dissectionResult, shapeResult);
  if (!roi) return empty;

  const hasShape = shapeResult?.mask_detected ?? false;
  const hasDissection = dissectionResult?.dissection_ready ?? false;
  const shapeConf = shapeResult?.mask_confidence ?? 0;
  const dissConf = dissectionResult?.dissection_confidence ?? 0;

  if (!hasShape && !hasDissection) return empty;

  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return empty;

  const { ctx } = getCanvas() || {};
  if (!ctx) return empty;

  ctx.drawImage(video, 0, 0, vw, vh, 0, 0, ANALYZE_WIDTH, ANALYZE_HEIGHT);
  const imgData = ctx.getImageData(0, 0, ANALYZE_WIDTH, ANALYZE_HEIGHT);
  const { data } = imgData;
  const w = ANALYZE_WIDTH;
  const h = ANALYZE_HEIGHT;

  const sharpness = edgeSharpnessScore(data, w, h, roi);
  const irregularity = textureIrregularityScore(data, w, h, roi);
  const darkSpots = darkSpotScore(data, w, h, roi);
  const anomaly = surfaceAnomalyScore(data, w, h, roi);

  // Desgaste: bordes suaves (baja nitidez) + textura irregular
  const wear_score = clamp01((1 - sharpness) * 0.5 + irregularity * 0.5);

  const wear_level =
    !hasShape && !hasDissection
      ? 'unknown'
      : wear_score < WEAR_LOW
        ? 'low'
        : wear_score < WEAR_MEDIUM
          ? 'medium'
          : 'high';

  const oxidation_present = darkSpots >= OXIDATION_THRESHOLD;
  const oxidation_score = clamp01(darkSpots);

  const surface_damage = anomaly >= SURFACE_DAMAGE_THRESHOLD;
  const surface_damage_score = clamp01(anomaly);

  const damage_ready =
    (hasShape || hasDissection) &&
    (shapeConf >= MIN_DAMAGE_READY || dissConf >= MIN_DAMAGE_READY) &&
    roi != null;

  const damage_confidence = clamp01(
    (hasShape ? shapeConf * 0.5 : 0) + (hasDissection ? dissConf * 0.5 : 0.25)
  );

  return {
    damage_ready,
    wear_level,
    wear_score,
    oxidation_present,
    oxidation_score,
    surface_damage,
    surface_damage_score,
    damage_confidence,
  };
}

function makeEmptyResult() {
  return {
    damage_ready: false,
    wear_level: 'unknown',
    wear_score: 0,
    oxidation_present: false,
    oxidation_score: 0,
    surface_damage: false,
    surface_damage_score: 0,
    damage_confidence: 0,
  };
}

/**
 * Snapshot de damage para incluir al capturar.
 */
export function makeDamageSnapshot(result) {
  if (!result) return null;
  return {
    damage_ready: result.damage_ready,
    wear_level: result.wear_level,
    wear_score: result.wear_score,
    oxidation_present: result.oxidation_present,
    oxidation_score: result.oxidation_score,
    surface_damage: result.surface_damage,
    surface_damage_score: result.surface_damage_score,
    damage_confidence: result.damage_confidence,
  };
}
