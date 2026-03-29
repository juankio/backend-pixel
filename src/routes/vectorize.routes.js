import {
  metricsController,
  upscaleVectorizeController,
  vectorizeAdvancedController,
  vectorizeBasicController,
  vectorizeColorController
} from '../controllers/vectorize.controller.js';

const successResponseSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    svg: { type: 'string' }
  },
  required: ['success', 'svg']
};

export default async function vectorizeRoutes(fastify) {
  fastify.post('/vectorize', {
    schema: {
      consumes: ['multipart/form-data'],
      response: {
        200: successResponseSchema
      }
    },
    handler: vectorizeBasicController
  });

  fastify.post('/vectorize/advanced', {
    schema: {
      consumes: ['multipart/form-data'],
      response: {
        200: successResponseSchema
      }
    },
    handler: vectorizeAdvancedController
  });

  fastify.post('/upscale-vectorize', {
    schema: {
      consumes: ['multipart/form-data'],
      response: {
        200: successResponseSchema
      }
    },
    handler: upscaleVectorizeController
  });

  fastify.post('/vectorize/color', {
    schema: {
      consumes: ['multipart/form-data'],
      response: {
        200: successResponseSchema
      }
    },
    handler: vectorizeColorController
  });

  fastify.get('/metrics', {
    handler: metricsController
  });

  fastify.get('/health', async () => ({
    success: true,
    status: 'ok'
  }));
}
