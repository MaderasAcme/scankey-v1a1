/**
 * autoCapture — lógica de auto-captura por calidad visual.
 * Solo dispara si tracking bueno, glare aceptable, shape buena, quality gate favorable.
 * Requiere estabilidad temporal (varios frames buenos consecutivos).
 */

const MIN_GOOD_FRAMES = 6;
const TRACKING_MIN = 0.6;
const GLARE_MAX = 0.35;
const SHAPE_MIN = 0.55;
const QUALITY_MIN = 0.65;

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function isFrameGood(tracking, glare, shape, qualityGate) {
  if (!tracking?.key_detected) return false;
  const trackingSub = clamp01(
    (tracking.centering_score ?? 0) * 0.3 +
    (tracking.coverage_score ?? 0) * 0.25 +
    (tracking.stability_score ?? 0) * 0.25 +
    (tracking.pose_score ?? 0) * 0.2
  );
  if (trackingSub < TRACKING_MIN) return false;

  const glareScore = glare?.glare_score ?? 0;
  if (glareScore > GLARE_MAX) return false;
  if (glare?.critical_glare_zone || glare?.reflection_state === 'critical') return false;

  if (!shape?.mask_detected) return false;
  const shapeSub = clamp01(
    (shape.mask_confidence ?? 0) * 0.5 +
    (shape.contour_score ?? 0) * 0.35 +
    (shape.key_complete ? 0.15 : 0)
  );
  if (shapeSub < SHAPE_MIN) return false;

  const qScore = qualityGate?.quality_score ?? 0;
  if (qScore < QUALITY_MIN) return false;
  if (!qualityGate?.capture_ready) return false;
  const hasCritical = (qualityGate.reasons || []).some((r) =>
    ['critical_glare', 'key_not_detected'].includes(r)
  );
  if (hasCritical) return false;

  return true;
}

function computeFrameScore(tracking, glare, shape, qualityGate) {
  if (!isFrameGood(tracking, glare, shape, qualityGate)) return 0;
  const t = clamp01(
    (tracking.centering_score ?? 0) * 0.25 +
    (tracking.stability_score ?? 0) * 0.35 +
    (tracking.coverage_score ?? 0) * 0.2 +
    (tracking.pose_score ?? 0) * 0.2
  );
  const g = 1 - Math.min(1, (glare?.glare_score ?? 0) * 1.5);
  const s = (shape?.mask_confidence ?? 0) * 0.5 + (shape?.contour_score ?? 0) * 0.35 + (shape?.key_complete ? 0.15 : 0);
  const q = qualityGate?.quality_score ?? 0;
  return clamp01((t * 0.3 + g * 0.2 + s * 0.25 + q * 0.25));
}

function getBlockReason(tracking, glare, shape, qualityGate) {
  if (!tracking?.key_detected) return 'key_not_detected';
  const trackingSub = clamp01(
    (tracking.centering_score ?? 0) * 0.3 + (tracking.coverage_score ?? 0) * 0.25 +
    (tracking.stability_score ?? 0) * 0.25 + (tracking.pose_score ?? 0) * 0.2
  );
  if (trackingSub < TRACKING_MIN) return 'tracking_insufficient';
  if ((glare?.glare_score ?? 0) > GLARE_MAX) return 'glare_too_high';
  if (glare?.critical_glare_zone || glare?.reflection_state === 'critical') return 'critical_glare';
  if (!shape?.mask_detected) return 'shape_not_detected';
  const shapeSub = clamp01((shape.mask_confidence ?? 0) * 0.5 + (shape.contour_score ?? 0) * 0.35 + (shape.key_complete ? 0.15 : 0));
  if (shapeSub < SHAPE_MIN) return 'shape_insufficient';
  if ((qualityGate?.quality_score ?? 0) < QUALITY_MIN) return 'quality_below_threshold';
  if (!qualityGate?.capture_ready) return 'capture_not_ready';
  return null;
}

/**
 * Evalúa si el frame actual permite auto-captura y actualiza estado temporal.
 *
 * @param {Object} opts - { tracking, glare, shape, qualityGate }
 * @param {Object} state - { goodFramesCount }
 * @returns {{ auto_capture_ready: boolean, auto_capture_reason: string, auto_capture_score: number, nextState: Object }}
 */
export function evaluateAutoCapture(opts, state = { goodFramesCount: 0 }) {
  const { tracking, glare, shape, qualityGate } = opts;
  const good = isFrameGood(tracking, glare, shape, qualityGate);
  const nextCount = good ? (state.goodFramesCount || 0) + 1 : 0;
  const nextState = { goodFramesCount: nextCount };

  const auto_capture_score = computeFrameScore(tracking, glare, shape, qualityGate);
  const auto_capture_ready = nextCount >= MIN_GOOD_FRAMES;
  const blockReason = getBlockReason(tracking, glare, shape, qualityGate);
  const auto_capture_reason = auto_capture_ready
    ? 'quality_stable'
    : (blockReason || `stability_${nextCount}/${MIN_GOOD_FRAMES}`);

  return {
    auto_capture_ready,
    auto_capture_reason,
    auto_capture_score,
    nextState,
  };
}

/** Flag para activar auto-captura. Default false. */
export const AUTO_CAPTURE_ENABLED_KEY = 'auto_capture_enabled';
