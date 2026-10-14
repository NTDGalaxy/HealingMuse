import type { ApiErrorCode } from "@/lib/types";

export class ApiError extends Error {
  constructor(
    public code: ApiErrorCode,
    public status = 0,
  ) {
    super(code);
  }
}
export async function api<T>(url: string, options: RequestInit = {}): Promise<T> {
  if (typeof navigator !== "undefined" && !navigator.onLine) throw new ApiError("offline");
  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      cache: "no-store",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", ...options.headers },
    });
  } catch {
    throw new ApiError("unavailable");
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(data?.error?.code ?? "unavailable", response.status);
  return data as T;
}
export function mutation<T>(url: string, data: unknown, method = "POST", expectedOwner?: string) {
  return api<T>(url, {
    method,
    body: JSON.stringify(data),
    ...(expectedOwner ? { headers: { "X-HealingMuse-Account": expectedOwner } } : {}),
  });
}
