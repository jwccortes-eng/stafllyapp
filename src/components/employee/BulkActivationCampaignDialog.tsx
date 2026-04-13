import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Send, Loader2, Mail, CheckCircle2, XCircle, AlertTriangle,
  Users, Filter, Eye, Rocket, Building2, Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatPersonName } from "@/lib/format-helpers";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employees: Array<Record<string, any>>;
  onComplete?: () => void;
}

type CampaignStep = "filter" | "preview" | "sending" | "results";

interface SendResult {
  employee_id: string;
  name: string;
  email: string;
  status: "sent" | "email_failed" | "failed" | "skipped";
  error?: string;
}

export function BulkActivationCampaignDialog({ open, onOpenChange, employees, onComplete }: Props) {
  const { selectedCompanyId, companies } = useCompany();
  const { toast } = useToast();
  const company = companies.find(c => c.id === selectedCompanyId);
  const companyName = company?.name ?? "Company";

  const [step, setStep] = useState<CampaignStep>("filter");
  const [includeInvited, setIncludeInvited] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState<SendResult[]>([]);
  const [progress, setProgress] = useState({ current: 0, total: 0 });

  // Eligible: active employees with email, without portal access (no user_id)
  const eligible = useMemo(() => {
    return employees.filter(e => {
      if (!e.is_active) return false;
      if (!e.email) return false;
      // No portal access yet
      if (!e.user_id && !e.access_pin) return true;
      // Invited but not activated
      if (includeInvited && e.access_pin && !e.user_id) return true;
      // Has user_id but include resend
      if (includeInvited && e.user_id && e.access_pin) return true;
      return false;
    });
  }, [employees, includeInvited]);

  const withoutEmail = useMemo(() => {
    return employees.filter(e => e.is_active && !e.email).length;
  }, [employees]);

  const alreadyActive = useMemo(() => {
    return employees.filter(e => e.is_active && e.user_id && e.access_pin).length;
  }, [employees]);

  // Reset on open
  useEffect(() => {
    if (open) {
      setStep("filter");
      setIncludeInvited(false);
      setSelectedIds(new Set());
      setResults([]);
      setProgress({ current: 0, total: 0 });
    }
  }, [open]);

  // Auto-select all eligible when moving to preview
  useEffect(() => {
    if (step === "preview") {
      setSelectedIds(new Set(eligible.map(e => e.id)));
    }
  }, [step, eligible]);

  const toggleEmployee = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === eligible.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(eligible.map(e => e.id)));
    }
  };

  const handleSend = async () => {
    if (!selectedCompanyId || selectedIds.size === 0) return;
    setStep("sending");
    setSending(true);
    setProgress({ current: 0, total: selectedIds.size });

    try {
      const { data, error } = await supabase.functions.invoke("bulk-portal-invite", {
        body: {
          company_id: selectedCompanyId,
          employee_ids: Array.from(selectedIds),
          send_email: true,
        },
      });

      if (error) {
        toast({ title: "Error", description: "Failed to send activation emails", variant: "destructive" });
        setStep("preview");
        setSending(false);
        return;
      }

      if (data?.error) {
        toast({ title: "Error", description: data.error, variant: "destructive" });
        setStep("preview");
        setSending(false);
        return;
      }

      // Build results from response
      const resultsList: SendResult[] = [];
      const selectedEmployees = eligible.filter(e => selectedIds.has(e.id));
      const processedCount = data.processed ?? 0;
      const emailsSentCount = data.emails_sent ?? 0;

      for (const emp of selectedEmployees) {
        const emailError = data.errors?.find((err: string) => err.includes(`Email to ${emp.first_name}`));
        const activationError = data.errors?.find((err: string) => 
          err.includes(`${emp.first_name} ${emp.last_name}`) && !err.startsWith("Email to")
        );

        let status: SendResult["status"];
        if (activationError) {
          status = "failed";
        } else if (emailError) {
          status = "email_failed"; // Activation succeeded, email didn't
        } else {
          status = "sent";
        }

        resultsList.push({
          employee_id: emp.id,
          name: formatPersonName(`${emp.first_name} ${emp.last_name}`),
          email: emp.email,
          status,
          error: activationError || emailError,
        });
      }

      setResults(resultsList);
      setProgress({ current: selectedIds.size, total: selectedIds.size });
      setStep("results");
    } catch (e: any) {
      toast({ title: "Error", description: e?.message || "Connection error", variant: "destructive" });
      setStep("preview");
    } finally {
      setSending(false);
    }
  };

  const sentCount = results.filter(r => r.status === "sent").length;
  const emailFailedCount = results.filter(r => r.status === "email_failed").length;
  const failedCount = results.filter(r => r.status === "failed").length;
  const activatedCount = sentCount + emailFailedCount; // portal activated even if email bounced

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Rocket className="h-5 w-5 text-primary" />
            Portal Activation Campaign
          </DialogTitle>
          <DialogDescription>
            Send portal activation emails to eligible employees
          </DialogDescription>
        </DialogHeader>

        {/* Company context */}
        <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-muted/30 px-3 py-2">
          <Shield className="h-4 w-4 text-primary" />
          <span className="text-xs font-semibold">{companyName}</span>
          <Badge variant="outline" className="text-[9px] ml-auto">{employees.filter(e => e.is_active).length} active employees</Badge>
        </div>

        {/* ─── Step: Filter ─── */}
        {step === "filter" && (
          <div className="space-y-4 flex-1">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border border-border/40 bg-card p-3 text-center">
                <div className="text-2xl font-bold text-primary">{eligible.length}</div>
                <div className="text-[10px] text-muted-foreground mt-1">Eligible</div>
              </div>
              <div className="rounded-lg border border-border/40 bg-card p-3 text-center">
                <div className="text-2xl font-bold text-muted-foreground">{withoutEmail}</div>
                <div className="text-[10px] text-muted-foreground mt-1">No email</div>
              </div>
              <div className="rounded-lg border border-border/40 bg-card p-3 text-center">
                <div className="text-2xl font-bold text-[hsl(var(--earning))]">{alreadyActive}</div>
                <div className="text-[10px] text-muted-foreground mt-1">Already active</div>
              </div>
            </div>

            <Separator />

            <div className="space-y-3">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <Filter className="h-4 w-4" /> Filters
              </h4>
              <label className="flex items-center gap-3 rounded-lg border border-border/40 p-3 cursor-pointer hover:bg-accent/30 transition-colors">
                <Checkbox checked={includeInvited} onCheckedChange={v => setIncludeInvited(!!v)} />
                <div>
                  <p className="text-xs font-medium">Include previously invited</p>
                  <p className="text-[10px] text-muted-foreground">Resend to employees who haven't activated yet</p>
                </div>
              </label>
            </div>

            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
              <h5 className="text-xs font-semibold text-primary mb-1">Email will include:</h5>
              <ul className="text-[11px] text-muted-foreground space-y-1">
                <li>• Company name: <span className="font-medium text-foreground">{companyName}</span></li>
                <li>• Portal access credentials (phone + PIN)</li>
                <li>• Link to access the employee portal</li>
                <li>• Payment tracking information</li>
                <li>• Activation call-to-action</li>
              </ul>
            </div>

            {eligible.length === 0 && (
              <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-medium">No eligible employees</p>
                  <p className="text-[10px] text-muted-foreground">All employees either have no email or already have active portal access.</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ─── Step: Preview ─── */}
        {step === "preview" && (
          <div className="space-y-3 flex-1 min-h-0">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {selectedIds.size} of {eligible.length} selected
              </span>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={toggleAll}>
                {selectedIds.size === eligible.length ? "Deselect all" : "Select all"}
              </Button>
            </div>
            <ScrollArea className="h-[320px] rounded-lg border border-border/40">
              <div className="divide-y divide-border/30">
                {eligible.map(emp => (
                  <label
                    key={emp.id}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-accent/30 transition-colors",
                      selectedIds.has(emp.id) && "bg-primary/5"
                    )}
                  >
                    <Checkbox
                      checked={selectedIds.has(emp.id)}
                      onCheckedChange={() => toggleEmployee(emp.id)}
                    />
                    <EmployeeAvatar
                      firstName={emp.first_name ?? ""}
                      lastName={emp.last_name ?? ""}
                      avatarUrl={emp.avatar_url}
                      gender={emp.gender}
                      size="sm"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold truncate">
                        {formatPersonName(`${emp.first_name} ${emp.last_name}`)}
                      </p>
                      <p className="text-[10px] text-muted-foreground truncate flex items-center gap-1">
                        <Mail className="h-2.5 w-2.5" /> {emp.email}
                      </p>
                    </div>
                    {emp.user_id ? (
                      <Badge variant="secondary" className="text-[9px]">Resend</Badge>
                    ) : emp.access_pin ? (
                      <Badge variant="outline" className="text-[9px]">Invited</Badge>
                    ) : (
                      <Badge className="text-[9px] bg-primary/10 text-primary border-0">New</Badge>
                    )}
                  </label>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* ─── Step: Sending ─── */}
        {step === "sending" && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 py-8">
            <Loader2 className="h-10 w-10 text-primary animate-spin" />
            <div className="text-center">
              <p className="text-sm font-semibold">Sending activation emails…</p>
              <p className="text-xs text-muted-foreground mt-1">
                Processing {progress.total} employees
              </p>
            </div>
          </div>
        )}

        {/* ─── Step: Results ─── */}
        {step === "results" && (
          <div className="space-y-3 flex-1 min-h-0">
            <div className={cn("grid gap-3", failedCount > 0 || emailFailedCount > 0 ? "grid-cols-3" : "grid-cols-1")}>
              <div className="rounded-lg border border-[hsl(var(--earning))]/30 bg-[hsl(var(--earning))]/5 p-3 text-center">
                <CheckCircle2 className="h-5 w-5 text-[hsl(var(--earning))] mx-auto" />
                <div className="text-xl font-bold text-[hsl(var(--earning))] mt-1">{activatedCount}</div>
                <div className="text-[10px] text-muted-foreground">Portal activated</div>
              </div>
              {emailFailedCount > 0 && (
                <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-center">
                  <AlertTriangle className="h-5 w-5 text-warning mx-auto" />
                  <div className="text-xl font-bold text-warning mt-1">{emailFailedCount}</div>
                  <div className="text-[10px] text-muted-foreground">Email failed</div>
                </div>
              )}
              {failedCount > 0 && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-center">
                  <XCircle className="h-5 w-5 text-destructive mx-auto" />
                  <div className="text-xl font-bold text-destructive mt-1">{failedCount}</div>
                  <div className="text-[10px] text-muted-foreground">Failed</div>
                </div>
              )}
            </div>

            <ScrollArea className="h-[240px] rounded-lg border border-border/40">
              <div className="divide-y divide-border/30">
                {results.map(r => (
                  <div key={r.employee_id} className="flex items-center gap-3 px-3 py-2">
                    {r.status === "sent" ? (
                      <CheckCircle2 className="h-4 w-4 text-[hsl(var(--earning))] shrink-0" />
                    ) : r.status === "email_failed" ? (
                      <AlertTriangle className="h-4 w-4 text-warning shrink-0" />
                    ) : (
                      <XCircle className="h-4 w-4 text-destructive shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{r.name}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{r.email}</p>
                      {r.error && r.status === "email_failed" && (
                        <p className="text-[9px] text-warning truncate">Portal activated · email retry needed</p>
                      )}
                    </div>
                    <Badge
                      variant={r.status === "sent" ? "default" : r.status === "email_failed" ? "outline" : "destructive"}
                      className="text-[9px]"
                    >
                      {r.status === "sent" ? "Sent" : r.status === "email_failed" ? "Activated" : "Failed"}
                    </Badge>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* ─── Footer ─── */}
        <DialogFooter className="gap-2">
          {step === "filter" && (
            <>
              <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button
                size="sm"
                onClick={() => setStep("preview")}
                disabled={eligible.length === 0}
              >
                <Eye className="h-3.5 w-3.5 mr-1.5" />
                Preview recipients ({eligible.length})
              </Button>
            </>
          )}
          {step === "preview" && (
            <>
              <Button variant="outline" size="sm" onClick={() => setStep("filter")}>Back</Button>
              <Button
                size="sm"
                onClick={handleSend}
                disabled={selectedIds.size === 0 || sending}
              >
                <Send className="h-3.5 w-3.5 mr-1.5" />
                Send to {selectedIds.size} employees
              </Button>
            </>
          )}
          {step === "results" && (
            <Button
              size="sm"
              onClick={() => { onOpenChange(false); onComplete?.(); }}
            >
              Done
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
