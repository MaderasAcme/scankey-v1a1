/**
 * keyTracking — módulo pasivo de tracking de llave por visión.
 * Modo PASIVO: mide y expone señales, NO bloquea captura.
 * Heurísticas ligeras sin modelo pesado.
 *
 * Diseñado para alimentar en el futuro: quality_score, roi_score, reasons[], auto_capture, quality_gate_vision.
 */

/** Contrato de snapshots de visión pasiva. Orden estable, una sola fuente de verdad. */
export const EMPTY_SNAPSHOTS = {
  tracking: null,
  glare: null,
  shape: null,
  topdown: null,
  contrast: null,
  dissection: null,
  textZones: null,
  damage: null,
  qualityGate: null,
  featureFusion: null,
  brandReconstruction: null,
};

const ANALYZE_WIDTH = 120;
const ANALYZE_HEIGHT = 90;
const HISTORY_LEN = 8;
const MIN_ASPECT = 1.8;
const MAX_ASPECT = 8;
const MIN_COVERAGE = 0.02;
const MAX_COVERAGE = 0.5;
const MIN_COMPONENT_PIXELS = 25;

/**
 * Clamp value to [0, 1].
 */
function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

/**
 * Flood-fill 4-connected para etiquetar región. Modifica labels en sitio.
 */
function floodFill(edges, labels, w, h, x, y, label) {
  const stack = [[x, y]];
  const idx = (xx, yy) => yy * w + xx;
  while (stack.length) {
    const [cx, cy] = stack.pop();
    if (cx < 0 || cx >= w || cy < 0 || cy >= h) continue;
    if (!edges[idx(cx, cy)] || labels[idx(cx, cy)]) continue;
    labels[idx(cx, cy)] = label;
    stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
  }
}

/**
 * Detecta bordes, agrupa por componentes conectadas, elige región dominante más razonable.
 * Evita bbox de toda la mesa/fondo; filtra ruido y componentes pequeñas.
 */
function findKeyCandidate(ctx, w, h) {
  const imgData = ctx.getImageData(0, 0, w, h);
  const { data } = imgData;
  const edgeThreshold = 40;

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
      if (mag > edgeThreshold) edges[y * w + x] = 1;
    }
  }

  const labels = new Array(w * h);
  labels.fill(0);
  let nextLabel = 1;
  const regions = [];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (edges[i] && !labels[i]) {
        floodFill(edges, labels, w, h, x, y, nextLabel);
        regions.push(nextLabel);
        nextLabel++;
      }
    }
  }

  const totalPixels = w * h;
  const candidates = [];

  for (const label of regions) {
    let minX = w, minY = h, maxX = 0, maxY = 0;
    let count = 0;
    for (let i = 0; i < labels.length; i++) {
      if (labels[i] !== label) continue;
      count++;
      const x = i % w;
      const y = (i / w) | 0;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }

    if (count < MIN_COMPONENT_PIXELS) continue;

    const bw = maxX - minX + 1;
    const bh = maxY - minY + 1;
    const area = bw * bh;
    const aspect = Math.max(bw, bh) / Math.min(bw, bh);
    const coverage = area / totalPixels;

    if (aspect < MIN_ASPECT || aspect > MAX_ASPECT) continue;
    if (coverage > MAX_COVERAGE) continue;

    const idealAspect = 4;
    const aspectScore = 1 - Math.abs(aspect - idealAspect) / idealAspect;
    const coverageScore = coverage >= MIN_COVERAGE && coverage <= MAX_COVERAGE
      ? 1 : Math.max(0, 1 - Math.abs(coverage - MIN_COVERAGE) / MIN_COVERAGE);

    candidates.push({
      x: minX, y: minY, w: bw, h: bh,
      cx: minX + bw / 2, cy: minY + bh / 2,
      aspect, edgeCount: count, area, totalPixels,
      _score: aspectScore * 0.6 + coverageScore * 0.4,
    });
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b._score - a._score);
  const best = candidates[0];
  delete best._score;
  return best;
}

/**
 * Compute scores from candidate and history. Returns object with all scores.
 */
function computeScores(candidate, frameW, frameH, history) {
  if (!candidate) {
    return {
      key_detected: false,
      roi_score: 0,
      centering_score: 0,
      coverage_score: 0,
      stability_score: 0,
      pose_score: 0,
      bbox: null,
    };
  }

  const { cx, cy, w, h, aspect, area, totalPixels } = candidate;
  const frameCx = frameW / 2;
  const frameCy = frameH / 2;

  // centering_score: distancia del centro de la ROI al centro del frame
  const dx = (cx - frameCx) / frameW;
  const dy = (cy - frameCy) / frameH;
  const distNorm = Math.sqrt(dx * dx + dy * dy) * 2;
  const centering_score = clamp01(1 - distNorm);

  // coverage_score: área de la ROI vs frame (llave completa, ni muy pequeña ni ocupa todo)
  const coverage = area / totalPixels;
  const coverage_ok = coverage >= MIN_COVERAGE && coverage <= MAX_COVERAGE;
  const coverage_score = coverage_ok
    ? clamp01(0.5 + (coverage - MIN_COVERAGE) / (MAX_COVERAGE - MIN_COVERAGE) * 0.5)
    : clamp01(coverage / MIN_COVERAGE) * 0.5;

  // stability_score: varianza de posición en history
  let stability_score = 1;
  if (history.length >= 3) {
    const cxs = history.map((h) => h.cx);
    const cys = history.map((h) => h.cy);
    const meanCx = cxs.reduce((a, b) => a + b, 0) / cxs.length;
    const meanCy = cys.reduce((a, b) => a + b, 0) / cys.length;
    const varCx = cxs.reduce((s, v) => s + (v - meanCx) ** 2, 0) / cxs.length;
    const varCy = cys.reduce((s, v) => s + (v - meanCy) ** 2, 0) / cys.length;
    const stdNorm = Math.sqrt(varCx + varCy) / Math.min(frameW, frameH);
    stability_score = clamp01(1 - stdNorm * 8);
  }

  // pose_score: aspect ratio ideal (llave alargada, ~3–5:1 es bueno)
  const idealAspect = 4;
  const aspectDev = Math.abs(aspect - idealAspect) / idealAspect;
  const pose_score = clamp01(1 - aspectDev * 0.5);

  // roi_score: combinación ponderada
  const roi_score = clamp01(
    centering_score * 0.3 + coverage_score * 0.25 + stability_score * 0.25 + pose_score * 0.2
  );

  return {
    key_detected: true,
    roi_score,
    centering_score,
    coverage_score,
    stability_score,
    pose_score,
    bbox: { x: candidate.x, y: candidate.y, w: candidate.w, h: candidate.h, cx: candidate.cx, cy: candidate.cy },
    coverage,
    aspect,
  };
}

/**
 * Mensaje de guía UX según scores.
 * Casos separados: no detectada | descentrada | pequeña | inestable | válida.
 */
export function getGuidanceMessage(result) {
  if (!result.key_detected) return 'Busca la llave';
  const { centering_score, coverage_score, stability_score } = result;
  if (centering_score < 0.5) return 'Centra la llave';
  if (coverage_score < 0.4) return 'Acércala un poco';
  if (stability_score < 0.5) return 'Mantén el móvil quieto';
  return 'Captura válida';
}

let _analyzeCanvas = null;
let _analyzeCtx = null;

function getAnalyzeCanvas() {
  if (typeof document === 'undefined') return null;
  if (!_analyzeCanvas) {
    _analyzeCanvas = document.createElement('canvas');
    _analyzeCanvas.width = ANALYZE_WIDTH;
    _analyzeCanvas.height = ANALYZE_HEIGHT;
    _analyzeCtx = _analyzeCanvas.getContext('2d');
  }
  return { canvas: _analyzeCanvas, ctx: _analyzeCtx };
}

/**
 * Analiza un frame de video y devuelve el resultado de tracking.
 * Reutiliza un canvas interno; no crea uno nuevo por frame.
 *
 * @param {HTMLVideoElement} video - elemento de video con el stream
 * @param {Object} prevState - { history: Array<{cx,cy}>, lastResult }
 * @returns {{ result: Object, nextState: Object }}
 */
export function analyzeFrame(video, prevState = {}) {
  const { history = [] } = prevState;
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) {
    return { result: makeEmptyResult(), nextState: prevState };
  }

  const { ctx } = getAnalyzeCanvas() || {};
  if (!ctx) return { result: makeEmptyResult(), nextState: prevState };

  ctx.drawImage(video, 0, 0, vw, vh, 0, 0, ANALYZE_WIDTH, ANALYZE_HEIGHT);
  const candidate = findKeyCandidate(ctx, ANALYZE_WIDTH, ANALYZE_HEIGHT);

  let nextHistory = [...history];
  if (candidate) {
    nextHistory.push({ cx: candidate.cx, cy: candidate.cy });
    if (nextHistory.length > HISTORY_LEN) nextHistory.shift();
  } else {
    nextHistory = [];
  }

  const result = computeScores(candidate, ANALYZE_WIDTH, ANALYZE_HEIGHT, nextHistory);
  const nextState = { history: nextHistory, lastResult: result };

  return { result, nextState };
}

function makeEmptyResult() {
  return {
    key_detected: false,
    roi_score: 0,
    centering_score: 0,
    coverage_score: 0,
    stability_score: 0,
    pose_score: 0,
    bbox: null,
  };
}

/**
 * Crea un snapshot de debug para el frame capturado.
 * Escala bbox al tamaño real del frame si existe.
 */
export function makeTrackingSnapshot(result, frameWidth, frameHeight) {
  if (!result || !frameWidth || !frameHeight) return null;
  const scaleX = frameWidth / ANALYZE_WIDTH;
  const scaleY = frameHeight / ANALYZE_HEIGHT;
  const bbox = result.bbox
    ? {
        x: result.bbox.x * scaleX,
        y: result.bbox.y * scaleY,
        w: result.bbox.w * scaleX,
        h: result.bbox.h * scaleY,
      }
    : null;
  return {
    key_detected: result.key_detected,
    roi_score: result.roi_score,
    centering_score: result.centering_score,
    coverage_score: result.coverage_score,
    stability_score: result.stability_score,
    pose_score: result.pose_score,
    bbox,
    message: getGuidanceMessage(result),
  };
}
