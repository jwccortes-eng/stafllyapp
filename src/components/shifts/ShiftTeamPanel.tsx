import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { Phone, MessageCircle, Smartphone, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface TeamMember {
  id: string;
  employee_id: string;
  status: string;
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
        .select("id, employee_id, status, employees!inner(first_name, last_name, phone_number, avatar_url, gender)")
        .eq("shift_id", shiftId)
        .not("status", "in", '("rejected","removed")');

      const mapped: TeamMember[] = (data ?? []).map((a: any) => ({
        id: a.id,
        employee_id: a.employee_id,
        status: a.status,
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
    review: "bg-primary",
  };

  return (
    <div className="space-y-1">
      {compact && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center justify-between w-full px-3 py-2 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors"
        >
          <div className="flex items-center gap-2">
            {/* Stacked avatars */}
            <div className="flex -space-x-2">
              {members.slice(0, 4).map(m => (
                <EmployeeAvatar
                  key={m.id}
                  firstName={m.first_name}
                  lastName={m.last_name}
                  avatarUrl={m.avatar_url}
                  gender={m.gender}
                  size="sm"
                  className="ring-2 ring-background"
                />
              ))}
              {members.length > 4 && (
                <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold text-muted-foreground ring-2 ring-background">
                  +{members.length - 4}
                </div>
              )}
            </div>
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
              <div key={m.id} className="flex items-center gap-2.5 rounded-xl px-3 py-2 hover:bg-muted/30 transition-colors group">
                <div className="relative">
                  <EmployeeAvatar
                    firstName={m.first_name}
                    lastName={m.last_name}
                    avatarUrl={m.avatar_url}
                    gender={m.gender}
                    size="md"
                  />
                  <span className={cn("absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-background", statusDot[m.status] || "bg-muted-foreground/30")} />
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold truncate">{m.first_name} {m.last_name}</p>
                  {cleanPhone && (
                    <p className="text-[10px] text-muted-foreground truncate">{m.phone_number}</p>
                  )}
                </div>

                {/* Contact actions */}
                {cleanPhone && (
                  <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                    <a
                      href={`tel:${cleanPhone}`}
                      className="h-7 w-7 rounded-lg flex items-center justify-center hover:bg-primary/10 text-primary transition-colors"
                      title="Llamar"
                      onClick={e => e.stopPropagation()}
                    >
                      <Phone className="h-3.5 w-3.5" />
                    </a>
                    <a
                      href={`sms:${cleanPhone}`}
                      className="h-7 w-7 rounded-lg flex items-center justify-center hover:bg-earning/10 text-earning transition-colors"
                      title="SMS"
                      onClick={e => e.stopPropagation()}
                    >
                      <Smartphone className="h-3.5 w-3.5" />
                    </a>
                    <a
                      href={`https://wa.me/${cleanPhone.replace("+", "")}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="h-7 w-7 rounded-lg flex items-center justify-center hover:bg-[#25D366]/10 text-[#25D366] transition-colors"
                      title="WhatsApp"
                      onClick={e => e.stopPropagation()}
                    >
                      <MessageCircle className="h-3.5 w-3.5" />
                    </a>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
