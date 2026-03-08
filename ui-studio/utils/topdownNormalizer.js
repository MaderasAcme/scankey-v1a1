/**
 * topdownNormalizer — módulo pasivo de normalización top-down.
 * Modo PASIVO: mide y expone señales, NO bloquea captura.
 * Heurísticas ligeras sin modelo pesado.
 *
 * Diseñado para alimentar: key_dissection, quality_gate_vision, feature_fusion, size_class.
 */

const ANALYZE_WIDTH = 120;
const ANALYZE_HEIGHT = 90;
const EDGE_THRESHOLD = 35;
const MIN_EDGE_POINTS = 12;
const MIN_AXIS_RATIO = 0.15;
const MAX_ROTATION_DEG = 90;

let _topdownCanvas = null;
let _topdownCtx = null;

function getTopdownCanvas() {
  if (typeof document === 'undefined') return null;
  if (!_topdownCanvas) {
    _topdownCanvas = document.createElement('canvas');
    _topdownCanvas.width = ANALYZE_WIDTH;
    _topdownCanvas.height = ANALYZE_HEIGHT;
    _topdownCtx = _topdownCanvas.getContext('2d');
  }
  return { canvas: _topdownCanvas, ctx: _topdownCtx };
}

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

/**
 * Detecta bordes con gradiente simple. Devuelve array 0/1.
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
 * Recoge puntos de borde dentro de la ROI.
 */
function collectEdgePoints(edges, roi, w, h) {
  const pts = [];
  for (let dy = 0; dy < roi.h; dy++) {
    for (let dx = 0; dx < roi.w; dx++) {
      const x = roi.x + dx;
      const y = roi.y + dy;
      if (edges[y * w + x]) pts.push([x, y]);
    }
  }
  return pts;
}

/**
 * PCA ligera: estima eje principal y ángulo de rotación desde puntos.
 * Retorna { angleRad, cx, cy, axisRatio } o null si insuficientes datos.
 */
function estimatePrincipalAxis(points) {
  const n = points.length;
  if (n < MIN_EDGE_POINTS) return null;

  let mx = 0, my = 0;
  for (let i = 0; i < n; i++) {
    mx += points[i][0];
    my += points[i][1];
  }
  mx /= n;
  my /= n;

  let cxx = 0, cyy = 0, cxy = 0;
  for (let i = 0; i < n; i++) {
    const dx = points[i][0] - mx;
    const dy = points[i][1] - my;
    cxx += dx * dx;
    cyy += dy * dy;
    cxy += dx * dy;
  }
  cxx /= n;
  cyy /= n;
  cxy /= n;

  const trace = cxx + cyy;
  const det = cxx * cyy - cxy * cxy;
  const disc = Math.sqrt(Math.max(0, trace * trace - 4 * det));
  const lambda1 = (trace + disc) / 2;
  const lambda2 = (trace - disc) / 2;

  if (lambda1 < 1e-6) return null;
  const axisRatio = lambda2 > 0 ? Math.sqrt(lambda2 / lambda1) : 0;
  if (axisRatio < MIN_AXIS_RATIO) return null;

  let angleRad;
  if (Math.abs(cxy) < 1e-8) {
    angleRad = cxx >= cyy ? 0 : Math.PI / 2;
  } else {
    angleRad = 0.5 * Math.atan2(2 * cxy, cxx - cyy);
  }

  return { angleRad, cx: mx, cy: my, axisRatio, lambda1, lambda2 };
}

/**
 * Calcula bbox normalizada (axis-aligned que contendría la llave derotada).
 * Usa shape_bbox + rotation para el rectángulo orientado y su envolvente.
 */
function computeNormalizedBbox(shapeBbox, rotationDeg) {
  if (!shapeBbox || shapeBbox.w < 2 || shapeBbox.h < 2) return null;
  const cx = shapeBbox.x + shapeBbox.w / 2;
  const cy = shapeBbox.y + shapeBbox.h / 2;
  const θ = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(θ);
  const sin = Math.sin(θ);
  const hw = shapeBbox.w / 2;
  const hh = shapeBbox.h / 2;
  const corners = [
    [cx + (-hw) * cos - (-hh) * sin, cy + (-hw) * sin + (-hh) * cos],
    [cx + (hw) * cos - (-hh) * sin, cy + (hw) * sin + (-hh) * cos],
    [cx + (hw) * cos - (hh) * sin, cy + (hw) * sin + (hh) * cos],
    [cx + (-hw) * cos - (hh) * sin, cy + (-hw) * sin + (hh) * cos],
  ];
  let minX = corners[0][0], maxX = corners[0][0];
  let minY = corners[0][1], maxY = corners[0][1];
  for (let i = 1; i < 4; i++) {
    if (corners[i][0] < minX) minX = corners[i][0];
    if (corners[i][0] > maxX) maxX = corners[i][0];
    if (corners[i][1] < minY) minY = corners[i][1];
    if (corners[i][1] > maxY) maxY = corners[i][1];
  }
  return {
    x: Math.round(minX),
    y: Math.round(minY),
    w: Math.max(2, Math.round(maxX - minX)),
    h: Math.max(2, Math.round(maxY - minY)),
  };
}

function makeEmptyResult() {
  return {
    topdown_ready: false,
    alignment_score: 0,
    rotation_deg: 0,
    normalized_bbox: null,
    topdown_confidence: 0,
    axis_ratio: 0,
    pose_quality: 0,
  };
}

/**
 * Analiza el frame y devuelve métricas de normalización top-down.
 *
 * @param {HTMLVideoElement} video - elemento de video
 * @param {Object} opts - { shapeResult } desde shape_mask
 * @returns {Object} topdown result
 */
export function analyzeTopdownNormalizer(video, opts = {}) {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return makeEmptyResult();

  const shapeResult = opts.shapeResult || null;
  if (!shapeResult?.mask_detected || !shapeResult?.shape_bbox) {
    return makeEmptyResult();
  }

  const shapeBbox = shapeResult.shape_bbox;
  if (shapeBbox.w < 4 || shapeBbox.h < 4) return makeEmptyResult();

  const { ctx } = getTopdownCanvas() || {};
  if (!ctx) return makeEmptyResult();

  ctx.drawImage(video, 0, 0, vw, vh, 0, 0, ANALYZE_WIDTH, ANALYZE_HEIGHT);
  const imgData = ctx.getImageData(0, 0, ANALYZE_WIDTH, ANALYZE_HEIGHT);
  const { data } = imgData;
  const w = ANALYZE_WIDTH;
  const h = ANALYZE_HEIGHT;

  const edges = computeEdges(data, w, h);
  const roi = {
    x: Math.max(0, shapeBbox.x - 1),
    y: Math.max(0, shapeBbox.y - 1),
    w: Math.min(w - Math.max(0, shapeBbox.x - 1), shapeBbox.w + 2),
    h: Math.min(h - Math.max(0, shapeBbox.y - 1), shapeBbox.h + 2),
  };

  const points = collectEdgePoints(edges, roi, w, h);
  const axisResult = estimatePrincipalAxis(points);
  if (!axisResult) return makeEmptyResult();

  const { angleRad, axisRatio } = axisResult;
  let rotationDeg = (angleRad * 180) / Math.PI;

  if (Math.abs(rotationDeg) > 90) {
    rotationDeg = rotationDeg > 0 ? rotationDeg - 180 : rotationDeg + 180;
  }

  const alignment_score = clamp01(1 - Math.abs(rotationDeg) / MAX_ROTATION_DEG);

  const normalized_bbox = computeNormalizedBbox(shapeBbox, rotationDeg);

  const contourBonus = shapeResult.contour_score ? shapeResult.contour_score * 0.2 : 0;
  const topdown_confidence = clamp01(
    alignment_score * 0.3 +
    axisRatio * 0.4 +
    (points.length >= 20 ? 0.2 : points.length / 100) +
    contourBonus
  );

  const topdown_ready =
    topdown_confidence >= 0.35 &&
    points.length >= MIN_EDGE_POINTS &&
    axisRatio >= MIN_AXIS_RATIO;

  const pose_quality = clamp01(
    topdown_confidence * 0.5 +
    alignment_score * 0.3 +
    (shapeResult.key_complete ? 0.15 : 0) +
    (shapeResult.mask_confidence || 0) * 0.05
  );

  return {
    topdown_ready,
    alignment_score,
    rotation_deg: Math.round(rotationDeg * 10) / 10,
    normalized_bbox,
    topdown_confidence,
    axis_ratio: clamp01(axisRatio),
    pose_quality,
  };
}

/**
 * Snapshot de topdown para incluir al capturar.
 */
export function makeTopdownSnapshot(result, frameWidth, frameHeight) {
  if (!result) return null;
  const scaleX = frameWidth && frameHeight ? frameWidth / ANALYZE_WIDTH : 1;
  const scaleY = frameWidth && frameHeight ? frameHeight / ANALYZE_HEIGHT : 1;
  const normalized_bbox = result.normalized_bbox
    ? {
        x: result.normalized_bbox.x * scaleX,
        y: result.normalized_bbox.y * scaleY,
        w: result.normalized_bbox.w * scaleX,
        h: result.normalized_bbox.h * scaleY,
      }
    : null;
  return {
    topdown_ready: result.topdown_ready,
    alignment_score: result.alignment_score,
    rotation_deg: result.rotation_deg,
    normalized_bbox,
    topdown_confidence: result.topdown_confidence,
    axis_ratio: result.axis_ratio,
    pose_quality: result.pose_quality,
  };
}
