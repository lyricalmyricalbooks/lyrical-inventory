// Generates the final high-res icon suite with minimal padding so the logo fills the frame
const sharp = require('sharp');
const path = require('path');

const SOURCE = path.resolve('public/logo.png');

// Transparent icon: white lyre on transparent bg (for Android/browser)
async function makeIcon(size, outputPath, padFraction = 0.05) {
  const pad = Math.round(size * padFraction);
  const inner = size - pad * 2;
  await sharp(SOURCE)
    .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .extend({
      top: pad, bottom: pad, left: pad, right: pad,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .png({ compressionLevel: 9 })
    .toFile(outputPath);
  console.log(`✓ Transparent ${size}x${size}: ${outputPath}`);
}

// Opaque icon: white lyre on dark background (required for iOS apple-touch-icon)
async function makeAppleIcon(size, outputPath, padFraction = 0.08) {
  const pad = Math.round(size * padFraction);
  const inner = size - pad * 2;
  // App dark background color: #0e0c0a
  const bg = { r: 14, g: 12, b: 10, alpha: 1 };
  
  const lyreLayer = await sharp(SOURCE)
    .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();

  await sharp({ create: { width: size, height: size, channels: 4, background: bg } })
    .composite([{ input: lyreLayer, gravity: 'centre' }])
    .png({ compressionLevel: 9 })
    .toFile(outputPath);
  console.log(`✓ Apple icon ${size}x${size} (dark bg): ${outputPath}`);
}

async function run() {
  await makeIcon(512, 'public/pwa-512x512.png', 0.04);
  await makeIcon(512, 'public/maskable-icon-512x512.png', 0.10);
  await makeIcon(192, 'public/pwa-192x192.png', 0.04);
  await makeIcon(64,  'public/pwa-64x64.png', 0.03);
  // Apple touch icon MUST have opaque bg or it shows blank on iOS
  await makeAppleIcon(180, 'public/apple-touch-icon-180x180.png', 0.08);
  console.log('\nAll icons generated!');
}

run();

