import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Activity, ChevronDown, ChevronUp, RefreshCw } from "lucide-react";
import AuditTimeline, { type AuditEntry } from "./AuditTimeline";
import AuditFilters from "./AuditFilters";

interface AuditPanelProps {
  /** Filter by entity type (e.g. "employee", "period") */
  entityType?: string;
  /** Filter by specific record ID */
  entityId?: string;
  /** Title override */
  title?: string;
  /** Start collapsed */
  defaultOpen?: boolean;
  /** Max height for scroll area */
  maxHeight?: string;
  /** Compact mode — smaller, fewer details */
  compact?: boolean;
  /** Hide page_view events (less noise on detail pages) */
  hideViews?: boolean;
}

export default function AuditPanel({
  entityType,
  entityId,
  title = "Actividad reciente",
  defaultOpen = false,
  maxHeight = "400px",
  compact = false,
  hideViews = false,
}: AuditPanelProps) {
  const { user, role } = useAuth();
  const { selectedCompanyId } = useCompany();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(defaultOpen);
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [limit, setLimit] = useState(30);

  // Only admins/owners/managers can see audit
  const canView = role === "owner" || role === "admin" || role === "manager";

  const fetchEntries = useCallback(async () => {
    if (!canView || !user?.id) return;
    setLoading(true);

    let query = supabase
      .from("activity_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (selectedCompanyId && role !== "owner") {
      query = query.eq("company_id", selectedCompanyId);
    }

    if (entityType) {
      query = query.eq("entity_type", entityType);
    }
    if (entityId) {
      query = query.eq("entity_id", entityId);
    }

    // Apply action filter
    if (actionFilter !== "all") {
      const actions = actionFilter.split(",");
      query = query.in("action", actions);
    }

    if (hideViews && actionFilter === "all") {
      query = query.not("action", "in", '("page_view","record_view")');
    }

    const { data } = await query;
    if (!data) {
      setLoading(false);
      return;
    }

    // Enrich with user names
    const userIds = [...new Set(data.map((l) => l.user_id))];
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, full_name, email")
      .in("user_id", userIds);

    const enriched: AuditEntry[] = data.map((l) => {
      const profile = profiles?.find((p) => p.user_id === l.user_id);
      return {
        ...l,
        user_name: profile?.full_name || undefined,
        user_email: profile?.email || undefined,
      };
    });

    setEntries(enriched);
    setLoading(false);
  }, [canView, user?.id, selectedCompanyId, role, entityType, entityId, actionFilter, hideViews, limit]);

  useEffect(() => {
    if (open) fetchEntries();
  }, [open, fetchEntries]);

  if (!canView) return null;

  const filtered = entries.filter((e) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      e.user_name?.toLowerCase().includes(s) ||
      e.user_email?.toLowerCase().includes(s) ||
      e.action.toLowerCase().includes(s) ||
      e.entity_type.toLowerCase().includes(s)
    );
  });

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card className="border-border/50">
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer py-3 px-4 hover:bg-muted/30 transition-colors">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" />
                {title}
                {entries.length > 0 && (
                  <span className="text-[10px] text-muted-foreground font-normal">
                    ({filtered.length})
                  </span>
                )}
              </CardTitle>
              {open ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="pt-0 px-4 pb-4">
            <div className="mb-3 flex items-center gap-2">
              <div className="flex-1">
                <AuditFilters
                  search={search}
                  onSearchChange={setSearch}
                  activeFilter={actionFilter}
                  onFilterChange={setActionFilter}
                  compact={compact}
                />
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={fetchEntries}
                disabled={loading}
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              </Button>
            </div>

            {loading ? (
              <div className="space-y-3 py-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex gap-3 animate-pulse">
                    <div className="h-8 w-8 rounded-full bg-muted shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3 w-3/4 bg-muted rounded" />
                      <div className="h-2.5 w-1/2 bg-muted rounded" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <ScrollArea style={{ maxHeight }}>
                <AuditTimeline entries={filtered} compact={compact} />

                {filtered.length >= limit && (
                  <div className="text-center pt-3">
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs"
                      onClick={() => setLimit((l) => l + 30)}
                    >
                      Cargar más
                    </Button>
                  </div>
                )}
              </ScrollArea>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
