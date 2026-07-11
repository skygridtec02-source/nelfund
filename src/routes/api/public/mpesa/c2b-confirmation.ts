import { createFileRoute } from "@tanstack/react-router";

// Register this URL with Safaricom C2B URL registration to record incoming
// payments to the paybill: https://<host>/api/public/mpesa/c2b-confirmation
export const Route = createFileRoute("/api/public/mpesa/c2b-confirmation")({
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

          const amount = Number(payload.TransAmount ?? 0);
          const receipt = payload.TransID ?? null;
          const msisdn = payload.MSISDN ?? null;
          const name = [payload.FirstName, payload.MiddleName, payload.LastName]
            .filter(Boolean)
            .join(" ") || null;

          await supabase.from("transactions").insert({
            direction: "in",
            payment_type: "c2b",
            recipient: msisdn,
            recipient_name: name,
            amount,
            status: "success",
            mpesa_receipt: receipt,
            result_desc: `Received from ${name ?? msisdn ?? "customer"}`,
            raw: payload,
          });

          // Bump balance
          const { data: state } = await supabase
            .from("paybill_state")
            .select("balance")
            .eq("id", 1)
            .maybeSingle();
          const newBalance = Number(state?.balance ?? 0) + amount;
          await supabase
            .from("paybill_state")
            .update({ balance: newBalance, updated_at: new Date().toISOString() })
            .eq("id", 1);
        } catch (e) {
          console.error("c2b confirmation error", e);
        }
        return new Response(
          JSON.stringify({ ResultCode: 0, ResultDesc: "Accepted" }),
          { headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});
