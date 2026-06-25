import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const auth = req.headers.get('Authorization')
  if (!auth?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: auth } } }
  )
  const body = await req.json().catch(() => ({}))
  const action = body.action as string
  let res: { data: unknown; error: unknown } = { data: null, error: null }

  if (action === 'lookup') {
    res = await supabase.rpc('ecosystem_identity_lookup_for_existing_employee', {
      p_target_employee_id: body.target_employee_id,
      p_target_company_id: body.target_company_id,
    })
  } else if (action === 'attach') {
    res = await supabase.rpc('ecosystem_identity_attach_existing_employee_to_auth_user', {
      p_target_employee_id: body.target_employee_id,
      p_target_company_id: body.target_company_id,
      p_match_token: body.match_token,
    })
  } else if (action === 'update_employee_phone') {
    // Controlled fixture mutation (Gate 9). Restricted to eic_qa rows by selecting via match.
    const { data, error } = await supabase
      .from('employees')
      .update({ phone_number: body.new_phone })
      .eq('id', body.employee_id)
      .eq('added_via', 'eic_qa')
      .select('id, phone_number')
    res = { data, error }
  } else {
    return new Response(JSON.stringify({ error: 'unknown_action' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
  return new Response(JSON.stringify(res), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status: 200,
  })
})
