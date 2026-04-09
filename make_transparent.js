const sharp = require('sharp');
const input = process.argv[2];
const output = process.argv[3];

async function run() {
  const { data, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixelArray = new Uint8ClampedArray(data.buffer);
  
  for (let i = 0; i < pixelArray.length; i += info.channels) {
    const r = pixelArray[i];
    const g = pixelArray[i + 1];
    const b = pixelArray[i + 2];
    const maxVal = Math.max(r, g, b);
    
    // Convert to pure white symbol with proper anti-aliased transparency
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
  }).png().toFile(output);
  console.log('Successfully made transparent:', output);
}
run();
