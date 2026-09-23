import { getServerBaseUrl } from "./env";

async function call<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${getServerBaseUrl()}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(
      payload?.error?.message ?? payload?.message ?? "Phone auth request failed",
    );
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export function sendPhoneCode(phone: string) {
  return call<void>("/api/auth/phone/send-code", { phone });
}

export function registerPhone(input: {
  phone: string;
  code: string;
  password: string;
  displayName?: string;
}) {
  return call<{ userId: string; phone: string }>("/api/auth/phone/register", input);
}
