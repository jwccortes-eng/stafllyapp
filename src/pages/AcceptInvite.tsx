import { useEffect, useState, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, XCircle, Clock, Shield, Phone, KeyRound } from "lucide-react";
import { StaflyLogo } from "@/components/brand/StaflyBrand";

type InviteState = "loading" | "valid" | "expired" | "used" | "invalid";

interface InviteData {
  id: string;
  employee_id: string;
  status: string;
  expires_at: string | null;
  company_name?: string;
  company_logo?: string | null;
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
  const [activated, setActivated] = useState(false);
  const markedOpened = useRef(false);

  useEffect(() => {
    if (!token) { setState("invalid"); return; }

    (async () => {
      const { data: inviteRows, error } = await (supabase
        .rpc("get_invitation_by_token", { _token: token }) as any);
      const data = Array.isArray(inviteRows) ? inviteRows[0] : inviteRows;

      if (error || !data) { setState("invalid"); return; }

      if (data.status === "accepted") { setState("used"); return; }

      if (data.expires_at && new Date(data.expires_at) < new Date()) {
        if (data.status !== "expired") {
          await (supabase.rpc("update_invitation_status_by_token", {
            _token: token,
            _new_status: "expired",
          }) as any);
        }
        setState("expired");
        return;
      }

      if (!markedOpened.current && data.status !== "opened" && data.status !== "accepted") {
        markedOpened.current = true;
        await (supabase.rpc("update_invitation_status_by_token", {
          _token: token,
          _new_status: "opened",
        }) as any);
      }

      let employeeName = "";
      let companyName = "";
      let companyLogo: string | null = null;
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
          .select("name, logo_url")
          .eq("id", emp.company_id)
          .single();
        companyName = co?.name ?? "";
        companyLogo = co?.logo_url ?? null;
      }

      setInvite({
        ...data,
        company_name: companyName,
        company_logo: companyLogo,
        employee_name: employeeName,
        employee_phone: employeePhone,
      });
      setState("valid");
    })();
  }, [token]);

  const handleAccept = async () => {
    if (!invite) return;
    setActivating(true);

    await (supabase.rpc("update_invitation_status_by_token", {
      _token: token,
      _new_status: "accepted",
    }) as any);

    await supabase.from("employees")
      .update({ portal_access_enabled: true } as any)
      .eq("id", invite.employee_id);

    await supabase.from("application_events" as any).insert({
      application_id: invite.id,
      event_type: "invitation_accepted",
      event_data: { employee_id: invite.employee_id, accepted_at: new Date().toISOString() },
    } as any);

    setActivating(false);
    setActivated(true);
  };

  const maskedPhone = invite?.employee_phone
    ? invite.employee_phone.replace(/\d(?=\d{4})/g, "•")
    : null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-muted/30 p-4">
      <div className="w-full max-w-sm">
        {/* Card */}
        <div className="bg-card rounded-2xl border border-border/60 shadow-lg overflow-hidden">
          {/* Brand header */}
          <div className="bg-gradient-to-br from-primary/[0.06] to-transparent px-6 pt-6 pb-4 flex flex-col items-center gap-3 border-b border-border/40">
            {invite?.company_logo ? (
              <img src={invite.company_logo} alt="" className="h-12 w-12 rounded-xl object-cover shadow" />
            ) : (
              <StaflyLogo size={28} />
            )}
            {invite?.company_name && (
              <span className="text-xs font-semibold text-muted-foreground">{invite.company_name}</span>
            )}
          </div>

          <div className="px-6 py-6 space-y-5">
            {state === "loading" && (
              <div className="flex flex-col items-center gap-3 py-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Validating invitation...</p>
              </div>
            )}

            {state === "invalid" && (
              <div className="flex flex-col items-center gap-3 py-6 text-center">
                <div className="h-14 w-14 rounded-full bg-destructive/10 flex items-center justify-center">
                  <XCircle className="h-7 w-7 text-destructive" />
                </div>
                <h2 className="text-lg font-bold text-foreground">Invalid link</h2>
                <p className="text-sm text-muted-foreground max-w-[260px]">
                  This invitation link is not valid. Please request a new one from your administrator.
                </p>
                <Button variant="outline" onClick={() => navigate("/auth")} className="mt-2 rounded-xl">
                  Go to sign in
                </Button>
              </div>
            )}

            {state === "expired" && (
              <div className="flex flex-col items-center gap-3 py-6 text-center">
                <div className="h-14 w-14 rounded-full bg-warning/10 flex items-center justify-center">
                  <Clock className="h-7 w-7 text-warning" />
                </div>
                <h2 className="text-lg font-bold text-foreground">Invitation expired</h2>
                <p className="text-sm text-muted-foreground max-w-[260px]">
                  This link has expired. Please request a new one from your administrator.
                </p>
                <Button variant="outline" onClick={() => navigate("/auth")} className="mt-2 rounded-xl">
                  Go to sign in
                </Button>
              </div>
            )}

            {state === "used" && (
              <div className="flex flex-col items-center gap-3 py-6 text-center">
                <div className="h-14 w-14 rounded-full bg-[hsl(var(--earning))]/10 flex items-center justify-center">
                  <CheckCircle2 className="h-7 w-7 text-[hsl(var(--earning))]" />
                </div>
                <h2 className="text-lg font-bold text-foreground">Account already activated</h2>
                <p className="text-sm text-muted-foreground max-w-[260px]">
                  Your account has already been activated. Sign in with your phone and PIN.
                </p>
                <Button onClick={() => navigate("/auth")} className="mt-2 w-full rounded-xl h-11">
                  Sign in
                </Button>
              </div>
            )}

            {state === "valid" && invite && !activated && (
              <>
                <div className="text-center space-y-1">
                  <h2 className="text-xl font-bold text-foreground">Welcome!</h2>
                  {invite.employee_name && (
                    <p className="text-base font-semibold text-foreground">{invite.employee_name}</p>
                  )}
                  <p className="text-sm text-muted-foreground">
                    Activate your employee portal access
                  </p>
                </div>

                {/* Credentials preview */}
                <div className="rounded-xl border border-border/60 bg-muted/30 divide-y divide-border/40">
                  <div className="flex items-center gap-3 px-4 py-3">
                    <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] text-muted-foreground">Your phone</p>
                      <p className="text-sm font-medium text-foreground">{maskedPhone || "—"}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 px-4 py-3">
                    <KeyRound className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] text-muted-foreground">Access</p>
                      <p className="text-sm font-medium text-foreground">Phone + 4-digit PIN</p>
                    </div>
                  </div>
                </div>

                <Button onClick={handleAccept} disabled={activating} className="w-full h-12 rounded-xl text-base font-semibold">
                  {activating ? (
                    <><Loader2 className="h-4 w-4 animate-spin mr-2" />Activating...</>
                  ) : (
                    "Activate my account"
                  )}
                </Button>

                <div className="flex items-center gap-2 justify-center">
                  <Shield className="h-3 w-3 text-muted-foreground/50" />
                  <p className="text-[10px] text-muted-foreground/60">
                    Your information is protected
                  </p>
                </div>
              </>
            )}

            {state === "valid" && activated && (
              <div className="flex flex-col items-center gap-4 py-6 text-center">
                <div className="h-16 w-16 rounded-full bg-gradient-to-br from-[hsl(var(--earning))] to-[hsl(var(--status-confirmed))] flex items-center justify-center shadow-lg animate-in zoom-in-50 duration-500">
                  <CheckCircle2 className="h-8 w-8 text-white" />
                </div>
                <h2 className="text-xl font-bold text-foreground">Account activated!</h2>
                <p className="text-sm text-muted-foreground max-w-[260px]">
                  Your portal is ready. Sign in with your phone number and PIN.
                </p>
                <Button onClick={() => navigate("/auth")} className="w-full h-12 rounded-xl text-base font-semibold mt-1">
                  Sign in now
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-[10px] text-muted-foreground/40 mt-4">
          Powered by Stafly
        </p>
      </div>
    </div>
  );
}