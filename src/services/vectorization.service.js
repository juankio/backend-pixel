import sharp from 'sharp';
import potrace from 'potrace';
import { ApiError } from '../utils/api-error.js';
import { clamp } from '../utils/number.util.js';
import { writeTempImage, cleanupTempFile } from './temp-file.service.js';

function tracePotrace(input, options) {
  return new Promise((resolve, reject) => {
    potrace.trace(input, options, (error, svg) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(svg);
    });
  });
}

async function traceWithFallback(inputBuffer, traceOptions) {
  try {
    return await tracePotrace(inputBuffer, traceOptions);
  } catch {
    let tempFile;
    try {
      tempFile = await writeTempImage(inputBuffer);
      return await tracePotrace(tempFile, traceOptions);
    } finally {
      await cleanupTempFile(tempFile);
    }
  }
}

function normalizeTraceOptions(options) {
  return {
    threshold: clamp(options.threshold, 0, 255),
    turdSize: Math.max(0, options.turdSize),
    optCurve: Boolean(options.optCurve),
    optTolerance: clamp(options.optTolerance, 0.01, 1),
    background: 'transparent',
    color: '#000000',
    blackOnWhite: true
  };
}

function extractPathTags(svg = '') {
  const matches = svg.match(/<path\b[^>]*?(?:\/>|><\/path>)/gi);
  return matches || [];
}

function toHexColor({ r, g, b }) {
  const toHex = (value) => value.toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function recolorPath(pathTag, hexColor) {
  const stripped = pathTag
    .replace(/\sfill="[^"]*"/gi, '')
    .replace(/\sfill-opacity="[^"]*"/gi, '')
    .replace(/\sstroke="[^"]*"/gi, '');

  return stripped.replace(/^<path\b/i, `<path fill="${hexColor}" stroke="none"`);
}

function luminance(color) {
  return (0.2126 * color.r) + (0.7152 * color.g) + (0.0722 * color.b);
}

function orderColors(colors, fillStrategy) {
  const strategy = String(fillStrategy || 'dominant').toLowerCase();

  if (strategy === 'mean') {
    return [...colors].sort((a, b) => luminance(a) - luminance(b));
  }

  if (strategy === 'median') {
    return [...colors].sort((a, b) => luminance(b) - luminance(a));
  }

  if (strategy === 'spread') {
    const byLuminance = [...colors].sort((a, b) => luminance(a) - luminance(b));
    const spread = [];
    let left = 0;
    let right = byLuminance.length - 1;

    while (left <= right) {
      spread.push(byLuminance[right]);
      right -= 1;

      if (left <= right) {
        spread.push(byLuminance[left]);
        left += 1;
      }
    }

    return spread;
  }

  return [...colors].sort((a, b) => b.count - a.count);
}

function isLikelyBackground(color, totalPixels) {
  const nearWhite = color.r > 245 && color.g > 245 && color.b > 245;
  const coverage = color.count / totalPixels;
  return nearWhite && coverage > 0.45;
}

function collectPaletteColors(data, channels) {
  const colors = new Map();

  for (let i = 0; i < data.length; i += channels) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const alpha = channels === 4 ? data[i + 3] : 255;

    if (alpha < 16) {
      continue;
    }

    const key = `${r},${g},${b}`;
    const current = colors.get(key);

    if (current) {
      current.count += 1;
    } else {
      colors.set(key, { r, g, b, count: 1 });
    }
  }

  return [...colors.values()];
}

function buildColorBinaryMask({ data, channels, targetColor }) {
  const mask = new Uint8Array(data.length / channels);

  for (let i = 0, pixel = 0; i < data.length; i += channels, pixel += 1) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const alpha = channels === 4 ? data[i + 3] : 255;

    const match = alpha >= 16 && r === targetColor.r && g === targetColor.g && b === targetColor.b;
    mask[pixel] = match ? 1 : 0;
  }

  return mask;
}

function buildMonochromeBinaryMask({ data, channels }) {
  const mask = new Uint8Array(data.length / channels);

  for (let i = 0, pixel = 0; i < data.length; i += channels, pixel += 1) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const alpha = channels === 4 ? data[i + 3] : 255;
    const luminance = (r + g + b) / 3;

    mask[pixel] = (alpha >= 16 && luminance < 128) ? 1 : 0;
  }

  return mask;
}

function findConnectedComponents(binaryMask, width, height, minPixels, maxComponents) {
  const visited = new Uint8Array(binaryMask.length);
  const components = [];
  const stack = [];

  for (let index = 0; index < binaryMask.length; index += 1) {
    if (!binaryMask[index] || visited[index]) {
      continue;
    }

    const pixels = [];
    stack.push(index);
    visited[index] = 1;

    while (stack.length) {
      const current = stack.pop();
      pixels.push(current);

      const x = current % width;
      const y = Math.floor(current / width);

      const neighbors = [];
      if (x > 0) neighbors.push(current - 1);
      if (x < width - 1) neighbors.push(current + 1);
      if (y > 0) neighbors.push(current - width);
      if (y < height - 1) neighbors.push(current + width);

      for (const neighbor of neighbors) {
        if (!visited[neighbor] && binaryMask[neighbor]) {
          visited[neighbor] = 1;
          stack.push(neighbor);
        }
      }
    }

    if (pixels.length >= minPixels) {
      components.push(pixels);
    }
  }

  components.sort((a, b) => b.length - a.length);
  return components.slice(0, maxComponents);
}

function buildComponentMaskBuffer({ width, height, componentPixels }) {
  const mask = Buffer.alloc(width * height);
  mask.fill(255);

  for (const pixel of componentPixels) {
    mask[pixel] = 0;
  }

  return sharp(mask, {
    raw: { width, height, channels: 1 }
  })
    .png({ compressionLevel: 1 })
    .toBuffer();
}

async function traceComponents({
  binaryMask,
  width,
  height,
  fillColor,
  traceOptions,
  minComponentPixels,
  maxComponents
}) {
  const components = findConnectedComponents(
    binaryMask,
    width,
    height,
    minComponentPixels,
    maxComponents
  );

  const pathTags = [];

  for (const componentPixels of components) {
    const componentMaskBuffer = await buildComponentMaskBuffer({
      width,
      height,
      componentPixels
    });

    const tracedLayer = await traceWithFallback(componentMaskBuffer, {
      ...traceOptions,
      threshold: 128,
      blackOnWhite: true
    });

    const tracedPaths = extractPathTags(tracedLayer).map((tag) => recolorPath(tag, fillColor));
    if (tracedPaths.length) {
      pathTags.push(...tracedPaths);
    }
  }

  return pathTags;
}

async function vectorizeMonochrome(inputBuffer, options) {
  const traceOptions = normalizeTraceOptions(options);
  const { data, info } = await sharp(inputBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const binaryMask = buildMonochromeBinaryMask({
    data,
    channels: info.channels
  });

  const pathTags = await traceComponents({
    binaryMask,
    width: info.width,
    height: info.height,
    fillColor: '#000000',
    traceOptions,
    minComponentPixels: Math.max(50, options.turdSize * 10),
    maxComponents: 16
  });

  if (!pathTags.length) {
    return traceWithFallback(inputBuffer, traceOptions);
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${info.width}" height="${info.height}" viewBox="0 0 ${info.width} ${info.height}">${pathTags.join('')}</svg>`;
}

async function vectorizePalette(inputBuffer, options) {
  const { data, info } = await sharp(inputBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const totalPixels = info.width * info.height;
  const paletteSize = Math.max(2, Math.min(8, options.paletteSize || 4));

  let colors = collectPaletteColors(data, info.channels)
    .filter((color) => color.count >= Math.max(8, Math.floor(totalPixels * 0.001)));

  colors = colors.sort((a, b) => b.count - a.count);

  if (colors.length > 1 && isLikelyBackground(colors[0], totalPixels)) {
    colors = colors.slice(1);
  }

  const selectedColors = orderColors(colors.slice(0, paletteSize), options.fillStrategy);

  if (!selectedColors.length) {
    return vectorizeMonochrome(inputBuffer, options);
  }

  const pathLayers = [];

  for (const color of selectedColors) {
    const binaryMask = buildColorBinaryMask({
      data,
      channels: info.channels,
      targetColor: color
    });

    const tracedPaths = await traceComponents({
      binaryMask,
      width: info.width,
      height: info.height,
      fillColor: toHexColor(color),
      traceOptions: normalizeTraceOptions(options),
      minComponentPixels: Math.max(50, options.turdSize * 10),
      maxComponents: 12
    });

    if (tracedPaths.length) {
      pathLayers.push(...tracedPaths);
    }
  }

  if (!pathLayers.length) {
    return vectorizeMonochrome(inputBuffer, options);
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${info.width}" height="${info.height}" viewBox="0 0 ${info.width} ${info.height}">${pathLayers.join('')}</svg>`;
}

export async function vectorizeWithPotrace(inputBuffer, options) {
  try {
    const colorMode = String(options.colorMode || 'monochrome').toLowerCase();

    if (colorMode === 'palette') {
      return await vectorizePalette(inputBuffer, options);
    }

    return await vectorizeMonochrome(inputBuffer, options);
  } catch (error) {
    throw new ApiError(422, 'No fue posible vectorizar la imagen.', 'VECTORIZATION_FAILED', {
      message: error.message
    });
  }
}
