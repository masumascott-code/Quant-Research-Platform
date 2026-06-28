import { authHeaders, notifyUnauthorized } from "@/lib/auth";

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
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }

  return await res.json() as T;
}
