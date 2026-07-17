import { createClient } from "@supabase/supabase-js";

async function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function parseCallbackPayload(payload) {
  const result = payload?.Result ?? payload ?? {};
  const items =
    result?.ResultParameters?.ResultParameter ??
    payload?.ResultParameters?.ResultParameter ??
    [];
  const params = {};
  if (Array.isArray(items)) {
    for (const it of items) {
      if (it && typeof it === "object" && "Key" in it && "Value" in it) {
        params[String(it.Key)] = it.Value;
      }
    }
  }

  const receipt = params.TransactionReceipt || params.TransactionID || null;
  const balanceValue =
    params.B2CWorkingAccountAvailableFunds ??
    params.B2CUtilityAccountAvailableFunds ??
    params.AvailableBalance ??
    params.AccountBalance ??
    params.Balance ??
    result.AvailableBalance ??
    result.AccountBalance ??
    result.Balance ??
    null;

  return {
    payload,
    result,
    conversationId: result.ConversationID ?? payload?.ConversationID ?? null,
    originatorId:
      result.OriginatorConversationID ?? payload?.OriginatorConversationID ?? null,
    resultCode: result.ResultCode ?? payload?.ResultCode ?? null,
    resultDesc: result.ResultDesc ?? payload?.ResultDesc ?? null,
    receipt,
    balance: typeof balanceValue === "string"
      ? Number(String(balanceValue).replace(/[^\d.\-]/g, ""))
      : typeof balanceValue === "number"
      ? balanceValue
      : null,
  };
}

export default async function handler(req, res) {
  const url = new URL(req.url, "https://nelpaybackend.vercel.app");
  res.setHeader("content-type", "application/json");

  if (req.method === "GET" && url.pathname === "/") {
    return res.status(200).end(
      JSON.stringify({ ok: true, service: "NelPay backend", host: "nelpaybackend.vercel.app" }),
    );
  }

  if (req.method === "POST") {
    if (url.pathname === "/api/public/mpesa/timeout") {
      return res.status(200).end(JSON.stringify({ ok: true, message: "timeout received" }));
    }

    if (url.pathname === "/api/public/mpesa/c2b-validation") {
      return res.status(200).end(JSON.stringify({ ResultCode: 0, ResultDesc: "Accepted" }));
    }

    if (url.pathname === "/api/public/mpesa/c2b-confirmation") {
      return res.status(200).end(JSON.stringify({ ResultCode: 0, ResultDesc: "Accepted" }));
    }

    if (url.pathname === "/api/public/mpesa/result") {
      try {
        const payload = await readJsonBody(req);
        const { payload: parsedPayload, result, conversationId, originatorId, resultCode, resultDesc, receipt, balance } =
          parseCallbackPayload(payload);

        console.log("Daraja result callback", {
          conversationId,
          originatorId,
          resultCode,
          resultDesc,
          receipt,
          balance,
          payload: parsedPayload,
        });

        const supabase = createClient(
          process.env.SUPABASE_URL,
          process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY,
          { auth: { persistSession: false } },
        );

        await supabase
          .from("transactions")
          .update({
            status: resultCode === 0 ? "success" : "failed",
            mpesa_receipt: receipt,
            result_desc: resultDesc,
            balance_after: balance ?? null,
            raw: parsedPayload,
          })
          .or(
            `conversation_id.eq.${conversationId},originator_conversation_id.eq.${originatorId}`,
          );

        if (balance !== null && !Number.isNaN(balance)) {
          await supabase
            .from("paybill_state")
            .update({ balance, updated_at: new Date().toISOString() })
            .eq("id", 1);
        }
      } catch (error) {
        console.error("Daraja result callback error", error);
      }

      return res.status(200).end(JSON.stringify({ ResultCode: 0, ResultDesc: "Accepted" }));
    }
  }

  return res.status(404).end(JSON.stringify({ ok: false, error: "not found" }));
}

