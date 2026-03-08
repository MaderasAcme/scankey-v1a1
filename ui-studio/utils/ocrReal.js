/**
 * ocrReal — OCR activo por zonas (head + blade).
 * Usa text_region_head y text_region_blade de key_dissection.
 * Aprovecha contrast_sense, text_zones y key_dissection para decidir cuándo ejecutar.
 *
 * NO ejecuta OCR a ciegas. Degrada con gracia si visibilidad es mala.
 * Compatible con OCR dual. NO bloquea captura.
 */

const ANALYZE_WIDTH = 120;
const ANALYZE_HEIGHT = 90;
const MIN_VISIBILITY_TO_RUN = 0.25;
const MIN_ZONE_PIXELS = 16;
const MIN_CONFIDENCE_ACCEPT = 0.3;

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

/**
 * Escala bbox de coords 120x90 a dimensiones de frame.
 */
function scaleBbox(bbox, frameWidth, frameHeight) {
  if (!bbox || bbox.w < 2 || bbox.h < 2) return null;
  const scaleX = frameWidth / ANALYZE_WIDTH;
  const scaleY = frameHeight / ANALYZE_HEIGHT;
  const x = Math.round(bbox.x * scaleX);
  const y = Math.round(bbox.y * scaleY);
  const w = Math.max(MIN_ZONE_PIXELS, Math.round(bbox.w * scaleX));
  const h = Math.max(MIN_ZONE_PIXELS, Math.round(bbox.h * scaleY));
  if (x + w > frameWidth || y + h > frameHeight) return null;
  return { x, y, w, h };
}

/**
 * Recorta región de un canvas y devuelve dataURL del crop.
 */
function cropRegionToDataUrl(canvas, bbox) {
  if (!canvas || !bbox) return null;
  const tmp = document.createElement('canvas');
  tmp.width = bbox.w;
  tmp.height = bbox.h;
  const ctx = tmp.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(canvas, bbox.x, bbox.y, bbox.w, bbox.h, 0, 0, bbox.w, bbox.h);
  return tmp.toDataURL('image/jpeg', 0.9);
}

/**
 * Ejecuta Tesseract sobre una región. Lazy-load del worker.
 */
async function runTesseractOnCrop(dataUrl, lang = 'spa+eng') {
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker(lang, 1, { logger: () => {} });
  try {
    const { data } = await worker.recognize(dataUrl);
    const text = (data?.text || '').trim().replace(/\s+/g, ' ');
    const conf = data?.confidence != null ? clamp01(data.confidence / 100) : 0;
    return { text, confidence: conf };
  } finally {
    await worker.terminate();
  }
}

/**
 * Determina si debemos ejecutar OCR y con qué modo.
 */
function inferOcrModeAndReasons(opts) {
  const tz = opts.textZones;
  const d = opts.dissection;
  const c = opts.contrast;
  const reasons = [];

  const vis = tz?.ocr_visibility_score ?? 0;
  const dissectionReady = d?.dissection_ready ?? false;
  const hasHead = d?.text_zone_head_visible ?? !!d?.zones?.text_region_head;
  const hasBlade = d?.text_zone_blade_visible ?? !!d?.zones?.text_region_blade;

  if (vis < MIN_VISIBILITY_TO_RUN) {
    reasons.push('low_visibility');
    return { mode: 'none', reasons };
  }
  if (!dissectionReady) {
    reasons.push('dissection_not_ready');
    return { mode: 'none', reasons };
  }
  if (!hasHead && !hasBlade) {
    reasons.push('no_text_regions');
    return { mode: 'none', reasons };
  }

  if (hasHead) reasons.push('head_region_available');
  if (hasBlade) reasons.push('blade_region_available');
  if (c?.contrast_helpful) reasons.push('contrast_helpful');
  if ((tz?.text_contrast_score ?? 0) >= 0.4) reasons.push('text_contrast_ok');
  if ((c?.ocr_contrast_score ?? 0) >= 0.4) reasons.push('ocr_contrast_ok');

  if (hasHead && hasBlade) return { mode: 'dual', reasons };
  if (hasHead) return { mode: 'head_only', reasons };
  return { mode: 'blade_only', reasons };
}

/**
 * Ejecuta OCR zonal sobre imagen.
 *
 * @param {HTMLCanvasElement|string} source - canvas o dataURL de la imagen completa
 * @param {number} frameWidth - ancho del frame
 * @param {number} frameHeight - alto del frame
 * @param {Object} opts - { dissectionResult, textZonesResult, contrastResult }
 * @returns {Promise<Object>} { ocr_ready, head_text, blade_text, head_confidence, blade_confidence, ocr_mode_used, ocr_reasons }
 */
export async function runZonedOCR(source, frameWidth, frameHeight, opts = {}) {
  const empty = {
    ocr_ready: false,
    head_text: '',
    blade_text: '',
    head_confidence: 0,
    blade_confidence: 0,
    ocr_mode_used: 'none',
    ocr_reasons: ['skipped'],
  };

  const { dissectionResult, textZonesResult, contrastResult } = opts;
  const modeReasons = inferOcrModeAndReasons({
    textZones: textZonesResult,
    dissection: dissectionResult,
    contrast: contrastResult,
  });

  if (modeReasons.mode === 'none') {
    return { ...empty, ocr_reasons: modeReasons.reasons };
  }

  let canvas = source;
  if (typeof source === 'string') {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = source;
    });
    const c = document.createElement('canvas');
    c.width = img.naturalWidth || img.width;
    c.height = img.naturalHeight || img.height;
    const ctx = c.getContext('2d');
    if (!ctx) return { ...empty, ocr_reasons: ['canvas_error'] };
    ctx.drawImage(img, 0, 0);
    canvas = c;
  }

  const w = canvas.width || frameWidth;
  const h = canvas.height || frameHeight;
  const zones = dissectionResult?.zones;
  if (!zones) return { ...empty, ocr_reasons: modeReasons.reasons };

  const headBbox = scaleBbox(zones.text_region_head, w, h);
  const bladeBbox = scaleBbox(zones.text_region_blade, w, h);

  const contrastFactor = contrastResult?.contrast_helpful
    ? 1
    : clamp01(0.5 + (contrastResult?.ocr_contrast_score ?? 0) * 0.5);
  const visFactor = clamp01((textZonesResult?.ocr_visibility_score ?? 0.3) * 1.5);

  let head_text = '';
  let head_confidence = 0;
  let blade_text = '';
  let blade_confidence = 0;

  try {
    if ((modeReasons.mode === 'dual' || modeReasons.mode === 'head_only') && headBbox) {
      const headUrl = cropRegionToDataUrl(canvas, headBbox);
      if (headUrl) {
        const res = await runTesseractOnCrop(headUrl);
        head_text = res.text;
        head_confidence = clamp01(res.confidence * contrastFactor * visFactor);
        if (head_confidence < MIN_CONFIDENCE_ACCEPT) head_text = '';
      }
    }
    if ((modeReasons.mode === 'dual' || modeReasons.mode === 'blade_only') && bladeBbox) {
      const bladeUrl = cropRegionToDataUrl(canvas, bladeBbox);
      if (bladeUrl) {
        const res = await runTesseractOnCrop(bladeUrl);
        blade_text = res.text;
        blade_confidence = clamp01(res.confidence * contrastFactor * visFactor);
        if (blade_confidence < MIN_CONFIDENCE_ACCEPT) blade_text = '';
      }
    }
  } catch (e) {
    modeReasons.reasons.push('ocr_error');
    return {
      ...empty,
      ocr_reasons: modeReasons.reasons,
      head_text,
      blade_text,
      head_confidence,
      blade_confidence,
    };
  }

  const ocr_ready = head_confidence >= MIN_CONFIDENCE_ACCEPT || blade_confidence >= MIN_CONFIDENCE_ACCEPT;

  return {
    ocr_ready,
    head_text,
    blade_text,
    head_confidence,
    blade_confidence,
    ocr_mode_used: modeReasons.mode,
    ocr_reasons: modeReasons.reasons,
  };
}

/**
 * Snapshot de ocrReal para incluir al capturar.
 */
export function makeOcrRealSnapshot(result) {
  if (!result) return null;
  return {
    ocr_ready: result.ocr_ready,
    head_text: result.head_text || '',
    blade_text: result.blade_text || '',
    head_confidence: result.head_confidence ?? 0,
    blade_confidence: result.blade_confidence ?? 0,
    ocr_mode_used: result.ocr_mode_used || 'none',
    ocr_reasons: Array.isArray(result.ocr_reasons) ? result.ocr_reasons : [],
  };
}
