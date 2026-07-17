import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const PaymentTypeEnum = z.enum(["paybill", "till", "send_money", "pochi"]);

function normalizePhone(recipient: string) {
  const digits = recipient.replace(/\D/g, "");
  let msisdn = digits;
  if (msisdn.startsWith("0")) msisdn = "254" + msisdn.slice(1);
  if (msisdn.startsWith("7") || msisdn.startsWith("1")) msisdn = "254" + msisdn;
  return msisdn;
}

function normalizeTill(recipient: string) {
  return recipient.replace(/\D/g, "");
}

function extractName(payload: unknown): string | null {
  if (typeof payload === "string") {
    const value = payload.trim();
    return value ? value : null;
  }

  if (Array.isArray(payload)) {
    for (const item of payload) {
      const name = extractName(item);
      if (name) return name;
    }
    return null;
  }

  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  const data = payload as Record<string, unknown>;
  const candidates = [
    data?.AccountName,
    data?.accountName,
    data?.Name,
    data?.name,
    data?.CustomerName,
    data?.customerName,
    data?.DisplayName,
    data?.displayName,
    data?.PartyName,
    data?.partyName,
    data?.BusinessName,
    data?.businessName,
    data?.Result?.AccountName,
    data?.Result?.Name,
    data?.result?.AccountName,
    data?.result?.Name,
    data?.result?.customerName,
    data?.result?.CustomerName,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  const resultParams =
    Array.isArray(data?.Result?.ResultParameters?.ResultParameter)
      ? (data.Result.ResultParameters.ResultParameter as Array<Record<string, unknown>>)
      : Array.isArray(data?.result?.ResultParameters?.ResultParameter)
      ? (data.result.ResultParameters.ResultParameter as Array<Record<string, unknown>>)
      : null;

  if (resultParams) {
    for (const item of resultParams) {
      if (
        typeof item?.Key === "string" &&
        [
          "AccountName",
          "accountName",
          "CustomerName",
          "customerName",
          "Name",
          "name",
          "BusinessName",
          "businessName",
        ].includes(item.Key) &&
        typeof item?.Value === "string"
      ) {
        const value = item.Value.trim();
        if (value) return value;
      }
    }
  }

  for (const value of Object.values(data)) {
    const name = extractName(value);
    if (name) return name;
  }

  return null;
}

function extractBalance(payload: unknown): number | null {
  if (payload === null || typeof payload !== "object") return null;
  const data = payload as Record<string, unknown>;

  const values = [
    data?.AvailableBalance,
    data?.availableBalance,
    data?.AccountBalance,
    data?.accountBalance,
    data?.Balance,
    data?.balance,
    data?.Result?.AvailableBalance,
    data?.Result?.AccountBalance,
    data?.Result?.Balance,
    data?.result?.AvailableBalance,
    data?.result?.AccountBalance,
    data?.result?.Balance,
  ];

  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const parsed = Number(value.replace(/[^\d.\-]/g, ""));
      if (!Number.isNaN(parsed)) return parsed;
    }
  }

  const resultParams =
    Array.isArray(data?.Result?.ResultParameters?.ResultParameter)
      ? (data.Result.ResultParameters.ResultParameter as Array<Record<string, unknown>>)
      : Array.isArray(data?.result?.ResultParameters?.ResultParameter)
      ? (data.result.ResultParameters.ResultParameter as Array<Record<string, unknown>>)
      : null;

  if (resultParams) {
    for (const item of resultParams) {
      if (
        typeof item?.Key === "string" &&
        ["AvailableBalance", "AccountBalance", "Balance"].includes(item.Key) &&
        typeof item?.Value === "string"
      ) {
        const parsed = Number(item.Value.replace(/[^\d.\-]/g, ""));
        if (!Number.isNaN(parsed)) return parsed;
      }
    }
  }

  return null;
}

async function lookupSafaricomName(input: {
  paymentType: "till" | "send_money" | "pochi";
  recipient: string;
  normalized: string;
}) {
  try {
    const { getAccessToken, darajaBaseUrl } = await import("./mpesa.server");
    const token = await getAccessToken();
    const base = darajaBaseUrl();
    const shortcode = process.env.MPESA_SHORTCODE;
    const initiator = process.env.MPESA_INITIATOR_NAME;
    const credential = process.env.MPESA_SECURITY_CREDENTIAL;

    if (!shortcode || !initiator || !credential || credential.includes("your-")) {
      console.log("M-Pesa name lookup: credential not configured, skipping real-time lookup");
      return null;
    }

    const isPhoneNumber = input.paymentType === "send_money" || input.paymentType === "pochi";
    const apiOverride = process.env.MPESA_NAME_ENQUIRY_URL?.trim();
    const candidateUrls = [
      apiOverride,
      `${base}/mpesa/accountname/v1/query`,
      `${base}/mpesa/nameenquiry/v1/query`,
      `${base}/mpesa/identity/v1/query`,
    ].filter(Boolean) as string[];

    const body: Record<string, unknown> = {
      Initiator: initiator,
      SecurityCredential: credential,
      CommandID: "AccountNameQuery",
      PartyA: shortcode,
      PartyB: input.normalized,
      IdentifierType: isPhoneNumber ? 1 : 4,
      Remarks: "Nel Funds name lookup",
      QueueTimeOutURL: `${process.env.BACKEND_URL || "https://nelpaybackend.vercel.app"}/api/public/mpesa/timeout`,
      ResultURL: `${process.env.BACKEND_URL || "https://nelpaybackend.vercel.app"}/api/public/mpesa/result`,
    };

    const tryRequest = async (url: string) => {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const text = await res.text().catch(() => "");
      if (!res.ok) {
        return { ok: false, status: res.status, statusText: res.statusText, body: text, url };
      }
      const json = JSON.parse(text || "{}");
      return { ok: true, json, url };
    };

    for (const url of candidateUrls) {
      console.log("M-Pesa name lookup: trying endpoint", url);
      const result = await tryRequest(url);
      if (!result.ok) {
        console.warn(
          `M-Pesa name lookup attempt failed for ${url}: ${result.status} ${result.statusText}`,
        );
        console.warn("Response body:", result.body);
        continue;
      }

      const name = extractName(result.json);
      console.log("M-Pesa name lookup response:", result.json, "=> name:", name);
      if (name) return name;
      console.warn(
        "M-Pesa name lookup response did not include a recognised account name field. Continuing to next endpoint.",
      );
    }

    console.warn(
      "M-Pesa name lookup: all configured endpoints failed or did not return a name. The Daraja name enquiry service may not be enabled for this app or environment.",
    );
    return null;
  } catch (e) {
    console.error("M-Pesa name lookup error:", e instanceof Error ? e.message : String(e));
    return null;
  }
}

async function lookupAccountBalance() {
  try {
    const { getAccessToken, darajaBaseUrl } = await import("./mpesa.server");
    const token = await getAccessToken();
    const base = darajaBaseUrl();
    const shortcode = process.env.MPESA_SHORTCODE;
    const initiator = process.env.MPESA_INITIATOR_NAME;
    const credential = process.env.MPESA_SECURITY_CREDENTIAL;

    if (!shortcode || !initiator || !credential || credential.includes("your-")) {
      console.log("M-Pesa balance lookup: credential not configured, skipping real-time lookup");
      return null;
    }

    const body: Record<string, unknown> = {
      Initiator: initiator,
      SecurityCredential: credential,
      CommandID: "AccountBalance",
      PartyA: shortcode,
      IdentifierType: 4,
      Remarks: "Nel Funds balance lookup",
      QueueTimeOutURL: `${process.env.BACKEND_URL || "https://nelpaybackend.vercel.app"}/api/public/mpesa/timeout`,
      ResultURL: `${process.env.BACKEND_URL || "https://nelpaybackend.vercel.app"}/api/public/mpesa/result`,
    };

    const res = await fetch(`${base}/mpesa/accountbalance/v1/query`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.warn("M-Pesa balance lookup failed", res.status, res.statusText, json);
      return null;
    }

    return extractBalance(json);
  } catch (e) {
    console.error("M-Pesa balance lookup error:", e instanceof Error ? e.message : String(e));
    return null;
  }
}

export const validateRecipient = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        paymentType: PaymentTypeEnum,
        recipient: z.string().min(3).max(30),
        businessNumber: z.string().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    if (data.paymentType === "paybill") {
      return {
        ok: true,
        skipped: true,
        message: "Validation is not required for paybill payments.",
      };
    }

    if (data.paymentType === "send_money" || data.paymentType === "pochi") {
      const msisdn = normalizePhone(data.recipient);
      if (!/^254(7|1)\d{8}$/.test(msisdn)) {
        return { ok: false, message: "Enter a valid Safaricom number." };
      }

      const safaricomName = await lookupSafaricomName({
        paymentType: data.paymentType,
        recipient: data.recipient,
        normalized: msisdn,
      });

      return {
        ok: true,
        normalized: msisdn,
        name: safaricomName ?? null,
        message: safaricomName
          ? `Validated ${msisdn} as ${safaricomName}.`
          : `Number ${msisdn} looks valid. Confirm before sending.`,
      };
    }

    if (data.paymentType === "till") {
      const till = normalizeTill(data.recipient);
      if (till.length < 5 || till.length > 8) {
        return { ok: false, message: "Enter a valid till number." };
      }

      const safaricomName = await lookupSafaricomName({
        paymentType: "till",
        recipient: data.recipient,
        normalized: till,
      });

      return {
        ok: true,
        normalized: till,
        name: safaricomName ?? null,
        message: safaricomName
          ? `Validated till ${till} as ${safaricomName}.`
          : `Till ${till} format looks valid.`,
      };
    }

    return { ok: false, message: "Unsupported payment type." };
  });

export const listTransactions = createServerFn({ method: "GET" }).handler(
  async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY!,
      { auth: { persistSession: false } },
    );
    const { data, error } = await supabase
      .from("transactions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return data ?? [];
  },
);

export const getBalance = createServerFn({ method: "GET" }).handler(async () => {
  const balance = await lookupAccountBalance();

  if (typeof balance === "number") {
    try {
      const { createClient } = await import("@supabase/supabase-js");
      const supabase = createClient(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_PUBLISHABLE_KEY!,
        { auth: { persistSession: false } },
      );
      await supabase
        .from("paybill_state")
        .update({ balance, updated_at: new Date().toISOString() })
        .eq("id", 1);
    } catch (e) {
      console.warn("Failed to mirror Safaricom balance to Supabase", e);
    }

    return {
      balance,
      updated_at: new Date().toISOString(),
      source: "safaricom",
    };
  }

  return {
    balance: 0,
    updated_at: null,
    source: "safaricom-unavailable",
  };
});

export const sendPayment = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        paymentType: PaymentTypeEnum,
        recipient: z.string().min(3),
        recipientName: z.string().optional().nullable(),
        amount: z.number().positive().max(1_000_000),
        remarks: z.string().max(100).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { getAccessToken, darajaBaseUrl, callbackBase } = await import("./mpesa.server");
    const { createClient } = await import("@supabase/supabase-js");

    const shortcode = process.env.MPESA_SHORTCODE;
    const initiator = process.env.MPESA_INITIATOR_NAME;
    const credential = process.env.MPESA_SECURITY_CREDENTIAL;

    if (!shortcode) throw new Error("MPESA_SHORTCODE not configured");
    if (!initiator || !credential) {
      throw new Error(
        "MPESA_INITIATOR_NAME and MPESA_SECURITY_CREDENTIAL must be configured to send payments. Generate them from the Daraja portal.",
      );
    }

    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY!,
      { auth: { persistSession: false } },
    );

    const { data: tx, error: insErr } = await supabase
      .from("transactions")
      .insert({
        direction: "out",
        payment_type: data.paymentType,
        recipient: data.recipient,
        recipient_name: data.recipientName ?? null,
        amount: data.amount,
        status: "pending",
      })
      .select("id")
      .single();
    if (insErr) throw new Error(insErr.message);

    const token = await getAccessToken();
    const base = darajaBaseUrl();
    const cb = callbackBase();

    let url: string;
    let body: Record<string, unknown>;

    if (data.paymentType === "send_money" || data.paymentType === "pochi") {
      url = `${base}/mpesa/b2c/v1/paymentrequest`;
      body = {
        InitiatorName: initiator,
        SecurityCredential: credential,
        CommandID: "BusinessPayment",
        Amount: data.amount,
        PartyA: shortcode,
        PartyB: data.recipient,
        Remarks: data.remarks || "Nel Funds payment",
        QueueTimeOutURL: `${cb}/api/public/mpesa/timeout`,
        ResultURL: `${cb}/api/public/mpesa/result`,
        Occasion: data.paymentType,
      };
    } else {
      url = `${base}/mpesa/b2b/v1/paymentrequest`;
      body = {
        Initiator: initiator,
        SecurityCredential: credential,
        CommandID:
          data.paymentType === "paybill" ? "BusinessPayBill" : "BusinessBuyGoods",
        SenderIdentifierType: 4,
        RecieverIdentifierType: 4,
        Amount: data.amount,
        PartyA: shortcode,
        PartyB: data.recipient,
        AccountReference: data.remarks || "Nel Funds",
        Remarks: data.remarks || "Nel Funds payment",
        QueueTimeOutURL: `${cb}/api/public/mpesa/timeout`,
        ResultURL: `${cb}/api/public/mpesa/result`,
      };
    }

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as {
      ConversationID?: string;
      OriginatorConversationID?: string;
      ResponseCode?: string;
      ResponseDescription?: string;
      errorMessage?: string;
    };

    if (!res.ok || json.ResponseCode !== "0") {
      await supabase
        .from("transactions")
        .update({
          status: "failed",
          result_desc: json.ResponseDescription || json.errorMessage || `HTTP ${res.status}`,
          raw: json,
        })
        .eq("id", tx.id);
      throw new Error(
        json.errorMessage || json.ResponseDescription || "Payment request rejected",
      );
    }

    await supabase
      .from("transactions")
      .update({
        status: "processing",
        conversation_id: json.ConversationID,
        originator_conversation_id: json.OriginatorConversationID,
        result_desc: json.ResponseDescription,
        raw: json,
      })
      .eq("id", tx.id);

    return {
      ok: true,
      id: tx.id,
      conversationId: json.ConversationID,
      message: json.ResponseDescription ?? "Payment submitted",
    };
  });
