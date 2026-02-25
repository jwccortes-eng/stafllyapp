import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { action, phone, pin, employee_id } = await req.json();

    // ACTION: login - Employee login with phone + PIN
    if (action === "login") {
      if (!phone || !pin) {
        return new Response(
          JSON.stringify({ error: "Teléfono y PIN son requeridos" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Clean phone number (remove spaces, dashes, etc.)
      const cleanPhone = phone.replace(/[\s\-\(\)]/g, "");

      // Find employee by phone number
      const { data: employee, error: empError } = await adminClient
        .from("employees")
        .select("id, first_name, last_name, phone_number, access_pin, is_active, user_id")
        .or(`phone_number.eq.${cleanPhone},phone_number.ilike.%${cleanPhone}`)
        .maybeSingle();

      if (empError || !employee) {
        return new Response(
          JSON.stringify({ error: "Empleado no encontrado" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!employee.is_active) {
        return new Response(
          JSON.stringify({ error: "Tu cuenta está inactiva. Contacta al administrador." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!employee.access_pin || employee.access_pin !== pin) {
        return new Response(
          JSON.stringify({ error: "PIN incorrecto" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // If employee doesn't have a Supabase auth user, create one
      const empEmail = `emp_${cleanPhone}@employee.internal`;
      
      if (!employee.user_id) {
        // Create auth user
        const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
          email: empEmail,
          password: pin,
          email_confirm: true,
          user_metadata: { full_name: `${employee.first_name} ${employee.last_name}` },
        });

        if (createError) {
          // User might already exist with that email
          const { data: { users } } = await adminClient.auth.admin.listUsers();
          const existingUser = users?.find(u => u.email === empEmail);
          if (existingUser) {
            // Update password and link
            await adminClient.auth.admin.updateUserById(existingUser.id, { password: pin });
            await adminClient.from("employees").update({ user_id: existingUser.id }).eq("id", employee.id);
            employee.user_id = existingUser.id;
          } else {
            return new Response(
              JSON.stringify({ error: "Error al crear cuenta: " + createError.message }),
              { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        } else if (newUser?.user) {
          // Link employee to auth user
          await adminClient.from("employees").update({ user_id: newUser.user.id }).eq("id", employee.id);
          employee.user_id = newUser.user.id;
        }
      } else {
        // Ensure password is synced with PIN
        await adminClient.auth.admin.updateUserById(employee.user_id, { password: pin });
      }

      // Sign in the employee
      const { data: signInData, error: signInError } = await adminClient.auth.signInWithPassword({
        email: empEmail,
        password: pin,
      });

      if (signInError) {
        return new Response(
          JSON.stringify({ error: "Error al iniciar sesión: " + signInError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          session: signInData.session,
          user: signInData.user,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ACTION: provision - Admin creates/updates employee auth (called when saving employee)
    if (action === "provision") {
      // Validate caller is admin
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) {
        return new Response(JSON.stringify({ error: "No autorizado" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
      const callerClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user: caller } } = await callerClient.auth.getUser();
      if (!caller) {
        return new Response(JSON.stringify({ error: "No autorizado" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!employee_id) {
        return new Response(JSON.stringify({ error: "employee_id requerido" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Generate new PIN
      const newPin = String(Math.floor(Math.random() * 1000000)).padStart(6, "0");
      
      await adminClient.from("employees").update({ access_pin: newPin }).eq("id", employee_id);

      return new Response(
        JSON.stringify({ success: true, pin: newPin }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ error: "Acción no válida" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Error interno del servidor" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
