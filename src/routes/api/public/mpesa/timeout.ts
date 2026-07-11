import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/mpesa/timeout")({
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
          const conv = payload?.Result?.ConversationID;
          const orig = payload?.Result?.OriginatorConversationID;
          if (conv || orig) {
            await supabase
              .from("transactions")
              .update({ status: "timeout", raw: payload, result_desc: "Timed out" })
              .or(`conversation_id.eq.${conv},originator_conversation_id.eq.${orig}`);
          }
        } catch (e) {
          console.error("mpesa timeout error", e);
        }
        return new Response(
          JSON.stringify({ ResultCode: 0, ResultDesc: "Accepted" }),
          { headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});
