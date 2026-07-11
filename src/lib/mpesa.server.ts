// Server-only M-Pesa Daraja helpers. Never imported from client code.

const BASE_URL =
  (process.env.MPESA_ENV ?? "production").toLowerCase() === "sandbox"
    ? "https://sandbox.safaricom.co.ke"
    : "https://api.safaricom.co.ke";

export function darajaBaseUrl() {
  return BASE_URL;
}

let cachedToken: { token: string; expiresAt: number } | null = null;

export async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) {
    return cachedToken.token;
  }
  const key = process.env.MPESA_CONSUMER_KEY;
  const secret = process.env.MPESA_CONSUMER_SECRET;
  if (!key || !secret) throw new Error("M-Pesa consumer key/secret not configured");

  const auth = Buffer.from(`${key}:${secret}`).toString("base64");
  const res = await fetch(
    `${BASE_URL}/oauth/v1/generate?grant_type=client_credentials`,
    { headers: { Authorization: `Basic ${auth}` } },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Daraja auth failed: ${res.status} ${text}`);
  }
  const json = (await res.json()) as { access_token: string; expires_in: string };
  const expiresIn = Number(json.expires_in) || 3599;
  cachedToken = {
    token: json.access_token,
    expiresAt: Date.now() + expiresIn * 1000,
  };
  return cachedToken.token;
}

export function callbackBase(): string {
  return process.env.BACKEND_URL?.trim() || "https://nelpaybackend.vercel.app";
}

export type B2CCommandId =
  | "BusinessPayment"
  | "SalaryPayment"
  | "PromotionPayment";

export type PaymentType =
  | "paybill"
  | "till"
  | "send_money"
  | "pochi";
