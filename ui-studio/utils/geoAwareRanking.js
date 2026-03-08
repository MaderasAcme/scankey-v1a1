/**
 * geoAwareRanking — capa geo-aware que prioriza referencias por país/zona/tienda.
 * España primero. store_id como unidad operativa. NO sustituye la visión.
 *
 * Contexto: country, province, city, urban_rural, store_type, store_trust_level, group_id.
 * Bonus pequeño y controlado. La visión sigue mandando.
 */

import { getCatalogRefs } from './catalogRefs';
import { loadJSON } from './storage';

const GEO_SETTINGS_KEY = 'scn_settings';
const GEO_CONTEXT_KEY = 'geo';

/** Bonus máximo por geo — menor que vision delta (0.08). */
const GEO_BONUS_CAP = 0.03;

/** Países prioritarios (España primero). */
const SPAIN_CODES = new Set(['es', 'esp', 'espana', 'spain']);

/** Tags del catálogo que indican refs comunes en España (JMA, COMUN). */
const SPAIN_FAVORED_TAGS = new Set(['comun', 'jma', 'base']);

function _norm(s) {
  if (s == null) return '';
  return String(s || '').trim().toLowerCase();
}

function _isSpain(country) {
  const c = _norm(country);
  return c === 'es' || c === 'esp' || SPAIN_CODES.has(c) || c.includes('spain') || c.includes('espana');
}

/** País por defecto para España primero (cuando no hay contexto explícito). */
const DEFAULT_COUNTRY_ES = 'ES';

/**
 * Obtiene el contexto geo desde settings.
 * Si no hay geo configurado, devuelve country: ES por defecto (España primero).
 * @returns {{ country?, province?, city?, urban_rural?, store_type?, store_trust_level?, group_id?, store_id? }}
 */
export function getGeoContext() {
  const s = loadJSON(GEO_SETTINGS_KEY, {});
  const geo = s[GEO_CONTEXT_KEY] || {};
  const hasAny = !!(geo.country || geo.province || geo.city || geo.store_id || geo.group_id);
  return {
    country: geo.country ?? (hasAny ? null : DEFAULT_COUNTRY_ES),
    province: geo.province ?? null,
    city: geo.city ?? null,
    urban_rural: geo.urban_rural ?? null,
    store_type: geo.store_type ?? null,
    store_trust_level: geo.store_trust_level ?? null,
    group_id: geo.group_id ?? null,
    store_id: geo.store_id ?? null,
  };
}

/**
 * Guardrails: no aplicar bonus si no hay store_id o país en modo estricto.
 * Por defecto, España se asume si no hay contexto (fallback conservador).
 */
function _shouldApplyGeoBonus(ctx, strictStoreId = false) {
  if (strictStoreId && !ctx.store_id) return false;
  return true;
}

/**
 * Calcula geo_bonus por candidato y metadatos.
 *
 * @param {Object[]} results - candidatos del API
 * @param {Object} [geoContext] - contexto geo (si no se pasa, usa getGeoContext())
 * @returns {{ geo_ranking_ready, geo_bonus, geo_reasoning, geo_context_used }}
 */
export function applyGeoAwareRanking(results, geoContext) {
  const ctx = geoContext || getGeoContext();
  const used = { country: ctx.country ?? null };
  if (ctx.province) used.province = ctx.province;
  if (ctx.city) used.city = ctx.city;
  if (ctx.urban_rural) used.urban_rural = ctx.urban_rural;
  if (ctx.store_type) used.store_type = ctx.store_type;
  if (ctx.store_trust_level != null) used.store_trust_level = ctx.store_trust_level;
  if (ctx.group_id) used.group_id = ctx.group_id;
  if (ctx.store_id) used.store_id = ctx.store_id;

  const reasoning = [];
  const refs = getCatalogRefs();

  const hasContext = !!(
    ctx.country ||
    ctx.province ||
    ctx.city ||
    ctx.store_id ||
    ctx.group_id
  );

  const geo_ranking_ready = hasContext;

  if (!results?.length || !Array.isArray(results)) {
    return {
      geo_ranking_ready,
      geo_bonus: [],
      geo_reasoning: hasContext ? reasoning : ['no_geo_context'],
      geo_context_used: used,
    };
  }

  if (!_shouldApplyGeoBonus(ctx, false)) {
    reasoning.push('no_store_id_skip');
    return {
      geo_ranking_ready,
      geo_bonus: results.map(() => 0),
      geo_reasoning: reasoning,
      geo_context_used: used,
    };
  }

  const isSpain = ctx.country ? _isSpain(ctx.country) : false;
  if (isSpain) reasoning.push('spain_first');
  if (ctx.store_id) reasoning.push('store_id_used');
  if (ctx.group_id) reasoning.push('group_used');

  const trustLevel = ctx.store_trust_level != null
    ? Math.max(0, Math.min(1, Number(ctx.store_trust_level)))
    : 0.5;
  const trustMultiplier = 0.7 + trustLevel * 0.3;

  const baseBonus = isSpain ? 0.02 : 0.01;
  const rawCap = GEO_BONUS_CAP * trustMultiplier;
  const effectiveCap = Math.min(GEO_BONUS_CAP, rawCap);

  const findCatalogEntry = (c) => {
    const candidates = [
      c.id_model_ref,
      c.ref,
      c.model,
      (c.id_model_ref || '').split('_').pop(),
    ].filter(Boolean).map((x) => String(x).toUpperCase());
    for (const k of candidates) {
      if (refs[k]) return refs[k];
    }
    return null;
  };

  const geo_bonus = results.map((c) => {
    let bonus = 0;
    const entry = findCatalogEntry(c);

    if (!entry) return 0;

    const tags = Array.isArray(entry.tags) ? entry.tags : [];
    const hasSpainTag = tags.some((t) => SPAIN_FAVORED_TAGS.has(_norm(t)));

    if (isSpain && hasSpainTag) {
      bonus = baseBonus * trustMultiplier;
    } else if (isSpain) {
      bonus = baseBonus * 0.5 * trustMultiplier;
    }

    bonus = Math.min(effectiveCap, Math.max(0, bonus));
    return Math.round(bonus * 1000) / 1000;
  });

  return {
    geo_ranking_ready,
    geo_bonus,
    geo_reasoning: reasoning.length ? reasoning : ['geo_applied'],
    geo_context_used: used,
  };
}
