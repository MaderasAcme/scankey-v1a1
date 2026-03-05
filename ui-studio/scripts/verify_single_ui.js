#!/usr/bin/env node
/**
 * verify_single_ui.js — Guardrails para que solo ui-studio sea la UI web oficial.
 * Falla si:
 * - Existe dist/ en raíz del repo
 * - deploy-pages.yml intenta publicar path distinto de ui-studio/dist
 * - Falta ui-studio/public/ui-source.txt
 */
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '../..');
const uiStudio = path.join(repoRoot, 'ui-studio');
const deployPages = path.join(repoRoot, '.github', 'workflows', 'deploy-pages.yml');
const uiSourceTxt = path.join(uiStudio, 'public', 'ui-source.txt');

let failed = false;

function fail(msg) {
  console.error('❌', msg);
  failed = true;
}

function ok(msg) {
  console.log('✅', msg);
}

// 1. NO dist/ en raíz
const rootDist = path.join(repoRoot, 'dist');
if (fs.existsSync(rootDist) && fs.statSync(rootDist).isDirectory()) {
  fail('dist/ en raíz del repo existe. Solo ui-studio/dist debe usarse.');
} else {
  ok('No hay dist/ en raíz.');
}

// 2. deploy-pages.yml debe publicar SOLO ui-studio/dist
if (fs.existsSync(deployPages)) {
  const content = fs.readFileSync(deployPages, 'utf8');
  if (!content.includes('path: ui-studio/dist')) {
    fail('deploy-pages.yml debe contener path: ui-studio/dist');
  } else if (content.includes('path: .') || content.includes('path: "./') || content.includes('path: dist')) {
    fail('deploy-pages.yml no debe publicar path "." ni "./dist" (raíz)');
  } else {
    ok('deploy-pages.yml publica ui-studio/dist.');
  }
} else {
  fail('No se encontró .github/workflows/deploy-pages.yml');
}

// 3. ui-studio/public/ui-source.txt debe existir
if (!fs.existsSync(uiSourceTxt)) {
  fail('Falta ui-studio/public/ui-source.txt (Vite lo copia a dist/)');
} else {
  const txt = fs.readFileSync(uiSourceTxt, 'utf8');
  if (!txt.includes('UI_SOURCE=ui-studio')) {
    fail('ui-source.txt debe contener UI_SOURCE=ui-studio');
  } else {
    ok('ui-source.txt presente y correcto.');
  }
}

if (failed) {
  process.exit(1);
}
console.log('\n✅ verify_single_ui: OK (solo ui-studio como UI oficial)');
process.exit(0);
