import sharp from 'sharp';
import { ApiError } from '../utils/api-error.js';
import env from '../config/env.js';

const SUPPORTED_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg']);
const MAX_IMAGE_PIXELS = 40_000_000;

function normalizeFields(fields = {}) {
  const normalized = {};

  for (const [key, value] of Object.entries(fields)) {
    if (Array.isArray(value)) {
      normalized[key] = value[0]?.value;
      continue;
    }

    normalized[key] = value?.value;
  }

  return normalized;
}

export async function readAndValidateUpload(request) {
  const filePart = await request.file();

  if (!filePart) {
    throw new ApiError(400, 'No se recibió archivo en multipart/form-data.', 'FILE_REQUIRED');
  }

  if (!SUPPORTED_TYPES.has(filePart.mimetype)) {
    throw new ApiError(415, 'Formato no soportado. Usa PNG o JPG.', 'UNSUPPORTED_MEDIA_TYPE', {
      received: filePart.mimetype
    });
  }

  let size = 0;
  const chunks = [];

  for await (const chunk of filePart.file) {
    size += chunk.length;

    if (size > env.MAX_FILE_SIZE_BYTES) {
      throw new ApiError(413, `El archivo excede ${env.MAX_FILE_SIZE_MB}MB.`, 'FILE_TOO_LARGE');
    }

    chunks.push(chunk);
  }

  if (filePart.file.truncated) {
    throw new ApiError(413, `El archivo excede ${env.MAX_FILE_SIZE_MB}MB.`, 'FILE_TRUNCATED');
  }

  const buffer = Buffer.concat(chunks);

  if (!buffer.length) {
    throw new ApiError(400, 'El archivo está vacío.', 'EMPTY_FILE');
  }

  let metadata;
  try {
    metadata = await sharp(buffer, { failOn: 'error' }).metadata();
  } catch {
    throw new ApiError(400, 'Archivo corrupto o imagen inválida.', 'CORRUPTED_IMAGE');
  }

  const pixels = (metadata.width || 0) * (metadata.height || 0);
  if (!metadata.width || !metadata.height || pixels <= 0 || pixels > MAX_IMAGE_PIXELS) {
    throw new ApiError(400, 'Dimensiones de imagen inválidas o demasiado grandes.', 'INVALID_DIMENSIONS');
  }

  return {
    filename: filePart.filename,
    mimetype: filePart.mimetype,
    size,
    metadata,
    buffer,
    fields: normalizeFields(filePart.fields)
  };
}
