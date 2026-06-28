import { randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import type { NextFunction, Request, Response } from "express";

export interface RequestContext {
  requestId: string;
  correlationId: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function requestContextMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const requestId = headerValue(req.header("x-request-id")) ?? randomUUID();
  const correlationId =
    headerValue(req.header("x-correlation-id")) ?? requestId;

  res.setHeader("X-Request-ID", requestId);
  res.setHeader("X-Correlation-ID", correlationId);

  storage.run({ requestId, correlationId }, next);
}

export function getRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

function headerValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, 128) : undefined;
}
