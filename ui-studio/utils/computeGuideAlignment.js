/**
 * computeGuideAlignment — alineación entre bbox detectada y zona de encuadre fija.
 * La zona fija es un rectángulo centrado que representa el encuadre ideal.
 * Frame de análisis: 120x90 (ANALYZE_W x ANALYZE_H).
 */

const FRAME_W = 120;
const FRAME_H = 90;

/** Zona fija: rect centrado. x,y,w,h en coords de frame. */
const GUIDE = {
  x: 30,
  y: 18,
  w: 60,
  h: 54,
  cx: 60,
  cy: 45,
};

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

/**
 * Calcula alineación entre la llave detectada y el encuadre fijo.
 * @param {{ x, y, w, h, cx, cy }|null} bbox - bbox en coords 120x90
 * @returns {number} 0-1, mayor = mejor alineación con zona fija
 */
export function computeGuideAlignment(bbox) {
  if (!bbox || bbox.w == null || bbox.h == null) return 0;

  const cx = bbox.cx ?? bbox.x + bbox.w / 2;
  const cy = bbox.cy ?? bbox.y + bbox.h / 2;
  const { w, h } = bbox;
  const dx = cx - GUIDE.cx;
  const dy = cy - GUIDE.cy;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const maxDist = Math.min(FRAME_W, FRAME_H) * 0.5;
  const distScore = clamp01(1 - dist / maxDist);

  const inGuide =
    cx >= GUIDE.x && cx <= GUIDE.x + GUIDE.w &&
    cy >= GUIDE.y && cy <= GUIDE.y + GUIDE.h;

  const sizeOk = w >= 8 && h >= 6 && w <= 80 && h <= 70;
  const sizeScore = sizeOk ? 1 : 0.5;

  if (inGuide) {
    return clamp01(0.6 + 0.4 * distScore * sizeScore);
  }
  return clamp01(0.2 + 0.4 * distScore * sizeScore);
}
