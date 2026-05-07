import pino from "pino";

const isDev = process.env.NODE_ENV !== "production";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (isDev ? "debug" : "info"),
  base: { pid: process.pid },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [
      "access_token",
      "refresh_token",
      "token",
      "password",
      "authorization",
      "req.headers.authorization",
      "req.headers.cookie",
      "*.access_token",
      "*.refresh_token",
      "*.encrypted",
      "*_encrypted",
    ],
    censor: "[REDACTED]",
  },
  ...(isDev
    ? {
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "HH:MM:ss.l",
            ignore: "pid,hostname",
          },
        },
      }
    : {}),
});

export interface LogContext {
  module?: string;
  request_id?: string;
  user_id?: string;
  [key: string]: unknown;
}

export function createLogger(context: LogContext) {
  return logger.child(context);
}
