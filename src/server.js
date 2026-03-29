import env from './config/env.js';
import { buildApp } from './app.js';

async function start() {
  const app = await buildApp();

  try {
    await app.listen({
      host: env.HOST,
      port: env.PORT
    });

    app.log.info({
      host: env.HOST,
      port: env.PORT,
      env: env.NODE_ENV
    }, 'Servidor iniciado.');
  } catch (error) {
    app.log.error(error, 'No fue posible iniciar el servidor.');
    process.exit(1);
  }
}

start();
