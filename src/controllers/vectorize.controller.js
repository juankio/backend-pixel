import env from '../config/env.js';
import { ApiError } from '../utils/api-error.js';
import {
  parseOptionalBooleanField,
  parseOptionalFloatField,
  parseOptionalIntField
} from '../utils/number.util.js';
import { readAndValidateUpload } from '../services/upload.service.js';
import { processVectorizationPipeline } from '../services/pipeline.service.js';
import { processingQueueService } from '../services/queue.service.js';
import { metricsService } from '../services/metrics.service.js';
import { vectorCacheService } from '../services/cache.service.js';

const ALLOWED_COLOR_MODES = new Set(['monochrome', 'palette']);
const ALLOWED_FILL_STRATEGIES = new Set(['dominant', 'mean', 'median', 'spread']);

function normalizeColorMode(value) {
  const normalized = String(value || env.DEFAULT_COLOR_MODE).trim().toLowerCase();
  return normalized === 'mono' ? 'monochrome' : normalized;
}

function parseCommonOptions(fields) {
  const scale = parseOptionalIntField(fields, 'scale', {
    min: 2,
    max: 4,
    defaultValue: env.DEFAULT_SCALE
  });
  const threshold = parseOptionalIntField(fields, 'threshold', {
    min: 0,
    max: 255,
    defaultValue: env.DEFAULT_THRESHOLD
  });
  const turdSize = parseOptionalIntField(fields, 'turdSize', {
    min: 0,
    max: 25,
    defaultValue: env.DEFAULT_TURD_SIZE
  });
  const optTolerance = parseOptionalFloatField(fields, 'optTolerance', {
    min: 0.01,
    max: 1,
    defaultValue: env.DEFAULT_OPT_TOLERANCE
  });
  const optCurve = parseOptionalBooleanField(fields, 'optCurve', env.DEFAULT_OPT_CURVE);
  const paletteSize = parseOptionalIntField(fields, 'paletteSize', {
    min: 2,
    max: 8,
    defaultValue: env.DEFAULT_PALETTE_SIZE
  });
  const colorMode = normalizeColorMode(fields.colorMode);
  const fillStrategy = String(fields.fillStrategy || 'dominant').trim().toLowerCase();
  const mode = fields.mode || env.DEFAULT_MODE;

  if (scale === null) {
    throw new ApiError(400, 'scale debe ser un entero (2 o 4).', 'INVALID_SCALE');
  }

  if (threshold === null) {
    throw new ApiError(400, 'threshold debe ser un entero entre 0 y 255.', 'INVALID_THRESHOLD');
  }

  if (turdSize === null) {
    throw new ApiError(400, 'turdSize debe ser un entero entre 0 y 25.', 'INVALID_TURD_SIZE');
  }

  if (optTolerance === null) {
    throw new ApiError(400, 'optTolerance debe ser un número entre 0.01 y 1.', 'INVALID_OPT_TOLERANCE');
  }

  if (optCurve === null) {
    throw new ApiError(400, 'optCurve debe ser booleano (true/false).', 'INVALID_OPT_CURVE');
  }

  if (paletteSize === null) {
    throw new ApiError(400, 'paletteSize debe ser un entero entre 2 y 8.', 'INVALID_PALETTE_SIZE');
  }

  if (!ALLOWED_COLOR_MODES.has(colorMode)) {
    throw new ApiError(400, 'colorMode debe ser "monochrome" o "palette".', 'INVALID_COLOR_MODE');
  }

  if (!ALLOWED_FILL_STRATEGIES.has(fillStrategy)) {
    throw new ApiError(400, 'fillStrategy debe ser dominant|mean|median|spread.', 'INVALID_FILL_STRATEGY');
  }

  return {
    scale,
    threshold,
    turdSize,
    optTolerance,
    optCurve,
    colorMode,
    paletteSize,
    fillStrategy,
    mode
  };
}

function buildBasicOptions(fields) {
  const parsed = parseCommonOptions(fields);
  return {
    ...parsed,
    scale: env.DEFAULT_SCALE,
    mode: env.DEFAULT_MODE,
    threshold: env.DEFAULT_THRESHOLD,
    turdSize: env.DEFAULT_TURD_SIZE,
    optCurve: env.DEFAULT_OPT_CURVE,
    optTolerance: env.DEFAULT_OPT_TOLERANCE,
    colorMode: 'monochrome',
    paletteSize: env.DEFAULT_PALETTE_SIZE,
    fillStrategy: 'dominant'
  };
}

function buildAdvancedOptions(fields) {
  const parsed = parseCommonOptions(fields);
  return {
    ...parsed,
    scale: env.DEFAULT_SCALE,
    mode: env.DEFAULT_MODE
  };
}

function buildUpscaleVectorizeOptions(fields) {
  const parsed = parseCommonOptions(fields);
  if (![2, 4].includes(parsed.scale)) {
    throw new ApiError(400, 'scale debe ser 2 o 4.', 'INVALID_SCALE');
  }

  if (!['fast', 'quality'].includes(parsed.mode)) {
    throw new ApiError(400, 'mode debe ser \"fast\" o \"quality\".', 'INVALID_MODE');
  }

  return {
    ...parsed,
    scale: parsed.scale,
    mode: parsed.mode
  };
}

async function executePipeline({ request, reply, optionsBuilder }) {
  const metricStart = metricsService.trackStart();
  let cacheHit = false;

  try {
    const upload = await readAndValidateUpload(request);
    const options = optionsBuilder(upload.fields);

    const result = await processingQueueService.add(async () =>
      processVectorizationPipeline({
        inputBuffer: upload.buffer,
        options,
        logger: request.log
      })
    );

    cacheHit = result.cacheHit;

    const elapsedMs = metricsService.trackResult({
      startTime: metricStart,
      success: true,
      cacheHit
    });

    request.log.info(
      {
        elapsedMs,
        queue: processingQueueService.stats(),
        file: {
          filename: upload.filename,
          size: upload.size,
          mimetype: upload.mimetype
        }
      },
      'Solicitud procesada correctamente.'
    );

    return reply.send({
      success: true,
      svg: result.svg
    });
  } catch (error) {
    metricsService.trackResult({
      startTime: metricStart,
      success: false,
      cacheHit
    });

    if (error instanceof ApiError) {
      throw error;
    }

    throw new ApiError(500, 'Error interno procesando la imagen.', 'PIPELINE_INTERNAL_ERROR', {
      message: error.message
    });
  }
}

export async function vectorizeBasicController(request, reply) {
  return executePipeline({
    request,
    reply,
    optionsBuilder: buildBasicOptions
  });
}

export async function vectorizeAdvancedController(request, reply) {
  return executePipeline({
    request,
    reply,
    optionsBuilder: buildAdvancedOptions
  });
}

export async function upscaleVectorizeController(request, reply) {
  return executePipeline({
    request,
    reply,
    optionsBuilder: buildUpscaleVectorizeOptions
  });
}

function buildColorVectorizeOptions(fields) {
  const parsed = parseCommonOptions(fields);
  if (![2, 4].includes(parsed.scale)) {
    throw new ApiError(400, 'scale debe ser 2 o 4.', 'INVALID_SCALE');
  }

  if (!['fast', 'quality'].includes(parsed.mode)) {
    throw new ApiError(400, 'mode debe ser "fast" o "quality".', 'INVALID_MODE');
  }

  return {
    ...parsed,
    colorMode: 'palette',
    paletteSize: parsed.paletteSize || 3,
    scale: parsed.scale,
    mode: parsed.mode
  };
}

export async function vectorizeColorController(request, reply) {
  return executePipeline({
    request,
    reply,
    optionsBuilder: buildColorVectorizeOptions
  });
}

export async function metricsController(_request, reply) {
  return reply.send({
    success: true,
    metrics: metricsService.snapshot(),
    queue: processingQueueService.stats(),
    cache: vectorCacheService.stats()
  });
}
