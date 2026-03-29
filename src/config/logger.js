export function buildLoggerOptions(env) {
  const isDevelopment = env.NODE_ENV !== 'production';

  return {
    level: env.LOG_LEVEL,
    transport: isDevelopment
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname'
          }
        }
      : undefined
  };
}
