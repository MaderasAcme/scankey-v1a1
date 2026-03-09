/**
 * Helpers para ResultsScreen — presentación, brand signal, formatos.
 */

export const POLICY_BANNER_ACTIONS = ['BLOCK', 'REQUIRE_MANUAL_REVIEW', 'ALLOW_WITH_OVERRIDE', 'RUN_OCR', 'WARN'];

const BRAND_SIGNAL_THRESHOLD = 0.6;

/**
 * Obtiene dataURL de la foto a usar para el recorte. Por defecto A optimizada.
 */
export function getSourceDataUrl(capturedPhotos, result) {
  if (!capturedPhotos) return null;
  const sideHint = result?.roi_side ?? result?.side ?? result?.debug?.roi_side;
  const side = sideHint === 'B' || sideHint === 'back' ? 'B' : 'A';
  const s = capturedPhotos[side];
  return s ? (s.optimizedDataUrl || s.originalDataUrl) : (capturedPhotos.A?.optimizedDataUrl || capturedPhotos.A?.originalDataUrl);
}

/**
 * Obtiene la señal de marca probable para un resultado.
 * @returns {{ show: boolean, label: string|null, detail: string|null }}
 */
export function getBrandSignalForResult(result, modoTaller, capturedPhotos) {
  const sideHint = result?.roi_side ?? result?.side ?? result?.debug?.roi_side;
  const side = sideHint === 'B' || sideHint === 'back' ? 'B' : 'A';
  const snap = capturedPhotos?.[side]?.snapshots?.brandReconstruction;
  const br = result?.brand_reconstruction || result?.brandReconstruction || result;
  const fromResult = br?.brand_partial_match != null || (Array.isArray(br?.brand_candidates) && br.brand_candidates.length > 0);
  const source = fromResult ? br : snap;
  if (!source) return { show: false, label: null, detail: null };

  const match = source.brand_partial_match;
  const conf = source.brand_match_confidence ?? 0;
  const zone = source.brand_evidence_zone;
  const mode = source.brand_reconstruction_mode;
  const candidates = Array.isArray(source.brand_candidates) ? source.brand_candidates : [];
  const ready = source.brand_reconstruction_ready === true;

  const hasMatch = !!match;
  const firstBrand = candidates.length > 0
    ? (typeof candidates[0] === 'string' ? candidates[0] : candidates[0]?.brand)
    : null;
  const hasValidCandidate = Boolean(firstBrand) || candidates.some((c) => typeof c === 'string' ? c : c?.brand);
  const meetsThreshold = conf >= BRAND_SIGNAL_THRESHOLD;

  if (!modoTaller) {
    if (hasMatch && meetsThreshold) {
      return { show: true, label: `Marca probable: ${match}`, detail: null };
    }
    return { show: false, label: null, detail: null };
  }

  if (hasMatch || hasValidCandidate) {
    const displayBrand = firstBrand || candidates.map((c) => (typeof c === 'string' ? c : c?.brand)).find(Boolean);
    const label = hasMatch ? `Marca probable: ${match}` : (displayBrand ? `Marca probable: ${displayBrand}` : null);
    if (!label) return { show: false, label: null, detail: null };
    const zoneMap = { head: 'head', blade: 'blade', both: 'head+blade', none: '—' };
    const modeMap = { combined: 'combined', partial_text: 'partial_text', partial_logo: 'partial_logo', metadata_assisted: 'metadata', none: '—' };
    const zoneStr = zoneMap[zone] || zone || '—';
    const modeStr = modeMap[mode] || mode || '—';
    const confStr = conf > 0 ? conf.toFixed(2) : '—';
    let detail = `${confStr} · ${zoneStr} · ${modeStr}`;
    const reasons = Array.isArray(source.brand_reconstruction_reason) ? source.brand_reconstruction_reason : [];
    const shortReason = reasons[0] && typeof reasons[0] === 'string' && reasons[0].length <= 18 ? reasons[0] : null;
    if (shortReason) detail += ` · ${shortReason}`;
    return { show: true, label, detail };
  }

  if (ready && !hasMatch && !hasValidCandidate) {
    return { show: true, label: 'Marca parcial débil', detail: null };
  }

  return { show: false, label: null, detail: null };
}

/**
 * Formatea valor para mostrar. En modoTaller, si existe *_meta, muestra discreto (source conf).
 */
export function formatAttrDisplay(value, meta, modoTaller) {
  if (!value && value !== false) return null;
  const label = typeof value === 'boolean' ? (value ? 'Sí' : 'No') : String(value);
  if (!modoTaller || !meta || typeof meta !== 'object') return label;
  const src = meta.source;
  const conf = meta.confidence;
  if (src || (conf != null && conf !== undefined)) {
    const extra = [src, conf != null ? String(Math.round(conf * 100) / 100) : null].filter(Boolean).join(' ');
    return extra ? `${label} (${extra})` : label;
  }
  return label;
}

/**
 * Formatea título de resultado (marca / modelo / tipo).
 */
export function formatTitle(r) {
  const parts = [(r.brand || r.model || r.type || '').toUpperCase()].filter(Boolean);
  if (r.model && r.model !== r.brand) parts.push(String(r.model).toUpperCase());
  if (r.type && !parts.includes(String(r.type).toUpperCase())) parts.push(String(r.type).toUpperCase());
  return parts.join(' / ') || 'No identificado';
}
