
CREATE TABLE public.transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  direction TEXT NOT NULL CHECK (direction IN ('out','in')),
  payment_type TEXT NOT NULL,
  recipient TEXT,
  recipient_name TEXT,
  amount NUMERIC(14,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  mpesa_receipt TEXT,
  conversation_id TEXT,
  originator_conversation_id TEXT,
  result_desc TEXT,
  balance_after NUMERIC(14,2),
  raw JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_transactions_created_at ON public.transactions(created_at DESC);
CREATE INDEX idx_transactions_conversation ON public.transactions(conversation_id);

GRANT SELECT, INSERT, UPDATE ON public.transactions TO anon;
GRANT SELECT, INSERT, UPDATE ON public.transactions TO authenticated;
GRANT ALL ON public.transactions TO service_role;

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read transactions" ON public.transactions FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "public insert transactions" ON public.transactions FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "public update transactions" ON public.transactions FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.paybill_state (
  id INT PRIMARY KEY DEFAULT 1,
  balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT single_row CHECK (id = 1)
);
INSERT INTO public.paybill_state (id, balance) VALUES (1, 0) ON CONFLICT DO NOTHING;

GRANT SELECT, INSERT, UPDATE ON public.paybill_state TO anon, authenticated;
GRANT ALL ON public.paybill_state TO service_role;
ALTER TABLE public.paybill_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read state" ON public.paybill_state FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "public update state" ON public.paybill_state FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "public insert state" ON public.paybill_state FOR INSERT TO anon, authenticated WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.transactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.paybill_state;
