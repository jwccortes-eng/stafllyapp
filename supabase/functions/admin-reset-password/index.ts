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
    // Validate caller is admin/owner
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify the caller's role using their JWT
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user: caller },
    } = await callerClient.auth.getUser();

    if (!caller) {
      return new Response(JSON.stringify({ error: "No autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check caller is owner or admin
    const { data: roleData } = await callerClient
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .maybeSingle();

    const allowedRoles = ["developer", "owner", "admin"];
    if (!roleData || !allowedRoles.includes(roleData.role)) {
      return new Response(
        JSON.stringify({ error: "Solo owners y admins pueden cambiar contraseñas" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { user_id, new_password } = await req.json();

    if (!user_id || !new_password) {
      return new Response(
        JSON.stringify({ error: "user_id y new_password son requeridos" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (new_password.length < 6) {
      return new Response(
        JSON.stringify({ error: "La contraseña debe tener al menos 6 caracteres" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Use service role to update the password
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { error } = await adminClient.auth.admin.updateUserById(user_id, {
      password: new_password,
    });

    if (error) {
      console.error("[admin-reset-password] Update error:", error.message);
      const raw = (error.message || "").toLowerCase();
      let humanMessage = "Error al actualizar la contraseña";
      if (raw.includes("weak") || raw.includes("pwned") || raw.includes("known to be")) {
        humanMessage = "Esta contraseña es demasiado común o apareció en filtraciones conocidas. Elige una distinta (mezcla mayúsculas, números y símbolos).";
      } else if (raw.includes("user not found") || raw.includes("not found")) {
        humanMessage = "El usuario no existe en Auth.";
      } else if (raw.includes("password") && raw.includes("short")) {
        humanMessage = "La contraseña es demasiado corta.";
      } else if (raw.includes("same") && raw.includes("password")) {
        humanMessage = "La nueva contraseña no puede ser igual a la actual.";
      } else if (error.message) {
        humanMessage = `Auth: ${error.message}`;
      }
      // Return 200 so supabase-js delivers the body to the client (avoids generic "non-2xx")
      return new Response(JSON.stringify({ error: humanMessage }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ success: true, message: "Contraseña actualizada" }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: "Error interno" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
