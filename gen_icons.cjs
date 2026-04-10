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
  
  // The lyre layer (white on transparent)
  const lyreLayer = await sharp(SOURCE)
    .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .ensureAlpha()
    .toBuffer();

  // Composite lyre onto a solid dark background, then FLATTEN to RGB (no alpha)
  // This is critical for iOS — alpha channel = blank circle on home screen
  await sharp({ create: { width: size, height: size, channels: 3, background: { r: 14, g: 12, b: 10 } } })
    .composite([{ input: lyreLayer, gravity: 'centre' }])
    .flatten({ background: { r: 14, g: 12, b: 10 } })
    .removeAlpha()
    .png({ compressionLevel: 9 })
    .toFile(outputPath);
  
  // Verify no alpha channel
  const meta = await sharp(outputPath).metadata();
  console.log(`✓ Apple icon ${size}x${size}: ${outputPath} | hasAlpha=${meta.hasAlpha} (must be false!)`);
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

