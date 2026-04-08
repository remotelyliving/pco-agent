import pino from 'pino';

export type LogContext = Record<string, unknown>;

const level = process.env.LOG_LEVEL || 'info';
const isDev = process.env.NODE_ENV !== 'production';

const pinoInstance = pino({
  level,
  ...(isDev && {
    transport: {
      target: 'pino-pretty',
      options: { colorize: true },
    },
  }),
});

// Wraps a pino logger to preserve the existing call signature:
//   logger.info(message, context?)
// Pino's native API is reversed:
//   pinoLogger.info(mergingObject, message)
function wrapPino(p: pino.Logger): Logger {
  return {
    info: (message: string, context?: LogContext) =>
      context ? p.info(context, message) : p.info(message),
    warn: (message: string, context?: LogContext) =>
      context ? p.warn(context, message) : p.warn(message),
    error: (message: string, context?: LogContext) =>
      context ? p.error(context, message) : p.error(message),
    child: (childContext: LogContext) => wrapPino(p.child(childContext)),
  };
}

export interface Logger {
  info: (message: string, context?: LogContext) => void;
  warn: (message: string, context?: LogContext) => void;
  error: (message: string, context?: LogContext) => void;
  child: (childContext: LogContext) => Logger;
}

export const logger: Logger = wrapPino(pinoInstance);
