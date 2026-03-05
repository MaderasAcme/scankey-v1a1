/**
 * Crea dist/deploy-ping.txt tras el build.
 * En CI el workflow lo sobrescribe con COMMIT real y DEPLOY_PING.
 * En local proporciona valores para preview (commit corto + timestamp).
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const distDir = path.join(__dirname, '..', 'dist');
const outPath = path.join(distDir, 'deploy-ping.txt');

if (!fs.existsSync(distDir)) {
  console.log('SKIP: dist/ no existe (ejecuta npm run build primero)');
  process.exit(0);
}

let commit = 'local';
try {
  commit = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
} catch (_) {}

const deployPing = new Date().toISOString().replace('T', ' ').replace(/\.[0-9]{3}Z$/, ' UTC');
const gateway = process.env.VITE_GATEWAY_BASE_URL || '';

const content = [
  `DEPLOY_PING=${deployPing}`,
  `COMMIT=${commit}`,
  gateway ? `GATEWAY=${gateway}` : '',
]
  .filter(Boolean)
  .join('\n');

fs.writeFileSync(outPath, content + '\n', 'utf8');
console.log('OK: deploy-ping.txt creado');
