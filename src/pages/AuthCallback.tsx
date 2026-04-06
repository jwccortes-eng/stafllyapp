import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, AlertCircle, CheckCircle2 } from "lucide-react";

type CallbackState = "processing" | "success" | "error";

export default function AuthCallback() {
  const navigate = useNavigate();
  const [state, setState] = useState<CallbackState>("processing");
  const [errorMsg, setErrorMsg] = useState("");
  const [debugInfo, setDebugInfo] = useState<string[]>([]);

  const log = (msg: string) => {
    console.log(`[auth-callback] ${msg}`);
    setDebugInfo(prev => [...prev, msg]);
  };

  useEffect(() => {
    handleCallback();
  }, []);

  const handleCallback = async () => {
    try {
      const hash = window.location.hash;
      const search = window.location.search;
      log(`Hash: ${hash.substring(0, 80)}...`);
      log(`Search: ${search.substring(0, 80)}`);

      // Check for error in hash or query params
      const hashParams = new URLSearchParams(hash.replace("#", ""));
      const queryParams = new URLSearchParams(search);

      const error = hashParams.get("error") || queryParams.get("error");
      const errorDescription = hashParams.get("error_description") || queryParams.get("error_description");

      if (error) {
        log(`Auth error: ${error} — ${errorDescription}`);
        setErrorMsg(errorDescription || error);
        setState("error");
        return;
      }

      // If there's a hash with access_token, Supabase client will auto-detect it
      // Just wait for the session to be established
      log("Waiting for session...");

      // Give Supabase client a moment to process the hash
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError) {
        log(`Session error: ${sessionError.message}`);
        setErrorMsg(sessionError.message);
        setState("error");
        return;
      }

      if (!session) {
        // Try exchanging code if present (PKCE flow)
        const code = queryParams.get("code");
        if (code) {
          log("Exchanging code for session...");
          const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) {
            log(`Exchange error: ${exchangeError.message}`);
            setErrorMsg(exchangeError.message);
            setState("error");
            return;
          }
          if (data.session) {
            log(`Session established via code exchange for ${data.session.user.email}`);
            await resolveAndRedirect(data.session.user.id);
            return;
          }
        }

        // No session yet — wait briefly for onAuthStateChange to fire
        log("No immediate session, waiting for auth state change...");
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error("Tiempo de espera agotado. Intenta de nuevo."));
          }, 10000);

          const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            if (session) {
              clearTimeout(timeout);
              subscription.unsubscribe();
              log(`Session established via state change: ${session.user.email}`);
              resolveAndRedirect(session.user.id).then(resolve);
            }
          });
        });
        return;
      }

      log(`Session found: ${session.user.email}`);
      await resolveAndRedirect(session.user.id);
    } catch (err: any) {
      log(`Fatal: ${err.message}`);
      setErrorMsg(err.message || "Error procesando la autenticación");
      setState("error");
    }
  };

  const resolveAndRedirect = async (userId: string) => {
    setState("success");
    log(`Resolving user ${userId}...`);

    // Check for pending invitation token in localStorage
    const pendingToken = localStorage.getItem("pending_activation_token");
    if (pendingToken) {
      log(`Pending activation token found, redirecting to /activate/${pendingToken}`);
      localStorage.removeItem("pending_activation_token");
      navigate(`/activate/${pendingToken}`, { replace: true });
      return;
    }

    // Check if employee
    const { data: empData } = await supabase
      .from("employees")
      .select("id, company_id, is_active, onboarding_status")
      .eq("user_id", userId)
      .eq("is_active", true)
      .limit(1);

    const emp = empData?.[0];
    log(`Employee: ${emp ? `${emp.id} (onboarding: ${emp.onboarding_completed})` : "none"}`);

    // Check if admin
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);

    const adminRoles = new Set(["developer", "owner", "admin", "manager", "supervisor"]);
    const hasAdmin = roleData?.some(r => adminRoles.has(r.role));
    log(`Admin: ${hasAdmin}`);

    // Check for pending invitation
    const { data: inviteData } = await supabase
      .from("employee_invitations")
      .select("id, token, employee_id")
      .eq("employee_id", emp?.id ?? "00000000-0000-0000-0000-000000000000")
      .in("status", ["created", "sent", "opened"])
      .order("created_at", { ascending: false })
      .limit(1);

    if (inviteData?.[0]?.token) {
      log(`Active invitation found, redirecting to activate/${inviteData[0].token}`);
      navigate(`/activate/${inviteData[0].token}`, { replace: true });
      return;
    }

    // Check onboarding
    if (emp && emp.onboarding_status !== 'completed') {
      log("Onboarding incomplete, checking for invitation...");
      // Try to find any invitation token for this employee
      const { data: anyInvite } = await supabase
        .from("employee_invitations")
        .select("token")
        .eq("employee_id", emp.id)
        .order("created_at", { ascending: false })
        .limit(1);

      if (anyInvite?.[0]?.token) {
        log(`Redirecting to activation: /activate/${anyInvite[0].token}`);
        navigate(`/activate/${anyInvite[0].token}`, { replace: true });
        return;
      }
    }

    // Default redirect
    if (hasAdmin) {
      log("Redirecting to /app");
      navigate("/app", { replace: true });
    } else if (emp) {
      log("Redirecting to /portal");
      navigate("/portal", { replace: true });
    } else {
      log("Redirecting to /");
      navigate("/", { replace: true });
    }
  };

  if (state === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="max-w-md w-full text-center space-y-4">
          <AlertCircle className="h-12 w-12 text-destructive mx-auto" />
          <h1 className="text-xl font-semibold text-foreground">Error de autenticación</h1>
          <p className="text-muted-foreground text-sm">{errorMsg}</p>
          <button
            onClick={() => navigate("/auth", { replace: true })}
            className="mt-4 px-6 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition"
          >
            Ir a iniciar sesión
          </button>
          {debugInfo.length > 0 && (
            <details className="mt-6 text-left">
              <summary className="text-xs text-muted-foreground cursor-pointer">Debug info</summary>
              <pre className="text-[10px] mt-2 p-2 bg-muted rounded overflow-auto max-h-40">
                {debugInfo.join("\n")}
              </pre>
            </details>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="text-center space-y-4">
        {state === "processing" ? (
          <>
            <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />
            <h1 className="text-lg font-semibold text-foreground">Procesando acceso…</h1>
            <p className="text-sm text-muted-foreground">Por favor espera mientras verificamos tu cuenta.</p>
          </>
        ) : (
          <>
            <CheckCircle2 className="h-10 w-10 text-green-500 mx-auto" />
            <h1 className="text-lg font-semibold text-foreground">¡Acceso confirmado!</h1>
            <p className="text-sm text-muted-foreground">Redirigiendo…</p>
          </>
        )}
      </div>
    </div>
  );
}
