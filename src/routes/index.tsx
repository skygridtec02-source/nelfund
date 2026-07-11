import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Wallet,
  Building2,
  Store,
  Send,
  Briefcase,
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  Loader2,
  Clock,
  RefreshCw,
  XCircle,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  getBalance,
  listTransactions,
  sendPayment,
  validateRecipient,
} from "@/lib/mpesa.functions";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Nel Funds — Paybill Wallet" },
      {
        name: "description",
        content:
          "Nel Funds — send money, pay bills, tills and Pochi la Biashara from your M-Pesa paybill in seconds.",
      },
      { property: "og:title", content: "Nel Funds — Paybill Wallet" },
      {
        property: "og:description",
        content: "Send money and pay bills straight from your paybill.",
      },
    ],
  }),
  component: Index,
});

type PaymentType = "paybill" | "till" | "send_money" | "pochi";

const OPTIONS: {
  id: PaymentType;
  title: string;
  subtitle: string;
  icon: typeof Building2;
  recipientLabel: string;
  placeholder: string;
  requiresValidate: boolean;
}[] = [
  {
    id: "paybill",
    title: "Pay to Paybill",
    subtitle: "Send to another paybill number",
    icon: Building2,
    recipientLabel: "Paybill number",
    placeholder: "e.g. 247247",
    requiresValidate: false,
  },
  {
    id: "till",
    title: "Buy Goods (Till)",
    subtitle: "Pay to a till number",
    icon: Store,
    recipientLabel: "Till number",
    placeholder: "e.g. 5432109",
    requiresValidate: true,
  },
  {
    id: "send_money",
    title: "Send Money",
    subtitle: "Send to a Safaricom number",
    icon: Send,
    recipientLabel: "Phone number",
    placeholder: "07XX XXX XXX",
    requiresValidate: true,
  },
  {
    id: "pochi",
    title: "Pochi la Biashara",
    subtitle: "Send to a Pochi number",
    icon: Briefcase,
    recipientLabel: "Pochi number",
    placeholder: "07XX XXX XXX",
    requiresValidate: true,
  },
];

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string; Icon: typeof CheckCircle2 }> = {
    success: {
      label: "Success",
      className: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
      Icon: CheckCircle2,
    },
    processing: {
      label: "Processing",
      className: "bg-primary/15 text-primary-foreground border-primary/40",
      Icon: Loader2,
    },
    pending: {
      label: "Pending",
      className: "bg-amber-500/15 text-amber-300 border-amber-500/30",
      Icon: Clock,
    },
    failed: {
      label: "Failed",
      className: "bg-rose-500/15 text-rose-300 border-rose-500/30",
      Icon: XCircle,
    },
    timeout: {
      label: "Timeout",
      className: "bg-rose-500/15 text-rose-300 border-rose-500/30",
      Icon: XCircle,
    },
  };
  const s = map[status] ?? map.pending;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${s.className}`}
    >
      <s.Icon className={`h-3 w-3 ${status === "processing" ? "animate-spin" : ""}`} />
      {s.label}
    </span>
  );
}

function Index() {
  const qc = useQueryClient();
  const balanceFn = useServerFn(getBalance);
  const txFn = useServerFn(listTransactions);
  const validateFn = useServerFn(validateRecipient);
  const sendFn = useServerFn(sendPayment);

  const [type, setType] = useState<PaymentType>("send_money");
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [remarks, setRemarks] = useState("");
  const [validated, setValidated] = useState<{
    normalized?: string;
    name?: string | null;
    message?: string;
  } | null>(null);

  const balanceQuery = useQuery({
    queryKey: ["balance"],
    queryFn: () => balanceFn(),
  });
  const txQuery = useQuery({
    queryKey: ["transactions"],
    queryFn: () => txFn(),
  });

  useEffect(() => {
    const ch = supabase
      .channel("nel-funds")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "transactions" },
        () => qc.invalidateQueries({ queryKey: ["transactions"] }),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "paybill_state" },
        () => qc.invalidateQueries({ queryKey: ["balance"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);

  useEffect(() => {
    setValidated(null);
  }, [type, recipient]);

  const active = OPTIONS.find((o) => o.id === type)!;
  const requiresValidate = active.requiresValidate;
  const canSubmit =
    recipient.trim().length > 0 &&
    Number(amount) > 0 &&
    (!requiresValidate || validated?.normalized);

  const validateMut = useMutation({
    mutationFn: () =>
      validateFn({ data: { paymentType: type, recipient } }),
    onSuccess: (res) => {
      if (!res.ok) {
        toast.error(res.message ?? "Validation failed");
        setValidated(null);
        return;
      }
      setValidated({
        normalized: (res as { normalized?: string }).normalized,
        name: (res as { name?: string | null }).name ?? null,
        message: res.message,
      });
      toast.success(res.message ?? "Validated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sendMut = useMutation({
    mutationFn: () =>
      sendFn({
        data: {
          paymentType: type,
          recipient: validated?.normalized || recipient,
          recipientName: validated?.name ?? null,
          amount: Number(amount),
          remarks: remarks || undefined,
        },
      }),
    onSuccess: (res) => {
      toast.success(res.message ?? "Payment submitted");
      setRecipient("");
      setAmount("");
      setRemarks("");
      setValidated(null);
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["balance"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const balance = Number(balanceQuery.data?.balance ?? 0);
  const transactions = txQuery.data ?? [];

  const totals = useMemo(() => {
    let inSum = 0;
    let outSum = 0;
    for (const t of transactions) {
      const a = Number(t.amount);
      if (t.direction === "in" && t.status === "success") inSum += a;
      if (t.direction === "out" && t.status === "success") outSum += a;
    }
    return { inSum, outSum };
  }, [transactions]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Glow backdrop */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-40 -left-32 h-[420px] w-[420px] rounded-full bg-primary/40 blur-[120px]" />
        <div className="absolute top-40 -right-32 h-[420px] w-[420px] rounded-full bg-accent/40 blur-[120px]" />
        <div className="absolute bottom-0 left-1/2 h-[380px] w-[720px] -translate-x-1/2 rounded-full bg-fuchsia-500/20 blur-[140px]" />
      </div>

      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 pt-8">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-primary via-fuchsia-500 to-accent shadow-lg shadow-primary/40">
            <Wallet className="h-6 w-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Nel Funds</h1>
            <p className="text-xs text-muted-foreground">Paybill wallet · M-Pesa B2C</p>
          </div>
        </div>
        <Badge className="hidden gap-1 bg-primary/15 text-primary-foreground border border-primary/40 sm:inline-flex">
          <Sparkles className="h-3 w-3" /> Live
        </Badge>
      </header>

      <main className="mx-auto max-w-6xl px-6 pb-24 pt-6">
        {/* Balance card */}
        <Card className="relative overflow-hidden border-primary/30 bg-gradient-to-br from-primary/90 via-fuchsia-600/80 to-accent/90 p-8 text-primary-foreground shadow-2xl shadow-primary/30">
          <div className="absolute -right-10 -top-10 h-48 w-48 rounded-full bg-white/10 blur-3xl" />
          <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.2em] opacity-80">
                Paybill balance
              </p>
                <div className="mt-2 flex items-center gap-3">
                  <p className="text-5xl font-bold tabular-nums">
                    KES {balance.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => qc.invalidateQueries({ queryKey: ["balance"] })}
                    disabled={balanceQuery.isFetching}
                    className="h-8 w-8 p-0"
                    aria-label="Refresh balance"
                  >
                    {balanceQuery.isFetching ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                <p className="mt-2 text-xs opacity-80">
                  Shortcode {import.meta.env.VITE_MPESA_SHORTCODE ?? "4320291"} · {balanceQuery.data?.updated_at ? `Updated ${new Date(balanceQuery.data.updated_at).toLocaleString()}` : "Awaiting first update"}
                </p>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="rounded-xl bg-white/10 px-4 py-3 backdrop-blur">
                <div className="flex items-center gap-2 opacity-80">
                  <ArrowDownLeft className="h-4 w-4" /> Received
                </div>
                <div className="mt-1 text-lg font-semibold tabular-nums">
                  KES {totals.inSum.toLocaleString("en-KE")}
                </div>
              </div>
              <div className="rounded-xl bg-white/10 px-4 py-3 backdrop-blur">
                <div className="flex items-center gap-2 opacity-80">
                  <ArrowUpRight className="h-4 w-4" /> Sent
                </div>
                <div className="mt-1 text-lg font-semibold tabular-nums">
                  KES {totals.outSum.toLocaleString("en-KE")}
                </div>
              </div>
            </div>
          </div>
        </Card>

        <div className="mt-8 grid gap-6 lg:grid-cols-5">
          {/* Payment form */}
          <Card className="lg:col-span-3 border-border/60 bg-card/60 p-6 backdrop-blur">
            <h2 className="text-lg font-semibold">New payment</h2>
            <p className="text-sm text-muted-foreground">Choose a rail and enter details.</p>

            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {OPTIONS.map((o) => {
                const Icon = o.icon;
                const active = o.id === type;
                return (
                  <button
                    key={o.id}
                    onClick={() => setType(o.id)}
                    className={`group flex flex-col items-start gap-2 rounded-xl border p-3 text-left transition ${
                      active
                        ? "border-primary bg-primary/15 shadow-lg shadow-primary/20"
                        : "border-border/60 bg-background/40 hover:border-primary/50 hover:bg-primary/5"
                    }`}
                  >
                    <div
                      className={`grid h-9 w-9 place-items-center rounded-lg ${
                        active
                          ? "bg-gradient-to-br from-primary to-fuchsia-500 text-primary-foreground"
                          : "bg-muted text-foreground/70"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold">{o.title}</div>
                      <div className="text-xs text-muted-foreground">{o.subtitle}</div>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="mt-6 space-y-4">
              <div>
                <Label htmlFor="recipient">{active.recipientLabel}</Label>
                <div className="mt-1.5 flex gap-2">
                  <Input
                    id="recipient"
                    value={recipient}
                    placeholder={active.placeholder}
                    onChange={(e) => setRecipient(e.target.value)}
                    className="bg-background/60"
                  />
                  {requiresValidate ? (
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={!recipient.trim() || validateMut.isPending}
                      onClick={() => validateMut.mutate()}
                      className="min-w-28"
                    >
                      {validateMut.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : validated?.normalized ? (
                        <span className="flex items-center gap-1">
                          <CheckCircle2 className="h-4 w-4 text-emerald-400" /> Validated
                        </span>
                      ) : (
                        <span className="flex items-center gap-1">
                          <ShieldCheck className="h-4 w-4" /> Validate
                        </span>
                      )}
                    </Button>
                  ) : (
                    <div className="grid place-items-center rounded-md border border-dashed border-border/60 px-3 text-xs text-muted-foreground">
                      No validation
                    </div>
                  )}
                </div>
                {validated?.message ? (
                  <p className="mt-2 text-xs text-emerald-400">{validated.message}</p>
                ) : null}
                {validated?.name ? (
                  <p className="mt-1 text-xs font-medium text-emerald-300">
                    Recipient name: {validated.name}
                  </p>
                ) : null}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="amount">Amount (KES)</Label>
                  <Input
                    id="amount"
                    type="number"
                    min={1}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0"
                    className="mt-1.5 bg-background/60 tabular-nums"
                  />
                </div>
                <div>
                  <Label htmlFor="remarks">Remarks (optional)</Label>
                  <Input
                    id="remarks"
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    placeholder="Reference / note"
                    className="mt-1.5 bg-background/60"
                  />
                </div>
              </div>

              <Button
                size="lg"
                className="w-full bg-gradient-to-r from-primary via-fuchsia-500 to-accent text-primary-foreground shadow-lg shadow-primary/30 hover:opacity-95"
                disabled={!canSubmit || sendMut.isPending}
                onClick={() => sendMut.mutate()}
              >
                {sendMut.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-2 h-4 w-4" />
                )}
                Send KES {amount ? Number(amount).toLocaleString("en-KE") : "0"}
              </Button>

              {requiresValidate && !validated?.normalized ? (
                <p className="text-center text-xs text-muted-foreground">
                  Tap Validate before sending.
                </p>
              ) : null}
            </div>
          </Card>

          {/* History */}
          <Card className="lg:col-span-2 border-border/60 bg-card/60 p-6 backdrop-blur">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">History</h2>
              <span className="text-xs text-muted-foreground">
                {transactions.length} entries
              </span>
            </div>

            <div className="mt-4 max-h-[560px] space-y-3 overflow-y-auto pr-1">
              {txQuery.isLoading ? (
                <div className="grid place-items-center py-10 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              ) : transactions.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
                  No transactions yet. Sent and received payments will appear here.
                </div>
              ) : (
                transactions.map((t) => (
                  <div
                    key={t.id}
                    className="rounded-xl border border-border/60 bg-background/40 p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div
                          className={`mt-0.5 grid h-9 w-9 place-items-center rounded-lg ${
                            t.direction === "in"
                              ? "bg-emerald-500/15 text-emerald-300"
                              : "bg-primary/15 text-primary-foreground"
                          }`}
                        >
                          {t.direction === "in" ? (
                            <ArrowDownLeft className="h-4 w-4" />
                          ) : (
                            <ArrowUpRight className="h-4 w-4" />
                          )}
                        </div>
                        <div>
                          <div className="text-sm font-medium capitalize">
                            {t.payment_type.replace("_", " ")}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {t.recipient_name
                              ? `${t.recipient_name} · `
                              : ""}
                            {t.recipient ?? "—"}
                          </div>
                          <div className="mt-1 text-[11px] text-muted-foreground">
                            {new Date(t.created_at).toLocaleString()}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div
                          className={`text-sm font-semibold tabular-nums ${
                            t.direction === "in" ? "text-emerald-300" : "text-foreground"
                          }`}
                        >
                          {t.direction === "in" ? "+" : "−"} KES{" "}
                          {Number(t.amount).toLocaleString("en-KE")}
                        </div>
                        <div className="mt-1">
                          <StatusBadge status={t.status} />
                        </div>
                        {t.mpesa_receipt ? (
                          <div className="mt-1 font-mono text-[10px] text-muted-foreground">
                            {t.mpesa_receipt}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>

        <p className="mt-8 text-center text-xs text-muted-foreground">
          Powered by Safaricom Daraja · {new Date().getFullYear()} Nel Funds
        </p>
      </main>
    </div>
  );
}
