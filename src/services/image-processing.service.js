import sharp from 'sharp';
import { ApiError } from '../utils/api-error.js';
import { clamp } from '../utils/number.util.js';

const SCALE_OPTIONS = new Set([2, 4]);
const MODE_OPTIONS = new Set(['fast', 'quality']);
const COLOR_MODE_OPTIONS = new Set(['monochrome', 'palette']);

export function normalizeColorMode(value) {
  const normalized = String(value || 'monochrome').trim().toLowerCase();
  if (normalized === 'mono') return 'monochrome';
  return normalized;
}

export function validateScale(value) {
  if (!SCALE_OPTIONS.has(value)) {
    throw new ApiError(400, 'scale debe ser 2 o 4.', 'INVALID_SCALE');
  }
}

export function validateMode(value) {
  if (!MODE_OPTIONS.has(value)) {
    throw new ApiError(400, 'mode debe ser "fast" o "quality".', 'INVALID_MODE');
  }
}

export function validateColorMode(value) {
  if (!COLOR_MODE_OPTIONS.has(value)) {
    throw new ApiError(400, 'colorMode debe ser "monochrome" o "palette".', 'INVALID_COLOR_MODE');
  }
}

export function validatePaletteSize(value) {
  if (!Number.isInteger(value) || value < 2 || value > 8) {
    throw new ApiError(400, 'paletteSize debe ser un entero entre 2 y 8.', 'INVALID_PALETTE_SIZE');
  }
}

export async function upscaleImage(inputBuffer, { scale, mode }) {
  validateScale(scale);
  validateMode(mode);

  const metadata = await sharp(inputBuffer).metadata();

  if (!metadata.width || !metadata.height) {
    throw new ApiError(400, 'No se pudieron leer dimensiones de la imagen.', 'MISSING_DIMENSIONS');
  }

  const width = Math.round(metadata.width * scale);
  const height = Math.round(metadata.height * scale);

  const image = sharp(inputBuffer, { failOn: 'error' }).resize({
    width,
    height,
    kernel: sharp.kernel.lanczos3,
    fit: 'fill',
    withoutEnlargement: false
  });

  if (mode === 'quality') {
    image.sharpen({ sigma: 1.2, m1: 1.2, m2: 0.6, x1: 2, y2: 10, y3: 20 });
  }

  return image.png({
    compressionLevel: mode === 'quality' ? 9 : 6,
    adaptiveFiltering: true,
    palette: false
  }).toBuffer();
}

function buildMonochromePreprocess(inputBuffer, { threshold, mode }) {
  validateMode(mode);

  const safeThreshold = clamp(threshold, 0, 255);
  const contrastFactor = mode === 'quality' ? 1.35 : 1.18;
  const contrastOffset = -(128 * contrastFactor) + 128;

  const image = sharp(inputBuffer, { failOn: 'error' })
    .grayscale()
    .linear(contrastFactor, contrastOffset)
    .normalise();

  if (mode === 'quality') {
    image.median(1).sharpen({ sigma: 0.9, m1: 1.1, m2: 0.7, x1: 2, y2: 8, y3: 16 });
  }

  return image
    .threshold(safeThreshold, { grayscale: true })
    .png({ compressionLevel: 9, palette: true, quality: 100 });
}

function buildPalettePreprocess(inputBuffer, { mode, paletteSize }) {
  validateMode(mode);
  validatePaletteSize(paletteSize);
  const quantizedColors = clamp(paletteSize + 1, 3, 12);

  const image = sharp(inputBuffer, { failOn: 'error' })
    .normalise()
    .modulate({
      brightness: mode === 'quality' ? 1.03 : 1,
      saturation: mode === 'quality' ? 1.05 : 1
    });

  if (mode === 'quality') {
    image.median(1).sharpen({ sigma: 0.8, m1: 1.05, m2: 0.6, x1: 2, y2: 8, y3: 16 });
  }

  return image.png({
    compressionLevel: 9,
    adaptiveFiltering: true,
    palette: true,
    colors: quantizedColors,
    dither: 0
  });
}

export async function preprocessImage(inputBuffer, {
  threshold,
  mode,
  colorMode = 'monochrome',
  paletteSize = 4
}) {
  const normalizedColorMode = normalizeColorMode(colorMode);
  validateColorMode(normalizedColorMode);

  if (normalizedColorMode === 'palette') {
    return buildPalettePreprocess(inputBuffer, { mode, paletteSize }).toBuffer();
  }

  return buildMonochromePreprocess(inputBuffer, { threshold, mode }).toBuffer();
}
