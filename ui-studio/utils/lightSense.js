/**
 * lightSense — módulo pasivo de detección de iluminación.
 * Clasifica luz: ok, low_light, very_low_light.
 * No activa torch; solo mide y reporta. Torch se maneja en WebCameraCapture.
 *
 * Campos: light_ready, light_level, avg_luma, roi_luma, low_light_detected.
 * Torch: torch_supported, torch_requested, torch_active se rellenan por el componente.
 */

const ANALYZE_WIDTH = 120;
const ANALYZE_HEIGHT = 90;
const LUMA_OK = 50;
const LUMA_LOW = 25;

let _lightCanvas = null;
let _lightCtx = null;

function getLightCanvas() {
  if (typeof document === 'undefined') return null;
  if (!_lightCanvas) {
    _lightCanvas = document.createElement('canvas');
    _lightCanvas.width = ANALYZE_WIDTH;
    _lightCanvas.height = ANALYZE_HEIGHT;
    _lightCtx = _lightCanvas.getContext('2d');
  }
  return { canvas: _lightCanvas, ctx: _lightCtx };
}

function pointInRoi(px, py, roi) {
  if (!roi || roi.w <= 0 || roi.h <= 0) return false;
  return px >= roi.x && px < roi.x + roi.w && py >= roi.y && py < roi.y + roi.h;
}

/**
 * Calcula luminancia media de una región (0-255).
 *
 * @param {HTMLVideoElement} video
 * @param {Object} opts - { roiBbox: { x, y, w, h } } coords en 120x90
 * @returns {{ light_ready: boolean, light_level: string, avg_luma: number, roi_luma: number|null, low_light_detected: boolean }}
 */
export function analyzeLight(video, opts = {}) {
  const vw = video?.videoWidth;
  const vh = video?.videoHeight;
  if (!vw || !vh) return makeEmptyLightResult();

  const { ctx } = getLightCanvas() || {};
  if (!ctx) return makeEmptyLightResult();

  ctx.drawImage(video, 0, 0, vw, vh, 0, 0, ANALYZE_WIDTH, ANALYZE_HEIGHT);
  const imgData = ctx.getImageData(0, 0, ANALYZE_WIDTH, ANALYZE_HEIGHT);
  const { data } = imgData;
  const totalPixels = ANALYZE_WIDTH * ANALYZE_HEIGHT;

  const roiBbox = opts.roiBbox || null;
  let sumLuma = 0;
  let roiSum = 0;
  let roiCount = 0;

  for (let i = 0; i < totalPixels; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    const l = r * 0.299 + g * 0.587 + b * 0.114;
    sumLuma += l;
    if (roiBbox) {
      const x = i % ANALYZE_WIDTH;
      const y = (i / ANALYZE_WIDTH) | 0;
      if (pointInRoi(x, y, roiBbox)) {
        roiSum += l;
        roiCount++;
      }
    }
  }

  const avg_luma = totalPixels > 0 ? sumLuma / totalPixels : 0;
  const roi_luma = roiCount > 0 ? roiSum / roiCount : null;
  const effectiveLuma = roi_luma !== null ? Math.min(avg_luma, roi_luma) : avg_luma;

  let light_level = 'ok';
  if (effectiveLuma < LUMA_LOW) light_level = 'very_low_light';
  else if (effectiveLuma < LUMA_OK) light_level = 'low_light';

  const low_light_detected = light_level !== 'ok';
  const light_ready = true;

  return {
    light_ready,
    light_level,
    avg_luma,
    roi_luma,
    low_light_detected,
    torch_supported: false, // lo rellena el componente si detecta capability
    torch_requested: false,
    torch_active: false,
  };
}

function makeEmptyLightResult() {
  return {
    light_ready: false,
    light_level: 'unknown',
    avg_luma: 0,
    roi_luma: null,
    low_light_detected: false,
    torch_supported: false,
    torch_requested: false,
    torch_active: false,
  };
}

/**
 * Snapshot de light para incluir al capturar.
 */
export function makeLightSnapshot(result) {
  if (!result) return null;
  return {
    light_ready: result.light_ready,
    light_level: result.light_level,
    avg_luma: result.avg_luma,
    roi_luma: result.roi_luma,
    low_light_detected: result.low_light_detected,
    torch_supported: result.torch_supported,
    torch_requested: result.torch_requested,
    torch_active: result.torch_active,
  };
}
