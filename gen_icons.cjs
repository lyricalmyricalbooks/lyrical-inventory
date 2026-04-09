// Generates the final high-res icon suite with minimal padding so the logo fills the frame
const sharp = require('sharp');
const path = require('path');

const SOURCE = path.resolve('public/logo.png');

async function makeIcon(size, outputPath, padFraction = 0.05) {
  const pad = Math.round(size * padFraction);
  const inner = size - pad * 2;

  // Place the logo on a transparent background, centered, with minimal padding
  await sharp(SOURCE)
    .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .extend({
      top: pad, bottom: pad, left: pad, right: pad,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .png({ compressionLevel: 9 })
    .toFile(outputPath);
  
  console.log(`✓ Generated ${size}x${size}: ${outputPath}`);
}

async function run() {
  await makeIcon(512, 'public/pwa-512x512.png', 0.04);
  await makeIcon(512, 'public/maskable-icon-512x512.png', 0.10); // maskable needs 10% safe-zone
  await makeIcon(192, 'public/pwa-192x192.png', 0.04);
  await makeIcon(180, 'public/apple-touch-icon-180x180.png', 0.04);
  await makeIcon(64,  'public/pwa-64x64.png', 0.03);
  console.log('\nAll icons generated!');
}

run();
