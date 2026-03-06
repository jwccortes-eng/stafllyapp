
-- Promo codes table: each code unlocks specific modules
CREATE TABLE public.promo_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  description text,
  modules text[] NOT NULL DEFAULT '{}',
  max_uses integer DEFAULT NULL,
  uses_count integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  expires_at timestamptz DEFAULT NULL,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Track which companies redeemed which codes
CREATE TABLE public.promo_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  promo_code_id uuid NOT NULL REFERENCES public.promo_codes(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  redeemed_by uuid REFERENCES auth.users(id),
  redeemed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(promo_code_id, company_id)
);

-- RLS
ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promo_redemptions ENABLE ROW LEVEL SECURITY;

-- Only owners can manage promo codes
CREATE POLICY "Owners can manage promo_codes"
  ON public.promo_codes FOR ALL TO authenticated
  USING (public.is_global_owner(auth.uid()))
  WITH CHECK (public.is_global_owner(auth.uid()));

-- Only owners can view/manage redemptions
CREATE POLICY "Owners can manage promo_redemptions"
  ON public.promo_redemptions FOR ALL TO authenticated
  USING (public.is_global_owner(auth.uid()))
  WITH CHECK (public.is_global_owner(auth.uid()));
