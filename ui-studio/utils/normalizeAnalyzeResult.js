/**
 * Normalizador robusto de respuesta de /api/analyze-key.
 * Garantiza: results[3] ordenado por confidence, high/low_confidence, campos esperados.
 */

const DEFAULT_CROP_BBOX = { x: 0, y: 0, w: 1, h: 1 };

function ensureCropBbox(item) {
  const raw = item?.crop_bbox ?? item?.bbox;
  if (raw && typeof raw === 'object' && typeof raw.w === 'number' && raw.w > 0 && typeof raw.h === 'number' && raw.h > 0) {
    return {
      x: typeof raw.x === 'number' ? raw.x : 0,
      y: typeof raw.y === 'number' ? raw.y : 0,
      w: raw.w,
      h: raw.h,
    };
  }
  return { ...DEFAULT_CROP_BBOX };
}

function normalizeItem(raw, index) {
  const conf = raw?.confidence ?? raw?.conf ?? raw?.score ?? 0;
  const numConf = typeof conf === 'number' ? conf : parseFloat(conf) || 0;
  const compat = Array.isArray(raw?.compatibility_tags)
    ? raw.compatibility_tags
    : raw?.compatibility_tags
      ? [raw.compatibility_tags]
      : [];
  return {
    ...raw,
    rank: raw?.rank ?? index + 1,
    type: raw?.type ?? 'Serreta',
    brand: raw?.brand ?? null,
    model: raw?.model ?? raw?.label ?? raw?.ref ?? null,
    orientation: raw?.orientation ?? 'front',
    head_color: raw?.head_color ?? null,
    visual_state: raw?.visual_state ?? null,
    patentada: raw?.patentada ?? null,
    compatibility_tags: compat,
    confidence: Math.max(0, Math.min(1, numConf)),
    explain_text: raw?.explain_text ?? raw?.explanation ?? '',
    crop_bbox: ensureCropBbox(raw),
    id_model_ref: raw?.id_model_ref ?? raw?.id ?? null,
  };
}

/**
 * @param {Object} payload - Respuesta cruda del API
 * @returns {Object} - Payload normalizado con results[3], high_confidence, low_confidence
 */
export function normalizeAnalyzeResult(payload) {
  if (!payload || typeof payload !== 'object') return payload;

  const rawList = payload?.results ?? payload?.candidates ?? [];
  const arr = Array.isArray(rawList) ? rawList : [];

  const normalized = arr.map((r, i) => normalizeItem(r, i));
  const sorted = [...normalized].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));

  while (sorted.length < 3) {
    sorted.push(normalizeItem({ rank: sorted.length + 1, confidence: 0, explain_text: 'Sin más candidatos.' }, sorted.length));
  }

  const top3 = sorted.slice(0, 3).map((r, i) => ({ ...r, rank: i + 1 }));

  const topConf = top3[0]?.confidence ?? 0;
  const high_confidence = topConf >= 0.95;
  const low_confidence = topConf < 0.60;

  return {
    ...payload,
    results: top3,
    high_confidence,
    low_confidence,
  };
}
