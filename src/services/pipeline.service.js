import { v4 as uuidv4 } from 'uuid';
import { buildCacheKey } from '../utils/hash.util.js';
import { vectorCacheService } from './cache.service.js';
import { preprocessImage, upscaleImage } from './image-processing.service.js';
import { vectorizeWithPotrace } from './vectorization.service.js';
import { optimizeEditableSvg } from './svg-optimizer.service.js';

export async function processVectorizationPipeline({
  inputBuffer,
  options,
  logger
}) {
  const jobId = uuidv4();

  const cacheKey = buildCacheKey(inputBuffer, options);
  const cachedSvg = vectorCacheService.get(cacheKey);

  if (cachedSvg) {
    logger.info({ jobId, cacheHit: true }, 'Resultado servido desde cache.');
    return {
      jobId,
      cacheHit: true,
      svg: cachedSvg
    };
  }

  logger.info({ jobId, options }, 'Iniciando pipeline de vectorizacion.');

  const upscaled = await upscaleImage(inputBuffer, {
    scale: options.scale,
    mode: options.mode
  });

  const preprocessed = await preprocessImage(upscaled, {
    threshold: options.threshold,
    mode: options.mode,
    colorMode: options.colorMode,
    paletteSize: options.paletteSize
  });

  const rawSvg = await vectorizeWithPotrace(preprocessed, {
    threshold: options.threshold,
    turdSize: options.turdSize,
    optCurve: options.optCurve,
    optTolerance: options.optTolerance,
    colorMode: options.colorMode,
    paletteSize: options.paletteSize,
    fillStrategy: options.fillStrategy
  });

  const optimizedSvg = optimizeEditableSvg(rawSvg);

  vectorCacheService.set(cacheKey, optimizedSvg);

  logger.info({ jobId, cacheHit: false }, 'Pipeline completado.');

  return {
    jobId,
    cacheHit: false,
    svg: optimizedSvg
  };
}
