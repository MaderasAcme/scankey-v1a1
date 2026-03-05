#!/usr/bin/env node
/**
 * QA anti-TS: Falla si encuentra archivos .ts/.tsx en el repo (excluyendo node_modules).
 * Regla: NO TypeScript en ui-studio.
 * Cross-platform (Windows/Linux/Mac).
 */

const { execSync } = require('child_process');
const path = require('path');

const uiRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(uiRoot, '..');

let out;
try {
  out = execSync('git ls-files', { cwd: repoRoot, encoding: 'utf8' });
} catch (e) {
  console.error('❌ No se pudo ejecutar git ls-files');
  process.exit(1);
}

const lines = out.trim().split(/\r?\n/);
const tsFiles = lines.filter(f => /\.(ts|tsx)$/.test(f));

if (tsFiles.length > 0) {
  console.error('❌ ERROR: Se encontraron archivos TypeScript:');
  tsFiles.forEach(f => console.error('  ', f));
  process.exit(1);
}

console.log('✅ No hay archivos .ts/.tsx en el repositorio.');
process.exit(0);
