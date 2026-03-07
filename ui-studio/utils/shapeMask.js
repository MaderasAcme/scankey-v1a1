/**
 * shapeMask — módulo pasivo de máscara/contorno de llave por visión.
 * Modo PASIVO: mide y expone señales, NO bloquea captura.
 * Heurísticas ligeras sin modelo pesado.
 *
 * Diseñado para alimentar en el futuro: quality_score, roi_score, reasons[],
 * topdown_normalizer, key_dissection, quality_gate_vision.
 */

const ANALYZE_WIDTH = 120;
const ANALYZE_HEIGHT = 90;
const EDGE_THRESHOLD = 35;
const LUM_THRESHOLD_LOW = 60;
const LUM_THRESHOLD_HIGH = 200;
const ROI_EXPAND_PX = 4;
const MIN_EDGE_DENSITY = 0.02;
const BORDER_MARGIN_PX = 3;

let _shapeCanvas = null;
let _shapeCtx = null;

function getShapeCanvas() {
  if (typeof document === 'undefined') return null;
  if (!_shapeCanvas) {
    _shapeCanvas = document.createElement('canvas');
    _shapeCanvas.width = ANALYZE_WIDTH;
    _shapeCanvas.height = ANALYZE_HEIGHT;
    _shapeCtx = _shapeCanvas.getContext('2d');
  }
  return { canvas: _shapeCanvas, ctx: _shapeCtx };
}

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

/**
 * Detecta bordes con gradiente simple. Devuelve array de 0/1.
 */
function computeEdges(data, w, h) {
  const edges = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = (y * w + x) << 2;
      const lR = (data[i + 4] * 0.299 + data[i + 5] * 0.587 + data[i + 6] * 0.114) | 0;
      const lL = (data[i - 4] * 0.299 + data[i - 5] * 0.587 + data[i - 6] * 0.114) | 0;
      const lD = (data[(y + 1) * w * 4 + x * 4] * 0.299 + data[(y + 1) * w * 4 + x * 4 + 1] * 0.587 + data[(y + 1) * w * 4 + x * 4 + 2] * 0.114) | 0;
      const lU = (data[(y - 1) * w * 4 + x * 4] * 0.299 + data[(y - 1) * w * 4 + x * 4 + 1] * 0.587 + data[(y - 1) * w * 4 + x * 4 + 2] * 0.114) | 0;
      const gx = Math.abs(lR - lL);
      const gy = Math.abs(lD - lU);
      const mag = Math.sqrt(gx * gx + gy * gy);
      edges[y * w + x] = mag > EDGE_THRESHOLD ? 1 : 0;
    }
  }
  return edges;
}

/**
 * Expande bbox con margen, respetando límites.
 */
function expandRoi(roi, w, h, expand) {
  if (!roi) return null;
  const x1 = Math.max(0, roi.x - expand);
  const y1 = Math.max(0, roi.y - expand);
  const x2 = Math.min(w, roi.x + roi.w + expand);
  const y2 = Math.min(h, roi.y + roi.h + expand);
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

/**
 * Calcula estadísticas en una región: bordes, luminancia, área útil.
 */
function analyzeRegion(data, edges, roi, w, h) {
  const total = roi.w * roi.h;
  if (total <= 0) return null;
  let edgeCount = 0;
  let darkCount = 0;
  let brightCount = 0;
  let sumLum = 0;

  for (let dy = 0; dy < roi.h; dy++) {
    for (let dx = 0; dx < roi.w; dx++) {
      const x = roi.x + dx;
      const y = roi.y + dy;
      const i = (y * w + x) << 2;
      const lum = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) | 0;
      if (edges[y * w + x]) edgeCount++;
      if (lum < LUM_THRESHOLD_LOW) darkCount++;
      if (lum > LUM_THRESHOLD_HIGH) brightCount++;
      sumLum += lum;
    }
  }

  const edge_density = clamp01(edgeCount / total);
  const meanLum = sumLum / total;
  const darkRatio = darkCount / total;
  const brightRatio = brightCount / total;
  const foregroundRatio = clamp01(1 - Math.abs(meanLum - 128) / 128);

  return {
    edgeCount,
    total,
    edge_density,
    meanLum,
    darkRatio,
    brightRatio,
    foregroundRatio,
  };
}

/**
 * Comprueba si la región toca bordes peligrosamente (llave recortada).
 */
function touchesDangerousBorder(bbox, w, h, margin) {
  if (!bbox) return true;
  return (
    bbox.x < margin ||
    bbox.y < margin ||
    bbox.x + bbox.w > w - margin ||
    bbox.y + bbox.h > h - margin
  );
}

/**
 * Analiza el frame y devuelve métricas de máscara/contorno.
 *
 * @param {HTMLVideoElement} video - elemento de video
 * @param {Object} opts - { roiBbox: { x, y, w, h } } desde key_tracking (coords 120x90)
 * @returns {Object} shapeMask result
 */
export function analyzeShapeMask(video, opts = {}) {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return makeEmptyShapeResult();

  const { ctx } = getShapeCanvas() || {};
  if (!ctx) return makeEmptyShapeResult();

  ctx.drawImage(video, 0, 0, vw, vh, 0, 0, ANALYZE_WIDTH, ANALYZE_HEIGHT);
  const imgData = ctx.getImageData(0, 0, ANALYZE_WIDTH, ANALYZE_HEIGHT);
  const { data } = imgData;
  const w = ANALYZE_WIDTH;
  const h = ANALYZE_HEIGHT;
  const totalPixels = w * h;

  const roiBbox = opts.roiBbox || null;
  const roi = roiBbox
    ? expandRoi(roiBbox, w, h, ROI_EXPAND_PX)
    : { x: 0, y: 0, w: w, h: h };

  const edges = computeEdges(data, w, h);
  const stats = analyzeRegion(data, edges, roi, w, h);
  if (!stats) return makeEmptyShapeResult();

  const { edge_density, foregroundRatio } = stats;

  const mask_detected =
    edge_density >= MIN_EDGE_DENSITY && roiBbox && roiBbox.w > 2 && roiBbox.h > 2;

  const shape_bbox = roiBbox ? { x: roiBbox.x, y: roiBbox.y, w: roiBbox.w, h: roiBbox.h } : null;

  const shape_area_ratio = roi ? clamp01((roi.w * roi.h) / totalPixels) : 0;

  const contour_score = clamp01(
    edge_density * 3 + (roiBbox ? 0.2 : 0)
  );

  const mask_confidence = mask_detected
    ? clamp01(contour_score * 0.6 + foregroundRatio * 0.3 + (roiBbox ? 0.1 : 0))
    : 0;

  const key_complete = mask_detected
    ? !touchesDangerousBorder(shape_bbox, w, h, BORDER_MARGIN_PX)
    : false;

  return {
    mask_detected,
    mask_confidence,
    contour_score,
    key_complete,
    shape_bbox,
    shape_area_ratio,
    edge_density,
  };
}

function makeEmptyShapeResult() {
  return {
    mask_detected: false,
    mask_confidence: 0,
    contour_score: 0,
    key_complete: false,
    shape_bbox: null,
    shape_area_ratio: 0,
    edge_density: 0,
  };
}

/**
 * Mensaje de guía secundario (solo si aplica, no ruidoso).
 */
export function getShapeGuidanceMessage(result) {
  if (!result || !result.mask_detected) return null;
  if (!result.key_complete) return 'Muestra la llave completa';
  return null;
}

/**
 * Snapshot de shape para incluir al capturar.
 */
export function makeShapeSnapshot(result, frameWidth, frameHeight) {
  if (!result) return null;
  const scaleX = frameWidth && frameHeight ? frameWidth / ANALYZE_WIDTH : 1;
  const scaleY = frameWidth && frameHeight ? frameHeight / ANALYZE_HEIGHT : 1;
  const shape_bbox = result.shape_bbox
    ? {
        x: result.shape_bbox.x * scaleX,
        y: result.shape_bbox.y * scaleY,
        w: result.shape_bbox.w * scaleX,
        h: result.shape_bbox.h * scaleY,
      }
    : null;
  return {
    mask_detected: result.mask_detected,
    mask_confidence: result.mask_confidence,
    contour_score: result.contour_score,
    key_complete: result.key_complete,
    shape_bbox,
    shape_area_ratio: result.shape_area_ratio,
    edge_density: result.edge_density,
  };
}
