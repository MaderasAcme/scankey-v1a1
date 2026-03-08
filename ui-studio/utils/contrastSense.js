/**
 * contrastSense — módulo pasivo de evaluación de contraste.
 * Modo PASIVO: mide y expone señales, NO bloquea captura.
 * Heurísticas ligeras sin modelo pesado.
 *
 * Evalúa si ajustar contraste ayudaría a OCR, contorno y separación fondo/llave.
 * Diseñado para alimentar: text_zones, OCR, key_dissection, quality_gate_vision, feature_fusion.
 */

const ANALYZE_WIDTH = 120;
const ANALYZE_HEIGHT = 90;
const EDGE_THRESHOLD = 35;
const LUM_LOW = 40;
const LUM_HIGH = 215;
const IMPROVE_THRESHOLD = 0.08;
const MIN_GAIN_FOR_HELPFUL = 0.05;

let _contrastCanvas = null;
let _contrastCtx = null;

function getContrastCanvas() {
  if (typeof document === 'undefined') return null;
  if (!_contrastCanvas) {
    _contrastCanvas = document.createElement('canvas');
    _contrastCanvas.width = ANALYZE_WIDTH;
    _contrastCanvas.height = ANALYZE_HEIGHT;
    _contrastCtx = _contrastCanvas.getContext('2d');
  }
  return { canvas: _contrastCanvas, ctx: _contrastCtx };
}

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function lum(r, g, b) {
  return (r * 0.299 + g * 0.587 + b * 0.114) | 0;
}

/**
 * Histograma de luminancia en región. Devuelve { bins, sum, count, p2, p98 }.
 */
function histogramLum(data, w, h, roi) {
  const bins = new Int32Array(256);
  const r = roi || { x: 0, y: 0, w, h };
  let sum = 0;
  let count = 0;

  for (let dy = 0; dy < r.h; dy++) {
    for (let dx = 0; dx < r.w; dx++) {
      const x = r.x + dx;
      const y = r.y + dy;
      const i = (y * w + x) << 2;
      const l = lum(data[i], data[i + 1], data[i + 2]);
      bins[l]++;
      sum += l;
      count++;
    }
  }

  let acc = 0;
  let p2 = 0;
  let p98 = 255;
  const p2Target = count * 0.02;
  const p98Target = count * 0.98;

  for (let k = 0; k < 256; k++) {
    acc += bins[k];
    if (acc >= p2Target && p2 === 0) p2 = k;
    if (acc >= p98Target) {
      p98 = k;
      break;
    }
  }

  return { bins, sum, count, p2, p98, mean: count ? sum / count : 0 };
}

/**
 * Contraste local: varianza en ventanas pequeñas (simplificado).
 */
function localContrastScore(data, w, h, roi) {
  const r = roi || { x: 1, y: 1, w: w - 2, h: h - 2 };
  let sumVar = 0;
  let samples = 0;
  const block = 3;

  for (let y = r.y; y < r.y + r.h - block; y += 2) {
    for (let x = r.x; x < r.x + r.w - block; x += 2) {
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

  const avgVar = samples ? sumVar / samples : 0;
  return clamp01(avgVar / 80);
}

/**
 * Fuerza de bordes en ROI (contour_contrast_score).
 */
function edgeStrengthScore(data, w, h, roi) {
  const r = roi || { x: 1, y: 1, w: w - 2, h: h - 2 };
  let sumMag = 0;
  let count = 0;

  for (let y = r.y; y < r.y + r.h - 1; y++) {
    for (let x = r.x; x < r.x + r.w - 1; x++) {
      const i = (y * w + x) << 2;
      const lC = lum(data[i], data[i + 1], data[i + 2]);
      const lR = lum(data[i + 4], data[i + 5], data[i + 6]);
      const lD = lum(data[((y + 1) * w + x) << 2], data[((y + 1) * w + x) << 2 + 1], data[((y + 1) * w + x) << 2 + 2]);
      const gx = Math.abs(lR - lC);
      const gy = Math.abs(lD - lC);
      const mag = Math.sqrt(gx * gx + gy * gy);
      sumMag += mag > EDGE_THRESHOLD ? mag : 0;
      count++;
    }
  }

  return clamp01((count ? sumMag / count : 0) / 80);
}

/**
 * Separación foreground/background en ROI: bimodalidad o diferencia medio oscuro vs claro.
 */
function backgroundSeparationScore(data, w, h, roi) {
  const r = roi || { x: 0, y: 0, w, h };
  let darkSum = 0;
  let darkN = 0;
  let brightSum = 0;
  let brightN = 0;

  for (let dy = 0; dy < r.h; dy++) {
    for (let dx = 0; dx < r.w; dx++) {
      const x = r.x + dx;
      const y = r.y + dy;
      const i = (y * w + x) << 2;
      const l = lum(data[i], data[i + 1], data[i + 2]);
      if (l < LUM_LOW) {
        darkSum += l;
        darkN++;
      } else if (l > LUM_HIGH) {
        brightSum += l;
        brightN++;
      }
    }
  }

  const darkMean = darkN ? darkSum / darkN : 0;
  const brightMean = brightN ? brightSum / brightN : 255;
  const separation = (brightMean - darkMean) / 255;
  const balance = darkN + brightN > 0
    ? Math.min(darkN, brightN) / Math.max(darkN, brightN)
    : 0;

  return clamp01(separation * 0.6 + balance * 0.4);
}

/**
 * OCR-ready: alta frecuencia + buen contraste en detalles (heurística).
 */
function ocrContrastScore(data, w, h, roi) {
  const edge = edgeStrengthScore(data, w, h, roi);
  const hist = histogramLum(data, w, h, roi);
  const spread = hist.p98 - hist.p2;
  const spreadScore = clamp01(spread / 180);
  const local = localContrastScore(data, w, h, roi);
  return clamp01(edge * 0.4 + spreadScore * 0.35 + local * 0.25);
}

/**
 * Aplica transformación soft: estiramiento leve con percentiles.
 */
function applySoft(data, w, h, hist) {
  const out = new Uint8ClampedArray(data.length);
  const lo = Math.max(0, hist.p2 - 5);
  const hi = Math.min(255, hist.p98 + 5);
  const range = hi - lo || 1;

  for (let i = 0; i < data.length; i += 4) {
    const l = lum(data[i], data[i + 1], data[i + 2]);
    const t = Math.round(((l - lo) / range) * 255);
    const v = Math.max(0, Math.min(255, t));
    out[i] = out[i + 1] = out[i + 2] = v;
    out[i + 3] = data[i + 3];
  }
  return out;
}

/**
 * Aplica transformación local: bloques 8x8 con stretch local.
 */
function applyLocal(data, w, h, roi) {
  const out = new Uint8ClampedArray(data);
  const blockSize = 8;
  const r = roi || { x: 0, y: 0, w, h };

  for (let by = Math.floor(r.y / blockSize) * blockSize; by < r.y + r.h; by += blockSize) {
    for (let bx = Math.floor(r.x / blockSize) * blockSize; bx < r.x + r.w; bx += blockSize) {
      const blockRoi = {
        x: Math.max(0, bx),
        y: Math.max(0, by),
        w: Math.min(blockSize, w - Math.max(0, bx)),
        h: Math.min(blockSize, h - Math.max(0, by)),
      };
      const hb = histogramLum(data, w, h, blockRoi);
      const lo = Math.max(0, hb.p2 - 3);
      const hi = Math.min(255, hb.p98 + 3);
      const range = hi - lo || 1;

      for (let dy = 0; dy < blockRoi.h; dy++) {
        for (let dx = 0; dx < blockRoi.w; dx++) {
          const x = blockRoi.x + dx;
          const y = blockRoi.y + dy;
          const i = (y * w + x) << 2;
          const l = lum(data[i], data[i + 1], data[i + 2]);
          const v = Math.max(0, Math.min(255, Math.round(((l - lo) / range) * 255)));
          out[i] = out[i + 1] = out[i + 2] = v;
        }
      }
    }
  }
  return out;
}

/**
 * Aplica transformación OCR: stretch fuerte + leve sharpening.
 */
function applyOcr(data, w, h, hist) {
  const lo = Math.max(0, hist.p2 - 10);
  const hi = Math.min(255, hist.p98 + 10);
  const range = hi - lo || 1;
  const temp = new Uint8ClampedArray(data.length);

  for (let i = 0; i < data.length; i += 4) {
    const l = lum(data[i], data[i + 1], data[i + 2]);
    temp[i] = temp[i + 1] = temp[i + 2] = Math.max(0, Math.min(255, Math.round(((l - lo) / range) * 255)));
    temp[i + 3] = data[i + 3];
  }

  const out = new Uint8ClampedArray(data.length);
  const kernel = [-1, -1, -1, -1, 9, -1, -1, -1, -1];
  const k = 0.4;

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      let sum = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const i = ((y + dy) * w + (x + dx)) << 2;
          sum += temp[i] * kernel[(dy + 1) * 3 + (dx + 1)];
        }
      }
      const v = Math.max(0, Math.min(255, temp[(y * w + x) << 2] + (sum * k) / 9));
      const idx = (y * w + x) << 2;
      out[idx] = out[idx + 1] = out[idx + 2] = v;
      out[idx + 3] = temp[idx + 3];
    }
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (y === 0 || y === h - 1 || x === 0 || x === w - 1) {
        const i = (y * w + x) << 2;
        out[i] = out[i + 1] = out[i + 2] = temp[i];
        out[i + 3] = temp[i + 3];
      }
    }
  }
  return out;
}

/**
 * Calcula métricas para un buffer de imagen (data como ImageData.data, RGB).
 */
function computeMetrics(data, w, h, roi) {
  return {
    background_separation_score: backgroundSeparationScore(data, w, h, roi),
    ocr_contrast_score: ocrContrastScore(data, w, h, roi),
    contour_contrast_score: edgeStrengthScore(data, w, h, roi),
  };
}

/**
 * Analiza el frame y devuelve métricas de contraste.
 *
 * @param {HTMLVideoElement} video - elemento de video
 * @param {Object} opts - { roiBbox: { x, y, w, h } } (coords 120x90)
 * @returns {Object} contrast result
 */
export function analyzeContrast(video, opts = {}) {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return makeEmptyResult();

  const { ctx } = getContrastCanvas() || {};
  if (!ctx) return makeEmptyResult();

  ctx.drawImage(video, 0, 0, vw, vh, 0, 0, ANALYZE_WIDTH, ANALYZE_HEIGHT);
  const imgData = ctx.getImageData(0, 0, ANALYZE_WIDTH, ANALYZE_HEIGHT);
  const { data } = imgData;
  const w = ANALYZE_WIDTH;
  const h = ANALYZE_HEIGHT;

  const roiBbox = opts.roiBbox || null;
  const roi = roiBbox && roiBbox.w > 2 && roiBbox.h > 2
    ? { x: roiBbox.x, y: roiBbox.y, w: roiBbox.w, h: roiBbox.h }
    : { x: w / 4, y: h / 4, w: w / 2, h: h / 2 };

  const base = computeMetrics(data, w, h, roi);

  const hist = histogramLum(data, w, h, roi);
  const softData = applySoft(data, w, h, hist);
  const localData = applyLocal(data, w, h, roi);
  const ocrData = applyOcr(data, w, h, hist);

  const soft = computeMetrics(softData, w, h, roi);
  const local = computeMetrics(localData, w, h, roi);
  const ocr = computeMetrics(ocrData, w, h, roi);

  const gain = (variant, baseMetrics) => ({
    bg: variant.background_separation_score - baseMetrics.background_separation_score,
    ocr: variant.ocr_contrast_score - baseMetrics.ocr_contrast_score,
    contour: variant.contour_contrast_score - baseMetrics.contour_contrast_score,
    total: 0,
  });

  const softGain = gain(soft, base);
  softGain.total = softGain.bg * 0.3 + softGain.ocr * 0.35 + softGain.contour * 0.35;

  const localGain = gain(local, base);
  localGain.total = localGain.bg * 0.25 + localGain.ocr * 0.25 + localGain.contour * 0.5;

  const ocrGain = gain(ocr, base);
  ocrGain.total = ocrGain.bg * 0.2 + ocrGain.ocr * 0.5 + ocrGain.contour * 0.3;

  const modes = [
    { mode: 'soft', gain: softGain.total, variant: soft },
    { mode: 'local', gain: localGain.total, variant: local },
    { mode: 'ocr', gain: ocrGain.total, variant: ocr },
  ];

  const best = modes.reduce((a, b) => (b.gain > a.gain ? b : a), { mode: 'off', gain: 0, variant: base });

  const contrast_helpful = best.gain >= MIN_GAIN_FOR_HELPFUL;
  const contrast_mode_used = contrast_helpful ? best.mode : 'off';

  const finalVariant = contrast_helpful ? best.variant : base;
  const contrast_gain_score = clamp01(Math.max(0, best.gain) * 3);

  return {
    contrast_mode_used,
    contrast_helpful,
    contrast_gain_score,
    background_separation_score: finalVariant.background_separation_score,
    ocr_contrast_score: finalVariant.ocr_contrast_score,
    contour_contrast_score: finalVariant.contour_contrast_score,
  };
}

function makeEmptyResult() {
  return {
    contrast_mode_used: 'off',
    contrast_helpful: false,
    contrast_gain_score: 0,
    background_separation_score: 0,
    ocr_contrast_score: 0,
    contour_contrast_score: 0,
  };
}

/**
 * Snapshot de contrast para incluir al capturar.
 */
export function makeContrastSnapshot(result) {
  if (!result) return null;
  return {
    contrast_mode_used: result.contrast_mode_used,
    contrast_helpful: result.contrast_helpful,
    contrast_gain_score: result.contrast_gain_score,
    background_separation_score: result.background_separation_score,
    ocr_contrast_score: result.ocr_contrast_score,
    contour_contrast_score: result.contour_contrast_score,
  };
}
