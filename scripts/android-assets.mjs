#!/usr/bin/env node
// Builds the pictures the Google Play listing and the Android app need, from
// public/logo.png (white lyre and wordmark on transparent).
//
//   npm run android:assets
//
// Writes:
//   public/maskable-icon-512x512.png  launcher icon Android crops to a circle,
//                                     squircle or teardrop. The logo sits
//                                     inside the centre 80% "safe zone"; the
//                                     old one ran to the edges, so the circle
//                                     mask cut off the L and the lyre's scroll.
//   public/android-icon-512x512.png   opaque square icon: the Android app's
//                                     launcher icon on older phones, and the
//                                     512x512 "App icon" the Play listing asks
//                                     for. The existing pwa-512x512.png is
//                                     white on transparent, which vanishes on
//                                     a light home screen and is refused by
//                                     Play (the store icon must be opaque).
//   android/store/feature-graphic-1024x500.png
//                                     the banner across the top of the listing.
//
// Dev-only: needs sharp and playwright-core (devDependencies). The feature
// graphic also needs a local Chromium and network access to Google Fonts.
import sharp from 'sharp';
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOGO = path.join(ROOT, 'public/logo.png');
// --ink in src/style.css, and the manifest's theme_color.
const INK = '#100F0D';

// The logo scaled to fit a box `fraction` of `size` wide, centred on ink.
async function iconOnInk(size, fraction, out) {
  const inner = Math.round(size * fraction);
  const logo = await sharp(LOGO)
    .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();
  await sharp({ create: { width: size, height: size, channels: 3, background: INK } })
    .composite([{ input: logo, gravity: 'centre' }])
    .png({ compressionLevel: 9 })
    .toFile(out);
  console.log(`✓ ${path.relative(ROOT, out)}`);
}

// Maskable: the safe zone is a circle of radius 40% of the icon. The logo is
// wider than it is tall, so its corners are what the mask reaches first; 0.56
// keeps the farthest corner inside the circle with a little room.
await iconOnInk(512, 0.56, path.join(ROOT, 'public/maskable-icon-512x512.png'));
// Play rounds the corners of the store icon itself (about 20% radius), so this
// only needs to clear those corners, not a full circle.
await iconOnInk(512, 0.74, path.join(ROOT, 'public/android-icon-512x512.png'));

const chromePath = process.env.CHROME_PATH
  || ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome']
    .find(p => fs.existsSync(p));
if (!chromePath) throw new Error('android-assets: no Chromium found; set CHROME_PATH');

const logoData = `data:image/png;base64,${fs.readFileSync(LOGO).toString('base64')}`;
// Riso Press: ink ground, cream type, one flare-red block with a hard offset.
const html = `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Anton&family=Archivo:wght@500&family=DM+Mono:wght@500&display=block" rel="stylesheet">
<style>
  html,body{margin:0;width:1024px;height:500px;background:${INK};overflow:hidden}
  .wrap{display:flex;align-items:center;gap:56px;height:100%;padding:0 72px;box-sizing:border-box}
  img{width:300px;height:auto;flex:none}
  .kicker{font:500 20px 'DM Mono',monospace;letter-spacing:.14em;color:#E4DAC5;text-transform:uppercase}
  h1{font:400 112px/1 'Anton',Impact,sans-serif;color:#FAF6EC;margin:10px 0 18px;text-transform:uppercase;letter-spacing:.01em}
  .tag{display:inline-block;font:500 24px 'Archivo',sans-serif;color:${INK};background:#E8402A;
       padding:10px 16px;border:2px solid #FAF6EC;box-shadow:6px 6px 0 #FAF6EC}
</style></head><body><div class="wrap">
  <img src="${logoData}" alt="">
  <div><div class="kicker">Lyricalmyrical Books</div><h1>Inventory</h1>
  <div class="tag">Stock, sales and shipping, even offline</div></div>
</div></body></html>`;

const browser = await chromium.launch({ executablePath: chromePath });
try {
  const page = await browser.newPage({ viewport: { width: 1024, height: 500 } });
  await page.setContent(html, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  const out = path.join(ROOT, 'android/store/feature-graphic-1024x500.png');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  // Play wants a JPEG or 24-bit PNG with no transparency.
  await sharp(await page.screenshot({ type: 'png' })).flatten({ background: INK }).png().toFile(out);
  console.log(`✓ ${path.relative(ROOT, out)}`);
} finally {
  await browser.close();
}
