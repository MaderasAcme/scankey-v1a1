/**
 * brandMetadataLite — fuente mínima de metadatos de marca para brand_reconstruction.
 * Ligera y segura. Si no hay metadata suficiente, el módulo debe degradar con gracia.
 *
 * Estructura documentada para extensión futura.
 * NO inventa marcas. Solo expone marcas conocidas cuando existen referencias internas.
 */

/**
 * Marcas conocidas a partir de referencias del catálogo (refs/catalog_refs.json).
 * Lista mínima; ampliar cuando existan más fuentes.
 */
const KNOWN_BRANDS = ['JMA'];

/**
 * Obtiene candidatos de marca por zona.
 * Por ahora no hay mapeo zona→marca en metadata; se devuelven todas las conocidas
 * cuando la zona es válida. Si no hay metadata suficiente, devuelve [].
 *
 * @param {string} zone - 'head' | 'blade' | 'both' | 'none'
 * @returns {Array<{ brand: string, priority: number }>}
 */
export function getBrandCandidatesByZone(zone) {
  if (!zone || zone === 'none' || KNOWN_BRANDS.length === 0) {
    return [];
  }
  const priority = zone === 'both' ? 0.7 : zone === 'head' ? 0.6 : 0.5;
  return KNOWN_BRANDS.slice(0, 3).map((brand, i) => ({
    brand,
    priority: Math.max(0.1, priority - i * 0.15),
  }));
}

/**
 * Indica si hay metadata disponible para asistir la reconstrucción.
 */
export function hasMetadataSupport() {
  return KNOWN_BRANDS.length > 0;
}
