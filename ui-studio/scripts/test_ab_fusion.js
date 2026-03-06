/**
 * Test de fusión A/B: consenso y conflicto
 * Ejecutar: node scripts/test_ab_fusion.js
 */
const fs = require('fs');
const path = require('path');

const consensusPath = path.join(__dirname, 'sample_responses/ab_consensus.json');
const conflictPath = path.join(__dirname, 'sample_responses/ab_conflict.json');

let ok = true;

// 1. Consensus: debe tener "Consenso A/B" en explain_text
const consensus = JSON.parse(fs.readFileSync(consensusPath, 'utf8'));
const top1Explain = (consensus.results[0]?.explain_text || '');
if (!top1Explain.includes('Consenso A/B')) {
  console.error('❌ ab_consensus: explain_text debe contener "Consenso A/B"');
  ok = false;
} else {
  console.log('✅ ab_consensus: Consenso A/B en explain_text');
}
if (consensus.results.length !== 3) {
  console.error('❌ ab_consensus: debe tener 3 results');
  ok = false;
} else {
  console.log('✅ ab_consensus: 3 results');
}

// 2. Conflict: debe tener "Discrepancia A/B" en explain_text
const conflict = JSON.parse(fs.readFileSync(conflictPath, 'utf8'));
const conflictExplain = (conflict.results[0]?.explain_text || '');
if (!conflictExplain.includes('Discrepancia A/B')) {
  console.error('❌ ab_conflict: explain_text debe contener "Discrepancia A/B"');
  ok = false;
} else {
  console.log('✅ ab_conflict: Discrepancia A/B en explain_text');
}
if (conflict.results.length !== 3) {
  console.error('❌ ab_conflict: debe tener 3 results');
  ok = false;
} else {
  console.log('✅ ab_conflict: 3 results');
}

process.exit(ok ? 0 : 1);
