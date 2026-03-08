/**
 * catalogRefs — carga canónica de refs para matching.
 * Fuente: refs/catalog_refs.json (si existe).
 */

import catalogData from '@refs/catalog_refs.json';

const _refs = catalogData?.refs ?? {};

export function getCatalogRefs() {
  return _refs;
}

export function hasCatalogRefs() {
  return _refs && Object.keys(_refs).length > 0;
}
