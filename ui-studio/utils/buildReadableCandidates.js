/**
 * buildReadableCandidates — unifica candidatos de texto de varias fuentes.
 * Solo lectura visual, no persiste ni duplica datos.
 * Orden: 1) OCR, 2) brand, 3) catalog, 4) otras.
 */

const MAX_CANDIDATES = 6;

function normalize(str) {
  if (!str || typeof str !== 'string') return '';
  return str.trim().replace(/\s+/g, ' ');
}

function isMeaningful(s) {
  return s.length >= 2 && /[A-Za-z0-9]/.test(s);
}

/**
 * @param {Object} sources - { ocrReal, brandReconstruction, catalogMatching }
 * @returns {Array<{ text: string, confidence?: number, source: string }>}
 */
export function buildReadableCandidates(sources = {}) {
  const seen = new Set();
  const candidates = [];

  function add(text, confidence, source) {
    const t = normalize(text);
    if (!t || !isMeaningful(t)) return;
    const key = t.toUpperCase();
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push({ text: t, confidence, source });
  }

  const ocr = sources.ocrReal || sources.ocrPreview;
  if (ocr) {
    const head = normalize(ocr.head_text || '');
    const blade = normalize(ocr.blade_text || '');
    const hc = ocr.head_confidence ?? 0;
    const bc = ocr.blade_confidence ?? 0;
    if (head) add(head, hc, 'ocr');
    if (blade) add(blade, bc, 'ocr');
    if (head && blade) add(`${head} ${blade}`, (hc + bc) / 2, 'ocr');
  }

  const br = sources.brandReconstruction;
  if (br) {
    const partial = br.brand_partial_match;
    if (partial) add(partial, br.brand_match_confidence ?? 0.5, 'brand');
    const list = br.brand_candidates || [];
    for (const c of list) {
      if (c.brand) add(c.brand, c.confidence ?? 0.4, 'brand');
    }
  }

  const cat = sources.catalogMatching;
  if (cat?.catalog_match_candidates) {
    for (const c of cat.catalog_match_candidates.slice(0, 3)) {
      if (c.ref) add(c.ref, c.score ?? 0.4, 'catalog');
      if (c.model && c.model !== c.ref) add(c.model, (c.score ?? 0.4) * 0.9, 'catalog');
      if (c.brand) add(c.brand, (c.score ?? 0.4) * 0.8, 'catalog');
    }
  }

  candidates.sort((a, b) => {
    const order = { ocr: 0, brand: 1, catalog: 2 };
    const oa = order[a.source] ?? 3;
    const ob = order[b.source] ?? 3;
    if (oa !== ob) return oa - ob;
    return (b.confidence ?? 0) - (a.confidence ?? 0);
  });

  return candidates.slice(0, MAX_CANDIDATES);
}
