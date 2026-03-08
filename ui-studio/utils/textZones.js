/**
 * textZones — módulo pasivo de zonas probables de texto/grabado.
 * Modo PASIVO: localiza, mide, NO ejecuta OCR. NO bloquea captura.
 * Heurísticas ligeras basadas en dissection + contrast + bordes/contraste local.
 *
 * Prepara para OCR futuro: OCR dual, brand reconstruction, consistency, ranking.
 */

const ANALYZE_WIDTH = 120;
const ANALYZE_HEIGHT = 90;
const MIN_REGION_PIXELS = 16;
const TEXT_PRESENT_THRESHOLD = 0.35;
const MIN_ZONES_READY = 0.2;

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
 * Bbox válido dentro del frame.
 */
function validRoi(bbox) {
  if (!bbox || bbox.w < 2 || bbox.h < 2) return null;
  const x = Math.max(0, Math.min(ANALYZE_WIDTH - 2, bbox.x));
  const y = Math.max(0, Math.min(ANALYZE_HEIGHT - 2, bbox.y));
  const w = Math.min(bbox.w, ANALYZE_WIDTH - x, 118);
  const h = Math.min(bbox.h, ANALYZE_HEIGHT - y, 88);
  if (w < 2 || h < 2) return null;
  return { x, y, w, h };
}

/**
 * Fuerza de bordes en ROI (bordes finos = posible texto).
 */
function edgeDensityScore(data, w, h, roi) {
  if (!roi || roi.w < 2 || roi.h < 2) return 0;
  let sumMag = 0;
  let count = 0;
  const thresh = 25;

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
      if (mag > thresh) sumMag += mag;
      count++;
    }
  }
  return clamp01((count ? sumMag / count : 0) / 70);
}

/**
 * Contraste local (varianza en bloques pequeños).
 */
function localContrastScore(data, w, h, roi) {
  if (!roi || roi.w < 3 || roi.h < 3) return 0;
  let sumVar = 0;
  let samples = 0;
  const block = 3;

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
      sumVar += Math.sqrt(v / n);
      samples++;
    }
  }
  return clamp01((samples ? sumVar / samples : 0) / 60);
}

/**
 * Baja saturación (típico de grabado en metal).
 */
function lowSaturationScore(data, w, h, roi) {
  if (!roi || roi.w < 1 || roi.h < 1) return 0.5; // neutral
  let sumSat = 0;
  let count = 0;

  for (let dy = 0; dy < roi.h; dy++) {
    for (let dx = 0; dx < roi.w; dx++) {
      const x = roi.x + dx;
      const y = roi.y + dy;
      const i = (y * w + x) << 2;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const sat = max === 0 ? 0 : (max - min) / max;
      sumSat += 1 - sat;
      count++;
    }
  }
  return clamp01(count ? sumSat / count : 0.5);
}

/**
 * Score de evidencia de texto en una región (heurística).
 */
function textEvidenceScore(data, w, h, roi) {
  if (!roi) return 0;
  const edge = edgeDensityScore(data, w, h, roi);
  const local = localContrastScore(data, w, h, roi);
  const gray = lowSaturationScore(data, w, h, roi);
  // texto/grabado: bordes finos + contraste local + gris
  return clamp01(edge * 0.45 + local * 0.35 + gray * 0.2);
}

/**
 * Analiza frame y devuelve métricas de zonas de texto.
 *
 * @param {HTMLVideoElement} video - elemento de video
 * @param {Object} opts - { dissectionResult, contrastResult }
 * @returns {Object} textZones result
 */
export function analyzeTextZones(video, opts = {}) {
  const dissectionResult = opts.dissectionResult || null;
  const contrastResult = opts.contrastResult || null;

  const empty = makeEmptyResult();
  if (!dissectionResult?.zones?.text_region_head && !dissectionResult?.zones?.text_region_blade) {
    return empty;
  }

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

  const roiHead = validRoi(dissectionResult.zones.text_region_head);
  const roiBlade = validRoi(dissectionResult.zones.text_region_blade);

  const headScore = roiHead ? textEvidenceScore(data, w, h, roiHead) : 0;
  const bladeScore = roiBlade ? textEvidenceScore(data, w, h, roiBlade) : 0;

  const text_present_head = headScore >= TEXT_PRESENT_THRESHOLD;
  const text_present_blade = bladeScore >= TEXT_PRESENT_THRESHOLD;

  const text_zone_confidence = {
    head: clamp01(headScore),
    blade: clamp01(bladeScore),
  };

  const ocr_candidate_regions = [];
  if (roiHead && headScore >= TEXT_PRESENT_THRESHOLD * 0.8) {
    ocr_candidate_regions.push({
      zone: 'head',
      bbox: roiHead,
      score: headScore,
    });
  }
  if (roiBlade && bladeScore >= TEXT_PRESENT_THRESHOLD * 0.8) {
    ocr_candidate_regions.push({
      zone: 'blade',
      bbox: roiBlade,
      score: bladeScore,
    });
  }

  const ocr_visibility_score = ocr_candidate_regions.length
    ? ocr_candidate_regions.reduce((s, r) => s + r.score, 0) / ocr_candidate_regions.length
    : 0;

  const contrastBase = contrastResult?.ocr_contrast_score ?? 0;
  const text_contrast_score = clamp01(
    (contrastBase * 0.6) + (headScore * 0.2) + (bladeScore * 0.2)
  );

  const dissectionReady = dissectionResult?.dissection_ready ?? false;
  const dissectionConf = dissectionResult?.dissection_confidence ?? 0;
  const text_zones_ready =
    dissectionReady &&
    dissectionConf >= MIN_ZONES_READY &&
    (roiHead || roiBlade) != null;

  const text_regions_detected = {
    head: roiHead ? { ...roiHead } : null,
    blade: roiBlade ? { ...roiBlade } : null,
  };

  return {
    text_zones_ready,
    text_present_head,
    text_present_blade,
    ocr_candidate_regions,
    ocr_visibility_score,
    text_contrast_score,
    text_zone_confidence,
    text_regions_detected,
  };
}

function makeEmptyResult() {
  return {
    text_zones_ready: false,
    text_present_head: false,
    text_present_blade: false,
    ocr_candidate_regions: [],
    ocr_visibility_score: 0,
    text_contrast_score: 0,
    text_zone_confidence: { head: 0, blade: 0 },
    text_regions_detected: { head: null, blade: null },
  };
}

/**
 * Snapshot de textZones para incluir al capturar.
 */
export function makeTextZonesSnapshot(result, frameWidth, frameHeight) {
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

  const ocr_candidate_regions = (result.ocr_candidate_regions || []).map((r) => ({
    ...r,
    bbox: r.bbox ? scaleBbox(r.bbox) : null,
  }));

  const text_regions_detected = result.text_regions_detected
    ? {
        head: scaleBbox(result.text_regions_detected.head),
        blade: scaleBbox(result.text_regions_detected.blade),
      }
    : { head: null, blade: null };

  return {
    text_zones_ready: result.text_zones_ready,
    text_present_head: result.text_present_head,
    text_present_blade: result.text_present_blade,
    ocr_candidate_regions,
    ocr_visibility_score: result.ocr_visibility_score,
    text_contrast_score: result.text_contrast_score,
    text_zone_confidence: result.text_zone_confidence || { head: 0, blade: 0 },
    text_regions_detected,
  };
}
