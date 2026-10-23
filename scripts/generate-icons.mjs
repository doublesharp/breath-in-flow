import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Rendering tools are only needed when changing the logo, not for app builds.
const root = fileURLToPath(new URL('../', import.meta.url));
const web = join(root, 'packages/web');
const background = '#201e1a';
const logo = readFileSync(join(web, 'assets/logo.svg'), 'utf8');
const mark = logo
  .replace(/^[\s\S]*?<svg[^>]*>/, '')
  .replace(/<\/svg>\s*$/, '')
  .trim();
const svg = (content, width = 64, height = width) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">${content}</svg>\n`;
const backdrop = (width, height, radius = 0) =>
  `<rect width="${width}" height="${height}" rx="${radius}" fill="${background}"/>`;
const centeredMark = (width, height, size) =>
  `<g transform="translate(${(width - size) / 2} ${(height - size) / 2}) scale(${size / 64})">${mark}</g>`;
const icon = svg(backdrop(64, 64) + centeredMark(64, 64, 56));
const roundedIcon = svg(backdrop(64, 64, 14) + centeredMark(64, 64, 56));
const foreground = svg(centeredMark(64, 64, 51.2));

function write(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, data);
}

function png(source, width, height = width) {
  return execFileSync('rsvg-convert', ['--width', String(width), '--height', String(height)], {
    input: source,
    maxBuffer: 16 * 1024 * 1024,
  });
}

// Fail before writing anything if the optional SVG renderer is missing.
execFileSync('rsvg-convert', ['--version']);

write(join(web, 'assets/icon.svg'), roundedIcon);
write(join(web, 'public/favicon.svg'), roundedIcon);
for (const size of [48, 72, 96, 128, 192, 256, 512]) {
  write(join(web, `public/icons/icon-${size}.png`), png(icon, size));
}
write(join(web, 'public/icons/apple-touch-icon.png'), png(icon, 180));
write(join(web, 'build/icon.png'), png(roundedIcon, 1024));
for (const size of [16, 32, 48, 64, 128, 256, 512]) {
  write(join(web, `build/icons/${size}x${size}.png`), png(roundedIcon, size));
}

// ICO supports PNG frames, keeping a crisp image at each Windows icon size.
const sizes = [16, 24, 32, 48, 64, 128, 256];
const frames = sizes.map((size) => png(roundedIcon, size));
const header = Buffer.alloc(6 + 16 * frames.length);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(frames.length, 4);
let offset = header.length;
frames.forEach((frame, index) => {
  const entry = 6 + 16 * index;
  header[entry] = sizes[index] % 256;
  header[entry + 1] = sizes[index] % 256;
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(frame.length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += frame.length;
});
write(join(web, 'build/icon.ico'), Buffer.concat([header, ...frames]));

const res = join(web, 'android/app/src/main/res');
for (const [density, factor] of Object.entries({
  ldpi: 0.75,
  mdpi: 1,
  hdpi: 1.5,
  xhdpi: 2,
  xxhdpi: 3,
  xxxhdpi: 4,
})) {
  const directory = join(res, `mipmap-${density}`);
  write(join(directory, 'ic_launcher.png'), png(roundedIcon, 48 * factor));
  write(
    join(directory, 'ic_launcher_round.png'),
    png(svg(backdrop(64, 64, 32) + centeredMark(64, 64, 56)), 48 * factor)
  );
  write(join(directory, 'ic_launcher_foreground.png'), png(foreground, 108 * factor));
  write(join(directory, 'ic_launcher_background.png'), png(svg(backdrop(64, 64)), 108 * factor));
}

// Preserve existing launch-screen sizes and use the same centered mark in every orientation.
for (const entry of readdirSync(res, { withFileTypes: true })) {
  if (!entry.isDirectory() || !entry.name.startsWith('drawable')) continue;
  const path = join(res, entry.name, 'splash.png');
  if (!readdirSync(join(res, entry.name)).includes('splash.png')) continue;
  if (entry.name === 'drawable') {
    write(path, png(svg(centeredMark(64, 64, 48)), 432));
  } else {
    const original = readFileSync(path);
    const width = original.readUInt32BE(16);
    const height = original.readUInt32BE(20);
    write(
      path,
      png(
        svg(
          backdrop(width, height) + centeredMark(width, height, Math.min(width, height) * 0.3),
          width,
          height
        ),
        width,
        height
      )
    );
  }
}

const iosAssets = join(web, 'ios/App/App/Assets.xcassets');
write(join(iosAssets, 'AppIcon.appiconset/AppIcon-512@2x.png'), png(icon, 1024));
const splashDirectory = join(iosAssets, 'Splash.imageset');
for (const name of readdirSync(splashDirectory).filter((name) => name.endsWith('.png'))) {
  const path = join(splashDirectory, name);
  const original = readFileSync(path);
  const width = original.readUInt32BE(16);
  const height = original.readUInt32BE(20);
  write(
    path,
    png(
      svg(
        backdrop(width, height) + centeredMark(width, height, Math.min(width, height) * 0.24),
        width,
        height
      ),
      width,
      height
    )
  );
}

console.log('Generated web, desktop, Android, and iOS branding from packages/web/assets/logo.svg');
