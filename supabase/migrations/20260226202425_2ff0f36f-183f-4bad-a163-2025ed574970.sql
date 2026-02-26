
-- Subscriptions table for billing module
CREATE TABLE public.subscriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  plan TEXT NOT NULL DEFAULT 'free',
  status TEXT NOT NULL DEFAULT 'active',
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  current_period_end TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT unique_company_subscription UNIQUE (company_id)
);

-- Enable RLS
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- Owners can manage all subscriptions
CREATE POLICY "Owners can manage all subscriptions"
ON public.subscriptions FOR ALL
USING (is_global_owner(auth.uid()));

-- Admins can view their company subscription
CREATE POLICY "Admins can view company subscription"
ON public.subscriptions FOR SELECT
USING (
  company_id IN (SELECT user_company_ids(auth.uid()) AS user_company_ids)
  AND has_role(auth.uid(), 'admin'::app_role)
);

-- Employees can view their company subscription status
CREATE POLICY "Employees can view subscription status"
ON public.subscriptions FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM employees
    WHERE employees.user_id = auth.uid()
    AND employees.company_id = subscriptions.company_id
  )
);

-- Trigger for updated_at
CREATE TRIGGER update_subscriptions_updated_at
BEFORE UPDATE ON public.subscriptions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
