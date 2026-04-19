-- Enum for legality status
CREATE TYPE public.ban_status AS ENUM ('banned', 'partial', 'legal');
CREATE TYPE public.incident_type AS ENUM ('hooch_tragedy', 'illegal_seizure', 'domestic_violence', 'alcohol_crime');

-- States table
CREATE TABLE public.states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  status public.ban_status NOT NULL,
  drinking_age INTEGER,
  policy_notes TEXT,
  consumption_index NUMERIC,
  dv_rate_per_100k NUMERIC,
  illegal_supply_risk NUMERIC,
  population_millions NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Incidents table
CREATE TABLE public.incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  state_code TEXT NOT NULL REFERENCES public.states(code) ON DELETE CASCADE,
  type public.incident_type NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  district TEXT,
  occurred_on DATE NOT NULL,
  casualties INTEGER DEFAULT 0,
  source_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_incidents_state ON public.incidents(state_code);
CREATE INDEX idx_incidents_date ON public.incidents(occurred_on DESC);
CREATE INDEX idx_incidents_type ON public.incidents(type);

-- Helplines table
CREATE TABLE public.helplines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  phone TEXT NOT NULL,
  coverage TEXT NOT NULL DEFAULT 'National',
  description TEXT,
  url TEXT,
  available_24_7 BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.helplines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read states" ON public.states FOR SELECT USING (true);
CREATE POLICY "Public read incidents" ON public.incidents FOR SELECT USING (true);
CREATE POLICY "Public read helplines" ON public.helplines FOR SELECT USING (true);

-- Updated-at trigger
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_states_updated_at
BEFORE UPDATE ON public.states
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();