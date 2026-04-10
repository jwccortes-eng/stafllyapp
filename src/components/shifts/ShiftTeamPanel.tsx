import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { EmployeeAvatarGroup } from "@/components/ui/employee-avatar-group";
import { EmployeeIdentityRow } from "@/components/ui/employee-identity-row";
import { Phone, MessageCircle, Smartphone, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface TeamMember {
  id: string;
  employee_id: string;
  status: string;
  response_status: string;
  first_name: string;
  last_name: string;
  phone_number: string | null;
  avatar_url: string | null;
  gender: string | null;
}

interface ShiftTeamPanelProps {
  shiftId: string;
  companyId: string;
  /** Pre-loaded assignments+employees (admin view) */
  preloaded?: TeamMember[];
  compact?: boolean;
}

export function ShiftTeamPanel({ shiftId, companyId, preloaded, compact = false }: ShiftTeamPanelProps) {
  const [members, setMembers] = useState<TeamMember[]>(preloaded ?? []);
  const [loading, setLoading] = useState(!preloaded);
  const [expanded, setExpanded] = useState(!compact);

  useEffect(() => {
    if (preloaded) { setMembers(preloaded); return; }
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("shift_assignments")
        .select("id, employee_id, status, response_status, employees!inner(first_name, last_name, phone_number, avatar_url, gender)")
        .eq("shift_id", shiftId)
        .not("status", "in", '("rejected","removed")');

      const mapped: TeamMember[] = (data ?? []).map((a: any) => ({
        id: a.id,
        employee_id: a.employee_id,
        status: a.status,
        response_status: a.response_status ?? "pending",
        first_name: a.employees.first_name,
        last_name: a.employees.last_name,
        phone_number: a.employees.phone_number,
        avatar_url: a.employees.avatar_url,
        gender: a.employees.gender,
      }));
      setMembers(mapped);
      setLoading(false);
    })();
  }, [shiftId, preloaded]);

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2].map(i => <div key={i} className="h-10 animate-pulse bg-muted rounded-xl" />)}
      </div>
    );
  }

  if (members.length === 0) {
    return (
      <div className="text-center py-4">
        <p className="text-xs text-muted-foreground">Sin compañeros asignados</p>
      </div>
    );
  }

  const formatPhone = (phone: string | null) => {
    if (!phone) return null;
    return phone.replace(/[^+\d]/g, "");
  };

  const statusDot: Record<string, string> = {
    confirmed: "bg-earning",
    accepted: "bg-earning",
    pending: "bg-warning",
    needs_reacceptance: "bg-amber-500",
    review: "bg-primary",
  };

  const responseBadge: Record<string, { label: string; cls: string }> = {
    accepted: { label: "Aceptado", cls: "text-earning bg-earning/10" },
    pending: { label: "Pendiente", cls: "text-warning bg-warning/10" },
    needs_reacceptance: { label: "Re-aceptar", cls: "text-amber-600 bg-amber-500/10" },
    rejected: { label: "Rechazado", cls: "text-destructive bg-destructive/10" },
  };

  return (
    <div className="space-y-1">
      {compact && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center justify-between w-full px-3 py-2 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <EmployeeAvatarGroup
              employees={members.map(m => ({ firstName: m.first_name, lastName: m.last_name, avatarUrl: m.avatar_url, gender: m.gender }))}
              max={4}
              size="sm"
            />
            <span className="text-xs font-medium text-muted-foreground">{members.length} compañero{members.length !== 1 ? "s" : ""}</span>
          </div>
          <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", expanded && "rotate-180")} />
        </button>
      )}

      {expanded && (
        <div className="space-y-1">
          {members.map(m => {
            const cleanPhone = formatPhone(m.phone_number);
            return (
              <div key={m.id} className="rounded-xl px-3 py-2 hover:bg-muted/30 transition-colors group">
                <EmployeeIdentityRow
                  firstName={m.first_name}
                  lastName={m.last_name}
                  avatarUrl={m.avatar_url}
                  gender={m.gender}
                  size="md"
                  secondary={cleanPhone ? m.phone_number : undefined}
                  trailing={cleanPhone ? (
                    <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                      <a href={`tel:${cleanPhone}`} className="h-7 w-7 rounded-lg flex items-center justify-center hover:bg-primary/10 text-primary transition-colors" title="Llamar" onClick={e => e.stopPropagation()}>
                        <Phone className="h-3.5 w-3.5" />
                      </a>
                      <a href={`sms:${cleanPhone}`} className="h-7 w-7 rounded-lg flex items-center justify-center hover:bg-earning/10 text-earning transition-colors" title="SMS" onClick={e => e.stopPropagation()}>
                        <Smartphone className="h-3.5 w-3.5" />
                      </a>
                      <a href={`https://wa.me/${cleanPhone.replace("+", "")}`} target="_blank" rel="noopener noreferrer" className="h-7 w-7 rounded-lg flex items-center justify-center hover:bg-[#25D366]/10 text-[#25D366] transition-colors" title="WhatsApp" onClick={e => e.stopPropagation()}>
                        <MessageCircle className="h-3.5 w-3.5" />
                      </a>
                    </div>
                  ) : undefined}
                />
                <div className="flex items-center gap-1.5 ml-[42px] -mt-1">
                  <span className={cn("inline-block h-2 w-2 rounded-full", statusDot[m.response_status] || statusDot[m.status] || "bg-muted-foreground/30")} />
                  {responseBadge[m.response_status] && (
                    <span className={cn("text-[9px] font-semibold px-1.5 py-0.5 rounded-full", responseBadge[m.response_status].cls)}>
                      {responseBadge[m.response_status].label}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
