import { ApiError } from '../utils/api-error.js';

export function setGlobalErrorHandler(fastify) {
  fastify.setErrorHandler((error, request, reply) => {
    let statusCode = error.statusCode && Number.isInteger(error.statusCode)
      ? error.statusCode
      : 500;

    if (error.code === 'FST_REQ_FILE_TOO_LARGE') {
      statusCode = 413;
      error.message = 'El archivo excede el tamaño máximo permitido.';
      error.code = 'FILE_TOO_LARGE';
    }

    if (error.code === 'FST_FILES_LIMIT') {
      statusCode = 400;
      error.message = 'Solo se permite un archivo por solicitud.';
      error.code = 'FILES_LIMIT_EXCEEDED';
    }

    const isKnown = error instanceof ApiError;

    request.log.error(
      {
        err: error,
        code: error.code,
        details: error.details
      },
      'Error procesando solicitud.'
    );

    const message = isKnown ? error.message : 'Error interno del servidor.';

    return reply.status(statusCode).send({
      success: false,
      message,
      error: {
        code: error.code || 'INTERNAL_ERROR',
        message,
        details: error.details || null
      }
    });
  });
}
