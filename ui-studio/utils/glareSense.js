/**
 * glareSense — módulo pasivo de detección de reflejos/destellos.
 * Modo PASIVO: mide y expone señales, NO bloquea captura.
 * Heurísticas ligeras sin modelo pesado.
 *
 * Diseñado para alimentar en el futuro: quality_score, reasons[], glare_reason, quality_gate_vision, auto_capture.
 */

const ANALYZE_WIDTH = 120;
const ANALYZE_HEIGHT = 90;
const BURNED_LUMINANCE = 245;
const SPECULAR_LUMINANCE = 230;
const BURNED_AREA_WARNING = 0.02;
const BURNED_AREA_BAD = 0.08;
const BURNED_AREA_CRITICAL = 0.15;

let _glareCanvas = null;
let _glareCtx = null;

function getGlareCanvas() {
  if (typeof document === 'undefined') return null;
  if (!_glareCanvas) {
    _glareCanvas = document.createElement('canvas');
    _glareCanvas.width = ANALYZE_WIDTH;
    _glareCanvas.height = ANALYZE_HEIGHT;
    _glareCtx = _glareCanvas.getContext('2d');
  }
  return { canvas: _glareCanvas, ctx: _glareCtx };
}

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

/**
 * Comprueba si (px, py) está dentro del rectángulo roi.
 */
function pointInRoi(px, py, roi) {
  if (!roi || roi.w <= 0 || roi.h <= 0) return false;
  return px >= roi.x && px < roi.x + roi.w && py >= roi.y && py < roi.y + roi.h;
}

/**
 * Analiza reflejos en el frame. Detecta highlights saturados y concentración local.
 *
 * @param {HTMLVideoElement} video - elemento de video
 * @param {Object} opts - { roiBbox: { x, y, w, h } } desde key_tracking (coords 120x90)
 * @returns {Object} { glare_score, specular_score, burned_area_ratio, critical_glare_zone, reflection_state }
 */
export function analyzeGlare(video, opts = {}) {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return makeEmptyGlareResult();

  const { ctx } = getGlareCanvas() || {};
  if (!ctx) return makeEmptyGlareResult();

  ctx.drawImage(video, 0, 0, vw, vh, 0, 0, ANALYZE_WIDTH, ANALYZE_HEIGHT);
  const imgData = ctx.getImageData(0, 0, ANALYZE_WIDTH, ANALYZE_HEIGHT);
  const { data } = imgData;
  const totalPixels = ANALYZE_WIDTH * ANALYZE_HEIGHT;

  const roiBbox = opts.roiBbox || null;
  let burnedCount = 0;
  let burnedInRoi = 0;
  let specularSum = 0;
  let specularCount = 0;
  let minX = ANALYZE_WIDTH, minY = ANALYZE_HEIGHT, maxX = 0, maxY = 0;

  for (let i = 0; i < totalPixels; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    const l = (r * 0.299 + g * 0.587 + b * 0.114) | 0;
    const x = i % ANALYZE_WIDTH;
    const y = (i / ANALYZE_WIDTH) | 0;

    if (l >= BURNED_LUMINANCE) {
      burnedCount++;
      if (pointInRoi(x, y, roiBbox)) burnedInRoi++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    if (l >= SPECULAR_LUMINANCE) {
      specularSum += l;
      specularCount++;
    }
  }

  const burned_area_ratio = clamp01(burnedCount / totalPixels);

  const specular_score = specularCount > 0
    ? clamp01((specularSum / specularCount - SPECULAR_LUMINANCE) / (255 - SPECULAR_LUMINANCE))
    : 0;

  const roiArea = roiBbox ? roiBbox.w * roiBbox.h : totalPixels;
  const burnedRoiRatio = roiBbox && roiArea > 0 ? burnedInRoi / roiArea : 0;

  const bboxArea = burnedCount >= 3 ? (maxX - minX + 1) * (maxY - minY + 1) : totalPixels;
  const highlight_cluster_score = burnedCount >= 3
    ? clamp01(burnedCount / Math.max(1, bboxArea))
    : 0;

  const roiGlareStrong = roiBbox && burnedRoiRatio > 0.05;
  const critical_glare_zone = roiGlareStrong || burned_area_ratio > BURNED_AREA_CRITICAL;

  const roiSeverity = roiBbox ? burnedRoiRatio : 0;
  const roiWeighted = clamp01(roiSeverity * 1.5);

  const combined = clamp01(
    burned_area_ratio * 0.3 +
    specular_score * 0.35 +
    highlight_cluster_score * 0.2 +
    roiWeighted * 0.4 +
    (critical_glare_zone ? 0.25 : 0)
  );

  let reflection_state = 'ok';
  if (critical_glare_zone || combined >= 0.6) {
    reflection_state = 'critical';
  } else if (combined >= 0.4 || burned_area_ratio >= BURNED_AREA_BAD) {
    reflection_state = 'bad';
  } else if (combined >= 0.2 || specular_score >= 0.6 || burned_area_ratio >= BURNED_AREA_WARNING) {
    reflection_state = 'warning';
  }

  const glare_score = clamp01(
    burned_area_ratio * 0.4 + specular_score * 0.35 + highlight_cluster_score * 0.15 + roiWeighted * 0.3 + (critical_glare_zone ? 0.3 : 0)
  );

  return {
    glare_score,
    specular_score,
    burned_area_ratio,
    critical_glare_zone,
    reflection_state,
    highlight_cluster_score,
  };
}

function makeEmptyGlareResult() {
  return {
    glare_score: 0,
    specular_score: 0,
    burned_area_ratio: 0,
    critical_glare_zone: false,
    reflection_state: 'ok',
    highlight_cluster_score: 0,
  };
}

/**
 * Mensaje de guía UX. Solo devuelve mensaje si hay problema; si no, null (no añadir ruido).
 */
export function getGlareGuidanceMessage(result) {
  if (!result || result.reflection_state === 'ok') return null;
  if (result.reflection_state === 'critical') return 'Reflejo crítico';
  if (result.critical_glare_zone) return 'Evita el reflejo';
  if (result.reflection_state === 'bad') return 'Mueve la luz';
  if (result.reflection_state === 'warning') return 'Inclina un poco la llave';
  return null;
}

/**
 * Snapshot de glare para incluir al capturar.
 */
export function makeGlareSnapshot(result) {
  if (!result) return null;
  return {
    glare_score: result.glare_score,
    specular_score: result.specular_score,
    burned_area_ratio: result.burned_area_ratio,
    critical_glare_zone: result.critical_glare_zone,
    reflection_state: result.reflection_state,
    highlight_cluster_score: result.highlight_cluster_score,
  };
}
