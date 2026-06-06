import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Resvg } from '@resvg/resvg-js';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const desktopRoot = resolve(scriptDir, '..');
const sourceIconPath = resolve(desktopRoot, 'src-tauri/app-icon.svg');
const outputDir = resolve(desktopRoot, 'src-tauri/icons');

mkdirSync(outputDir, { recursive: true });

execFileSync('pnpm', ['exec', 'tauri', 'icon', 'src-tauri/app-icon.svg'], {
  cwd: desktopRoot,
  stdio: 'inherit',
});

const sourceSvg = readFileSync(sourceIconPath, 'utf8');
const trayGroupMatch = sourceSvg.match(/<g\b[\s\S]*?id="tray-mark"[\s\S]*?>[\s\S]*?<\/g>/);

if (!trayGroupMatch) {
  throw new Error('Could not find tray-mark group in src-tauri/app-icon.svg');
}

const traySvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  ${trayGroupMatch[0]}
</svg>
`;

for (const [size, fileName] of [
  [32, 'tray.png'],
  [64, 'tray@2x.png'],
]) {
  const renderer = new Resvg(traySvg, {
    fitTo: { mode: 'width', value: size },
  });
  const png = renderer.render().asPng();
  writeFileSync(resolve(outputDir, fileName), png);
}

console.log('Generated desktop icons from src-tauri/app-icon.svg.');