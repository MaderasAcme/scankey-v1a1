
/**
 * Lead Engineer - ScanKey Contract Validator
 * Valida que el JSON de respuesta cumpla estrictamente con el motor de la app.
 * Uso: node scripts/contract_check.js <ruta_al_json>
 */

const fs = require('fs');
const path = require('path');

const filePath = process.argv[2];

if (!filePath) {
  console.error("❌ Error: Proporciona una ruta a un archivo JSON.");
  process.exit(1);
}

try {
  const data = JSON.parse(fs.readFileSync(path.resolve(filePath), 'utf8'));
  const errors = [];

  // 1. Verificación de campos raíz obligatorios
  const requiredRoot = ['input_id', 'timestamp', 'results', 'high_confidence', 'low_confidence', 'manufacturer_hint'];
  requiredRoot.forEach(key => {
    if (!(key in data)) errors.push(`Campo raíz faltante: ${key}`);
  });

  if (errors.length > 0) {
    console.error("❌ Fallo Crítico de Estructura:\n", errors.join('\n'));
    process.exit(1);
  }

  // 2. Validación de Results (Exactamente 3)
  if (!Array.isArray(data.results) || data.results.length !== 3) {
    errors.push(`Contrato violado: 'results' debe tener exactamente 3 elementos. Encontrados: ${data.results?.length || 0}`);
  }

  // 3. Validación de Orden y Confianza
  let lastConf = 1.1;
  data.results.forEach((res, i) => {
    if (typeof res.confidence !== 'number' || res.confidence < 0 || res.confidence > 1) {
      errors.push(`Resultado ${i}: Confianza fuera de rango [0,1]: ${res.confidence}`);
    }
    if (res.confidence > lastConf) {
      errors.push(`Resultado ${i}: Mal ordenado. Confianza (${res.confidence}) mayor que el anterior (${lastConf})`);
    }
    lastConf = res.confidence;

    if (!Array.isArray(res.compatibility_tags)) {
      errors.push(`Resultado ${i}: 'compatibility_tags' debe ser un array.`);
    }

    if (res.crop_bbox) {
      ['x', 'y', 'w', 'h'].forEach(dim => {
        if (typeof res.crop_bbox[dim] !== 'number') {
          errors.push(`Resultado ${i}: crop_bbox.${dim} debe ser numérico.`);
        }
      });
    }
  });

  // 4. Validación de Flags de Confianza
  const top = data.results[0].confidence;
  const expectedHigh = top >= 0.95;
  const expectedLow = top < 0.60;

  if (data.high_confidence !== expectedHigh) {
    errors.push(`Flag 'high_confidence' inconsistente. Esperado: ${expectedHigh}, Encontrado: ${data.high_confidence}`);
  }
  if (data.low_confidence !== expectedLow) {
    errors.push(`Flag 'low_confidence' inconsistente. Esperado: ${expectedLow}, Encontrado: ${data.low_confidence}`);
  }

  // 5. Validación de Manufacturer Hint
  const hint = data.manufacturer_hint;
  if (typeof hint.found !== 'boolean') errors.push("manufacturer_hint.found debe ser boolean.");
  if (typeof hint.confidence !== 'number') errors.push("manufacturer_hint.confidence debe ser numérico.");

  if (errors.length > 0) {
    console.error("❌ Errores de Contrato Encontrados:");
    console.error(errors.join('\n'));
    process.exit(1);
  }

  console.log(`✅ El archivo '${path.basename(filePath)}' cumple el contrato ScanKey v2.`);
  process.exit(0);

} catch (e) {
  console.error("❌ Error leyendo o parseando el JSON:", e.message);
  process.exit(1);
}
