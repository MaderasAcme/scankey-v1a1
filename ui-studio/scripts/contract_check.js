/**
 * Lead Engineer - ScanKey Contract Validator
 * Valida que el JSON cumpla estrictamente con el contrato ScanKey v2.
 * Uso: node scripts/contract_check.js <ruta_json> [ruta_json2 ...]
 *      node scripts/contract_check.js scripts/sample_responses/*.json
 */

const fs = require('fs');
const path = require('path');

const filePaths = process.argv.slice(2).filter(Boolean);

if (filePaths.length === 0) {
  console.error("❌ Error: Proporciona al menos una ruta a un archivo JSON.");
  process.exit(1);
}

function validateContract(data, filePath) {
  const errors = [];
  const basename = path.basename(filePath);

  // 1. Campos raíz obligatorios
  const requiredRoot = [
    'input_id', 'timestamp', 'results', 'high_confidence', 'low_confidence',
    'manufacturer_hint', 'should_store_sample', 'storage_probability',
    'current_samples_for_candidate', 'manual_correction_hint', 'debug'
  ];
  requiredRoot.forEach(key => {
    if (!(key in data)) errors.push(`[${basename}] Campo raíz faltante: ${key}`);
  });

  if (errors.length > 0) return { ok: false, errors };

  // 2. Results: exactamente 3
  if (!Array.isArray(data.results) || data.results.length !== 3) {
    errors.push(`[${basename}] 'results' debe tener exactamente 3 elementos. Encontrados: ${data.results?.length ?? 0}`);
  }

  // 3. Orden y confianza
  let lastConf = 1.1;
  (data.results || []).forEach((res, i) => {
    if (typeof res.confidence !== 'number' || res.confidence < 0 || res.confidence > 1) {
      errors.push(`[${basename}] Resultado ${i}: Confianza fuera de rango [0,1]: ${res.confidence}`);
    }
    if (res.confidence > lastConf) {
      errors.push(`[${basename}] Resultado ${i}: Mal ordenado. Confianza (${res.confidence}) > anterior (${lastConf})`);
    }
    lastConf = res.confidence;
    if (!Array.isArray(res.compatibility_tags)) {
      errors.push(`[${basename}] Resultado ${i}: 'compatibility_tags' debe ser array.`);
    }
    if (!res.crop_bbox || typeof res.crop_bbox !== 'object') {
      errors.push(`[${basename}] Resultado ${i}: crop_bbox es obligatorio.`);
    } else {
      ['x', 'y', 'w', 'h'].forEach(dim => {
        if (typeof res.crop_bbox[dim] !== 'number') {
          errors.push(`[${basename}] Resultado ${i}: crop_bbox.${dim} debe ser numérico.`);
        }
      });
      if (res.crop_bbox.w <= 0 || res.crop_bbox.h <= 0) {
        errors.push(`[${basename}] Resultado ${i}: crop_bbox.w y crop_bbox.h deben ser > 0.`);
      }
    }
    if (typeof res.rank !== 'number' || res.rank < 1 || res.rank > 3) {
      errors.push(`[${basename}] Resultado ${i}: rank debe ser 1..3.`);
    }
  });

  // 4. Flags de confianza
  const top = (data.results && data.results[0]) ? data.results[0].confidence : 0;
  const expectedHigh = top >= 0.95;
  const expectedLow = top < 0.60;
  if (data.high_confidence !== expectedHigh) {
    errors.push(`[${basename}] high_confidence: esperado ${expectedHigh}, encontrado ${data.high_confidence}`);
  }
  if (data.low_confidence !== expectedLow) {
    errors.push(`[${basename}] low_confidence: esperado ${expectedLow}, encontrado ${data.low_confidence}`);
  }

  // 5. manufacturer_hint
  const hint = data.manufacturer_hint;
  if (!hint || typeof hint.found !== 'boolean') errors.push(`[${basename}] manufacturer_hint.found debe ser boolean.`);
  if (!hint || typeof hint.confidence !== 'number') errors.push(`[${basename}] manufacturer_hint.confidence debe ser numérico.`);

  // 6. storage_probability, should_store_sample
  if (typeof data.storage_probability !== 'number' || data.storage_probability < 0 || data.storage_probability > 1) {
    errors.push(`[${basename}] storage_probability debe ser número en [0,1].`);
  }
  if (typeof data.should_store_sample !== 'boolean') {
    errors.push(`[${basename}] should_store_sample debe ser boolean.`);
  }
  if (typeof data.current_samples_for_candidate !== 'number') {
    errors.push(`[${basename}] current_samples_for_candidate debe ser número.`);
  }
  if (!data.manual_correction_hint || !Array.isArray(data.manual_correction_hint?.fields)) {
    errors.push(`[${basename}] manual_correction_hint.fields debe ser array.`);
  }
  if (typeof data.debug !== 'object' || data.debug === null) {
    errors.push(`[${basename}] debug debe ser objeto.`);
  }
  if (data.debug && !('roi_source' in data.debug)) {
    errors.push(`[${basename}] debug.roi_source debe existir (model|heuristic|fallback).`);
  }
  if (data.debug && !('model_version' in data.debug)) {
    errors.push(`[${basename}] debug.model_version debe existir.`);
  }
  // P0.2: quality_* opcional (PASIVO); si está, validar tipos
  const dbg = data.debug || {};
  if (dbg.quality_score != null) {
    if (typeof dbg.quality_score !== 'number' || dbg.quality_score < 0 || dbg.quality_score > 1) {
      errors.push(`[${basename}] debug.quality_score debe ser número 0..1.`);
    }
  }
  if (dbg.quality_reasons != null) {
    if (!Array.isArray(dbg.quality_reasons) || dbg.quality_reasons.some((r) => typeof r !== 'string')) {
      errors.push(`[${basename}] debug.quality_reasons debe ser array de strings.`);
    }
  }
  if (dbg.quality_signals != null) {
    if (typeof dbg.quality_signals !== 'object' || dbg.quality_signals === null) {
      errors.push(`[${basename}] debug.quality_signals debe ser objeto.`);
    }
  }
  // P0.3: risk_* opcional (PASIVO); si está, validar tipos
  if (dbg.risk_score != null) {
    if (typeof dbg.risk_score !== 'number' || dbg.risk_score < 0 || dbg.risk_score > 100) {
      errors.push(`[${basename}] debug.risk_score debe ser número 0..100.`);
    }
  }
  if (dbg.risk_level != null) {
    if (!['LOW', 'MEDIUM', 'HIGH'].includes(dbg.risk_level)) {
      errors.push(`[${basename}] debug.risk_level debe ser LOW, MEDIUM o HIGH.`);
    }
  }
  if (dbg.risk_reasons != null) {
    if (!Array.isArray(dbg.risk_reasons) || dbg.risk_reasons.some((r) => typeof r !== 'string')) {
      errors.push(`[${basename}] debug.risk_reasons debe ser array de strings.`);
    }
  }
  if (dbg.margin != null) {
    if (typeof dbg.margin !== 'number' || dbg.margin < 0 || dbg.margin > 1) {
      errors.push(`[${basename}] debug.margin debe ser número 0..1.`);
    }
  }

  return { ok: errors.length === 0, errors };
}

let allOk = true;
for (const fp of filePaths) {
  try {
    const content = fs.readFileSync(path.resolve(fp), 'utf8');
    const data = JSON.parse(content);
    const { ok, errors } = validateContract(data, fp);
    if (!ok) {
      allOk = false;
      console.error("❌ Errores en", fp);
      errors.forEach(e => console.error("  ", e));
    } else {
      console.log(`✅ ${path.basename(fp)} cumple el contrato ScanKey v2.`);
    }
  } catch (e) {
    allOk = false;
    console.error(`❌ Error leyendo/parseando ${fp}:`, e.message);
  }
}

process.exit(allOk ? 0 : 1);
