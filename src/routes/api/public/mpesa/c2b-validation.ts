import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/mpesa/c2b-validation")({
  server: {
    handlers: {
      POST: async () => {
        // Accept everything by default.
        return new Response(
          JSON.stringify({ ResultCode: 0, ResultDesc: "Accepted" }),
          { headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});
