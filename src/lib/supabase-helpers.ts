import { supabase } from "@/integrations/supabase/client";

export async function getCurrentUserRole(): Promise<'admin' | 'employee' | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .single();

  return (data?.role as 'admin' | 'employee') ?? null;
}

export async function getCurrentEmployeeId(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('employees')
    .select('id')
    .eq('user_id', user.id)
    .single();

  return data?.id ?? null;
}
