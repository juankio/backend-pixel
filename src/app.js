import crypto from 'node:crypto';
import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import env from './config/env.js';
import { buildLoggerOptions } from './config/logger.js';
import vectorizeRoutes from './routes/vectorize.routes.js';
import { setGlobalErrorHandler } from './middlewares/error-handler.js';
import { cleanupTempRoot } from './services/temp-file.service.js';

export async function buildApp() {
  const app = Fastify({
    logger: buildLoggerOptions(env),
    requestIdHeader: 'x-request-id',
    genReqId: () => crypto.randomUUID(),
    bodyLimit: env.MAX_FILE_SIZE_BYTES + 1024
  });

  await app.register(helmet, {
    contentSecurityPolicy: false
  });

  await app.register(cors, {
    origin: env.CORS_ORIGIN
  });

  await app.register(multipart, {
    limits: {
      files: env.MAX_UPLOAD_FILES,
      fileSize: env.MAX_FILE_SIZE_BYTES
    },
    throwFileSizeLimit: true
  });

  await app.register(vectorizeRoutes, { prefix: '/api' });

  setGlobalErrorHandler(app);

  app.addHook('onClose', async () => {
    await cleanupTempRoot();
  });

  return app;
}
