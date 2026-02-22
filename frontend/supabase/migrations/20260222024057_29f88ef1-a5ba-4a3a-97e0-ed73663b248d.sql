
-- Create scenario_reports table for storing what-if analysis results
CREATE TABLE public.scenario_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  query TEXT NOT NULL,
  trigger_market TEXT NOT NULL,
  causal_chain JSONB NOT NULL DEFAULT '[]'::jsonb,
  narrative TEXT,
  affected_nodes TEXT[] NOT NULL DEFAULT '{}',
  affected_edges JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.scenario_reports ENABLE ROW LEVEL SECURITY;

-- Public read access (anyone viewing dashboard can see reports)
CREATE POLICY "Anyone can read scenario reports"
ON public.scenario_reports
FOR SELECT
USING (true);

-- Service role can insert/update (edge function uses service role)
CREATE POLICY "Service role can manage scenario reports"
ON public.scenario_reports
FOR ALL
USING (true)
WITH CHECK (true);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.scenario_reports;
