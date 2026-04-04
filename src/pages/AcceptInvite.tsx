import { useEffect, useState, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, XCircle, Clock } from "lucide-react";
import { StaflyLogo } from "@/components/brand/StaflyBrand";

type InviteState = "loading" | "valid" | "expired" | "used" | "invalid";

interface InviteData {
  id: string;
  employee_id: string;
  status: string;
  expires_at: string | null;
  company_name?: string;
  employee_name?: string;
  employee_phone?: string;
}

export default function AcceptInvite() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token");
  const [state, setState] = useState<InviteState>("loading");
  const [invite, setInvite] = useState<InviteData | null>(null);
  const [activating, setActivating] = useState(false);
  const markedOpened = useRef(false);

  useEffect(() => {
    if (!token) { setState("invalid"); return; }

    (async () => {
      // Look up invitation by token
      const { data, error } = await (supabase
        .from("employee_invitations" as any)
        .select("id, employee_id, status, expires_at, company_id, opened_at")
        .eq("invite_token", token)
        .single() as any);

      if (error || !data) { setState("invalid"); return; }

      // Check if already accepted
      if (data.status === "accepted") {
        setState("used");
        return;
      }

      // Check expiry
      if (data.expires_at && new Date(data.expires_at) < new Date()) {
        // Mark as expired if not already
        if (data.status !== "expired") {
          await (supabase
            .from("employee_invitations" as any)
            .update({ status: "expired" })
            .eq("id", data.id) as any);
        }
        setState("expired");
        return;
      }

      // Mark as opened (only once)
      if (!markedOpened.current && data.status !== "opened" && data.status !== "accepted") {
        markedOpened.current = true;
        await (supabase
          .from("employee_invitations" as any)
          .update({ 
            status: "opened", 
            opened_at: data.opened_at ?? new Date().toISOString() 
          })
          .eq("id", data.id) as any);
      }

      // Fetch employee + company names
      let employeeName = "";
      let companyName = "";
      let employeePhone = "";
      
      const { data: emp } = await supabase
        .from("employees")
        .select("first_name, last_name, company_id, phone_number")
        .eq("id", data.employee_id)
        .single();

      if (emp) {
        employeeName = `${emp.first_name ?? ""} ${emp.last_name ?? ""}`.trim();
        employeePhone = emp.phone_number ?? "";
        const { data: co } = await supabase
          .from("companies")
          .select("name")
          .eq("id", emp.company_id)
          .single();
        companyName = co?.name ?? "";
      }

      setInvite({
        ...data,
        company_name: companyName,
        employee_name: employeeName,
        employee_phone: employeePhone,
      });
      setState("valid");
    })();
  }, [token]);

  const handleAccept = async () => {
    if (!invite) return;
    setActivating(true);

    // 1. Mark invitation as accepted
    await (supabase
      .from("employee_invitations" as any)
      .update({ status: "accepted", accepted_at: new Date().toISOString() })
      .eq("id", invite.id) as any);

    // 2. Enable portal access on employee (correct field: portal_access_enabled)
    await supabase
      .from("employees")
      .update({ portal_access_enabled: true } as any)
      .eq("id", invite.employee_id);

    // 3. Log acceptance event
    await supabase.from("application_events" as any).insert({
      application_id: invite.id,
      event_type: "invitation_accepted",
      event_data: { employee_id: invite.employee_id, accepted_at: new Date().toISOString() },
    } as any);

    setActivating(false);
    // Redirect to login
    navigate("/auth");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-6 text-center">
        <StaflyLogo size={28} />

        {state === "loading" && (
          <div className="space-y-3 pt-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
            <p className="text-sm text-muted-foreground">Validando invitación...</p>
          </div>
        )}

        {state === "invalid" && (
          <div className="space-y-3 pt-8">
            <XCircle className="h-10 w-10 text-destructive mx-auto" />
            <h2 className="text-lg font-bold">Enlace inválido</h2>
            <p className="text-sm text-muted-foreground">
              Este enlace de invitación no es válido. Solicita uno nuevo a tu administrador.
            </p>
            <Button variant="outline" onClick={() => navigate("/auth")} className="mt-4">
              Ir al inicio de sesión
            </Button>
          </div>
        )}

        {state === "expired" && (
          <div className="space-y-3 pt-8">
            <Clock className="h-10 w-10 text-warning mx-auto" />
            <h2 className="text-lg font-bold">Invitación expirada</h2>
            <p className="text-sm text-muted-foreground">
              Este enlace ha expirado. Solicita uno nuevo a tu administrador.
            </p>
            <Button variant="outline" onClick={() => navigate("/auth")} className="mt-4">
              Ir al inicio de sesión
            </Button>
          </div>
        )}

        {state === "used" && (
          <div className="space-y-3 pt-8">
            <CheckCircle2 className="h-10 w-10 text-[hsl(var(--earning))] mx-auto" />
            <h2 className="text-lg font-bold">Invitación ya utilizada</h2>
            <p className="text-sm text-muted-foreground">
              Esta invitación ya fue aceptada. Inicia sesión con tu teléfono y PIN.
            </p>
            <Button onClick={() => navigate("/auth")} className="mt-4">
              Iniciar sesión
            </Button>
          </div>
        )}

        {state === "valid" && invite && (
          <div className="space-y-4 pt-6">
            <CheckCircle2 className="h-10 w-10 text-primary mx-auto" />
            <h2 className="text-lg font-bold">¡Bienvenido/a!</h2>
            {invite.employee_name && (
              <p className="text-base font-semibold">{invite.employee_name}</p>
            )}
            {invite.company_name && (
              <p className="text-sm text-muted-foreground">
                Has sido invitado/a a <span className="font-medium text-foreground">{invite.company_name}</span>
              </p>
            )}
            <p className="text-sm text-muted-foreground">
              Activa tu cuenta para acceder al portal de empleados.
            </p>

            {/* Access info preview */}
            <div className="bg-muted/40 rounded-lg p-3 text-left space-y-1 text-[12px]">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Teléfono</span>
                <span className="font-medium">{invite.employee_phone || "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Acceso</span>
                <span className="font-medium">Teléfono + PIN</span>
              </div>
            </div>

            <Button onClick={handleAccept} disabled={activating} className="w-full mt-4">
              {activating ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Activando...</> : "Activar mi cuenta"}
            </Button>
            <p className="text-[10px] text-muted-foreground/60">
              Después podrás iniciar sesión con tu teléfono y PIN
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
