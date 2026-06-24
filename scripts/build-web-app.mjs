import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function readWebAppPathFromWrangler() {
  const tomlPath = path.join(root, 'wrangler.toml');
  if (!fs.existsSync(tomlPath)) return null;
  const toml = fs.readFileSync(tomlPath, 'utf8');
  const match = toml.match(/^WEB_APP_PATH\s*=\s*"([^"]+)"/m);
  return match?.[1] ?? null;
}

function normalizeWebAppPath(raw) {
  const fallback = '/app';
  const trimmed = String(raw ?? fallback).trim() || fallback;
  const withSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return withSlash.replace(/\/$/, '') || fallback;
}

const webAppPath = normalizeWebAppPath(process.env.WEB_APP_PATH ?? readWebAppPathFromWrangler());
const base = `${webAppPath}/`;

console.log(`Building web control UI with base: ${base}`);

execSync(`npm run build -w @clouddesk/web -- --base ${base}`, {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, CLOUDDESK_WEB_APP_PATH: webAppPath },
});

const indexPath = path.join(root, 'apps/web/dist/index.html');
if (fs.existsSync(indexPath)) {
  let html = fs.readFileSync(indexPath, 'utf8');
  const inject = [
    `    <base href="${base}" />`,
    `    <script>window.__CLOUDDESK_WEB_BASENAME__="${webAppPath}"</script>`,
  ].join('\n');
  if (!html.includes('__CLOUDDESK_WEB_BASENAME__')) {
    html = html.replace(/(<meta name="viewport"[^>]*>)/, `$1\n${inject}`);
    fs.writeFileSync(indexPath, html);
    console.log(`Injected web app basename ${webAppPath} into index.html`);
  }
}
