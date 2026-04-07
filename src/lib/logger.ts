type LogLevel = 'info' | 'warn' | 'error';

interface LogContext {
  [key: string]: unknown;
}

function log(level: LogLevel, message: string, context?: LogContext) {
  const entry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...context,
  };

  if (level === 'error') {
    console.error(JSON.stringify(entry));
  } else if (level === 'warn') {
    console.warn(JSON.stringify(entry));
  } else {
    console.log(JSON.stringify(entry));
  }
}

interface Logger {
  info: (message: string, context?: LogContext) => void;
  warn: (message: string, context?: LogContext) => void;
  error: (message: string, context?: LogContext) => void;
  child: (childContext: LogContext) => Logger;
}

function createLogger(baseContext?: LogContext): Logger {
  const mergeContext = (context?: LogContext) => ({
    ...baseContext,
    ...context,
  });

  return {
    info: (message: string, context?: LogContext) => log('info', message, mergeContext(context)),
    warn: (message: string, context?: LogContext) => log('warn', message, mergeContext(context)),
    error: (message: string, context?: LogContext) => log('error', message, mergeContext(context)),
    child: (childContext: LogContext) => createLogger({ ...baseContext, ...childContext }),
  };
}

export const logger = createLogger();
export type { Logger, LogContext };
