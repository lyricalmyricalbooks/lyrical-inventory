const sharp = require('sharp');
const input = process.argv[2];
const output = process.argv[3];

// Target size in pixels for the output source image
const TARGET_SIZE = 1024;

async function run() {
  // First pass: upscale and trim any border padding
  const resized = await sharp(input)
    .resize(TARGET_SIZE, TARGET_SIZE, {
      fit: 'inside',
      kernel: sharp.kernel.lanczos3
    })
    .ensureAlpha()
    .toBuffer();

  // Second pass: extract transparency from black background
  const { data, info } = await sharp(resized)
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixelArray = new Uint8ClampedArray(data.buffer);
  
  for (let i = 0; i < pixelArray.length; i += info.channels) {
    const r = pixelArray[i];
    const g = pixelArray[i + 1];
    const b = pixelArray[i + 2];
    const maxVal = Math.max(r, g, b);
    
    // Convert to pure white with alpha derived from brightness (black = transparent)
    pixelArray[i] = 255;
    pixelArray[i + 1] = 255;
    pixelArray[i + 2] = 255;
    pixelArray[i + 3] = maxVal;
  }

  await sharp(Buffer.from(pixelArray), {
    raw: {
      width: info.width,
      height: info.height,
      channels: info.channels
    }
  }).png({ compressionLevel: 9 }).toFile(output);
  
  console.log(`Done! Output is ${info.width}x${info.height}: ${output}`);
}
run();

