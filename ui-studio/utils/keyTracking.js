/**
 * keyTracking — módulo pasivo de tracking de llave por visión.
 * Modo PASIVO: mide y expone señales, NO bloquea captura.
 * Heurísticas ligeras sin modelo pesado.
 *
 * Diseñado para alimentar en el futuro: quality_score, roi_score, reasons[], auto_capture, quality_gate_vision.
 */

const ANALYZE_WIDTH = 120;
const ANALYZE_HEIGHT = 90;
const HISTORY_LEN = 8;
const MIN_ASPECT = 1.8;
const MAX_ASPECT = 8;
const MIN_COVERAGE = 0.02;
const MAX_COVERAGE = 0.5;

/**
 * Clamp value to [0, 1].
 */
function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

/**
 * Convert frame to grayscale luminance and detect edges via simple gradient.
 * Returns { bbox, edgeCount, totalPixels } or null if no candidate.
 */
function findKeyCandidate(ctx, w, h) {
  const imgData = ctx.getImageData(0, 0, w, h);
  const { data } = imgData;
  const edgeThreshold = 40;

  // Simple horizontal + vertical gradient for edge detection
  const edges = new Uint8Array(w * h);
  let edgeCount = 0;

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = (y * w + x) << 2;
      const l = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) | 0;
      const lR = (data[i + 4] * 0.299 + data[i + 5] * 0.587 + data[i + 6] * 0.114) | 0;
      const lL = (data[i - 4] * 0.299 + data[i - 5] * 0.587 + data[i - 6] * 0.114) | 0;
      const lD = (data[(y + 1) * w * 4 + x * 4] * 0.299 + data[(y + 1) * w * 4 + x * 4 + 1] * 0.587 + data[(y + 1) * w * 4 + x * 4 + 2] * 0.114) | 0;
      const lU = (data[(y - 1) * w * 4 + x * 4] * 0.299 + data[(y - 1) * w * 4 + x * 4 + 1] * 0.587 + data[(y - 1) * w * 4 + x * 4 + 2] * 0.114) | 0;

      const gx = Math.abs(lR - lL);
      const gy = Math.abs(lD - lU);
      const mag = Math.sqrt(gx * gx + gy * gy);
      if (mag > edgeThreshold) {
        edges[y * w + x] = 1;
        edgeCount++;
      }
    }
  }

  if (edgeCount < 20) return null;

  // Bounding box of edge pixels
  let minX = w, minY = h, maxX = 0, maxY = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (edges[y * w + x]) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  const bw = maxX - minX + 1;
  const bh = maxY - minY + 1;
  if (bw < 5 || bh < 5) return null;

  const aspect = Math.max(bw, bh) / Math.min(bw, bh);
  if (aspect < MIN_ASPECT || aspect > MAX_ASPECT) return null;

  return {
    x: minX,
    y: minY,
    w: bw,
    h: bh,
    cx: minX + bw / 2,
    cy: minY + bh / 2,
    aspect,
    edgeCount,
    area: bw * bh,
    totalPixels: w * h,
  };
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
 */
export function getGuidanceMessage(result) {
  if (!result.key_detected) {
    if (result.coverage_score < 0.3) return 'Acércala un poco';
    return 'Centra la llave';
  }
  const { centering_score, coverage_score, stability_score } = result;
  if (centering_score < 0.5) return 'Centra la llave';
  if (coverage_score < 0.4) return 'Acércala un poco';
  if (stability_score < 0.5) return 'Mantén el móvil quieto';
  if (result.roi_score >= 0.7) return 'Captura válida';
  return 'Llave detectada';
}

/**
 * Analiza un frame de video y devuelve el resultado de tracking.
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

  const canvas = document.createElement('canvas');
  canvas.width = ANALYZE_WIDTH;
  canvas.height = ANALYZE_HEIGHT;
  const ctx = canvas.getContext('2d');
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
