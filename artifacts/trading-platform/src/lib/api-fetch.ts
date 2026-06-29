import { authHeaders, notifyUnauthorized } from "@/lib/auth";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly payload?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  Object.entries(authHeaders()).forEach(([key, value]) => headers.set(key, value));

  const res = await fetch(`${import.meta.env.BASE_URL}${path.replace(/^\/+/, "")}`, {
    ...init,
    headers,
  });

  if (res.status === 401) {
    notifyUnauthorized();
  }

  if (!res.ok) {
    const payload = await readErrorPayload(res);
    const message = errorMessage(payload) ?? `HTTP ${res.status}: ${res.statusText}`;
    throw new ApiError(message, res.status, payload);
  }

  return await res.json() as T;
}

async function readErrorPayload(res: Response): Promise<unknown> {
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return null;

  try {
    return await res.json();
  } catch {
    return null;
  }
}

function errorMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const candidate = payload as Record<string, unknown>;
  return typeof candidate.message === "string"
    ? candidate.message
    : typeof candidate.error === "string"
      ? candidate.error
      : null;
}
