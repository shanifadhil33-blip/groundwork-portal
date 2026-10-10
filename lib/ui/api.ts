export class RequestError extends Error { constructor(public status: number, message: string) { super(message); } }
export async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...init?.headers }, cache: 'no-store' });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new RequestError(response.status, data?.error?.message ?? 'We couldn’t complete that. Please try again.');
  return data as T;
}
export const post = <T,>(url: string, body?: unknown) => request<T>(url, { method: 'POST', ...(body ? { body: JSON.stringify(body) } : {}) });
