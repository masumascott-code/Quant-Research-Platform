import pino from "pino";
import { getRequestContext } from "../infra/request-context";

const isProduction = process.env.NODE_ENV === "production";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: {
    service: process.env.SERVICE_NAME ?? "quantedge-api",
    environment: process.env.NODE_ENV ?? "development",
  },
  messageKey: "message",
  timestamp: pino.stdTimeFunctions.isoTime,
  mixin() {
    const context = getRequestContext();
    return context
      ? {
          requestId: context.requestId,
          correlationId: context.correlationId,
        }
      : {};
  },
  redact: [
    "req.headers.authorization",
    "req.headers.cookie",
    "res.headers['set-cookie']",
  ],
  ...(isProduction
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: { colorize: true },
        },
      }),
});
