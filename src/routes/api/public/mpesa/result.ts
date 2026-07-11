import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/mpesa/result")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const payload = await request.json();
          const { createClient } = await import("@supabase/supabase-js");
          const supabase = createClient(
            process.env.SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY ??
              process.env.SUPABASE_PUBLISHABLE_KEY!,
            { auth: { persistSession: false } },
          );

          const result = payload?.Result ?? payload ?? {};
          const conversationId = result.ConversationID ?? payload?.ConversationID ?? null;
          const originatorId =
            result.OriginatorConversationID ?? payload?.OriginatorConversationID ?? null;
          const resultCode = result.ResultCode ?? payload?.ResultCode ?? null;
          const resultDesc = result.ResultDesc ?? payload?.ResultDesc ?? null;

          const items: Array<{ Key: string; Value: unknown }> =
            result?.ResultParameters?.ResultParameter ??
            payload?.ResultParameters?.ResultParameter ??
            [];
          const params: Record<string, unknown> = {};
          for (const it of items) {
            if (it && typeof it === "object" && "Key" in it && "Value" in it) {
              params[String(it.Key)] = it.Value;
            }
          }

          const receipt =
            (params.TransactionReceipt as string) ||
            (params.TransactionID as string) ||
            null;
          const workingBalance =
            (params.B2CWorkingAccountAvailableFunds as string | number | null) ??
            (params.B2CUtilityAccountAvailableFunds as string | number | null) ??
            (params.AvailableBalance as string | number | null) ??
            (params.AccountBalance as string | number | null) ??
            (params.Balance as string | number | null) ??
            (result.AvailableBalance as string | number | null) ??
            (result.AccountBalance as string | number | null) ??
            (result.Balance as string | number | null) ??
            null;

          const status = resultCode === 0 ? "success" : "failed";

          await supabase
            .from("transactions")
            .update({
              status,
              mpesa_receipt: receipt,
              result_desc: resultDesc,
              balance_after: workingBalance ? Number(workingBalance) : null,
              raw: payload,
            })
            .or(
              `conversation_id.eq.${conversationId},originator_conversation_id.eq.${originatorId}`,
            );

          if (workingBalance) {
            await supabase
              .from("paybill_state")
              .update({ balance: Number(workingBalance), updated_at: new Date().toISOString() })
              .eq("id", 1);
          }
        } catch (e) {
          console.error("mpesa result error", e);
        }
        return new Response(
          JSON.stringify({ ResultCode: 0, ResultDesc: "Accepted" }),
          { headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});
