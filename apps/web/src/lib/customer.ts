import { errorMessage } from "./error-message";
export class CustomerError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}
export async function customerRequest<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(`/api/v1/${path}`, { method, credentials: "same-origin", cache: "no-store",
    headers: { "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new CustomerError(errorMessage(data?.message), response.status);
  return data as T;
}
