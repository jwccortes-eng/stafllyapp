import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Upload, Users, Archive, Shield, CheckCircle2, AlertTriangle, Link2, Plus, Eye, Play, FileSpreadsheet, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { parseConnecteamHtmlXls, detectFileType, normalizePhone } from "@/lib/connecteam-html-parser";
import type { ConnecteamParsedRecord } from "@/lib/connecteam-html-parser";

interface FileState {
  file: File | null;
  records: ConnecteamParsedRecord[];
  detectedType: "active" | "archived" | "admin" | "unknown";
  status: "idle" | "parsed" | "previewed" | "importing" | "done" | "error";
}

interface ImportResult {
  success: boolean;
  dry_run: boolean;
  stats: {
    total: number;
    created: number;
    attached: number;
    updated: number;
    skipped: number;
    flagged: number;
    admin_roles: number;
  };
  details: any[];
}

const FILE_SLOTS = ["active", "archived", "admin"] as const;
type FileSlot = typeof FILE_SLOTS[number];

const SLOT_CONFIG: Record<FileSlot, { label: string; icon: any; description: string; color: string }> = {
  active: { label: "Active Employees", icon: Users, description: "Currently active workers", color: "text-emerald-600" },
  archived: { label: "Archived Employees", icon: Archive, description: "Historical / inactive workers", color: "text-amber-600" },
  admin: { label: "Admin Users", icon: Shield, description: "Admin access & permissions", color: "text-blue-600" },
};

export default function CompanyMigration() {
  const { selectedCompanyId, companies } = useCompany();
  const { toast } = useToast();
  const selectedCompany = companies.find(c => c.id === selectedCompanyId);

  const [files, setFiles] = useState<Record<FileSlot, FileState>>({
    active: { file: null, records: [], detectedType: "unknown", status: "idle" },
    archived: { file: null, records: [], detectedType: "unknown", status: "idle" },
    admin: { file: null, records: [], detectedType: "unknown", status: "idle" },
  });

  const [results, setResults] = useState<Record<FileSlot, ImportResult | null>>({
    active: null, archived: null, admin: null,
  });

  const [activePreview, setActivePreview] = useState<FileSlot | null>(null);

  const handleFileUpload = useCallback(async (slot: FileSlot, file: File) => {
    try {
      console.log("[Migration] Uploading file:", file.name, "size:", file.size, "type:", file.type);
      const text = await file.text();
      console.log("[Migration] File text length:", text.length, "first 200 chars:", text.substring(0, 200));
      const detectedType = detectFileType(text);
      console.log("[Migration] Detected type:", detectedType);
      const records = parseConnecteamHtmlXls(text);
      console.log("[Migration] Parsed records:", records.length);

      if (records.length === 0) {
        toast({ title: "No records found", description: "The file was read but no employee records were detected. Make sure it's a Connecteam HTML export (.xls).", variant: "destructive" });
        return;
      }

      setFiles(prev => ({
        ...prev,
        [slot]: { file, records, detectedType, status: "parsed" },
      }));

      toast({
        title: `${records.length} records parsed`,
        description: `File detected as: ${detectedType}. ${records.length} employees found.`,
      });
    } catch (err: any) {
      console.error("[Migration] Parse error:", err);
      toast({ title: "Parse error", description: err.message, variant: "destructive" });
    }
  }, [toast]);

  const runImport = useCallback(async (slot: FileSlot, dryRun: boolean) => {
    if (!selectedCompanyId) {
      console.error("[Migration] No company selected!");
      toast({ title: "No company selected", description: "Please select a company from the top switcher before importing.", variant: "destructive" });
      return;
    }
    const state = files[slot];
    if (!state.records.length) {
      toast({ title: "No records", description: "Upload and parse a file first.", variant: "destructive" });
      return;
    }
    console.log("[Migration] Running import:", { slot, dryRun, records: state.records.length, companyId: selectedCompanyId });

    setFiles(prev => ({ ...prev, [slot]: { ...prev[slot], status: "importing" } }));

    try {
      const mappedRecords = state.records.map(r => ({
        first_name: r.first_name,
        last_name: r.last_name,
        email: r.email || undefined,
        phone_number: r.phone_number || undefined,
        country_code: r.country_code || undefined,
        connecteam_employee_id: r.connecteam_employee_id || undefined,
        birthday: r.birthday || undefined,
        gender: r.gender || undefined,
        address: r.address || undefined,
        county: r.county || undefined,
        start_date: r.start_date || undefined,
        end_date: r.end_date || undefined,
        english_level: r.english_level || undefined,
        employee_role: r.employee_role || undefined,
        qualify: r.qualify || undefined,
        recommended_by: r.recommended_by || undefined,
        direct_manager: r.direct_manager || undefined,
        has_car: r.has_car || undefined,
        driver_licence: r.driver_licence || undefined,
        kiosk_code: r.kiosk_code || undefined,
        date_added: r.date_added || undefined,
        last_login: r.last_login || undefined,
        groups: r.groups || undefined,
        tags: r.tags || undefined,
        added_via: r.added_via || undefined,
        added_by: r.added_by || undefined,
        archived_at: r.archived_at || undefined,
        archived_by: r.archived_by || undefined,
        access_level: r.access_level || undefined,
        managed_groups: r.managed_groups || undefined,
      }));

      // Send in batches of 200
      const batchSize = 200;
      let allDetails: any[] = [];
      let totalStats = { total: 0, created: 0, attached: 0, updated: 0, skipped: 0, flagged: 0, admin_roles: 0 };

      for (let i = 0; i < mappedRecords.length; i += batchSize) {
        const batch = mappedRecords.slice(i, i + batchSize);
        const { data, error } = await supabase.functions.invoke("migration-company-sync", {
          body: { records: batch, company_id: selectedCompanyId, file_type: slot, dry_run: dryRun },
        });

        if (error) throw error;
        if (data.error) throw new Error(data.error);

        allDetails = [...allDetails, ...(data.details || [])];
        for (const k of Object.keys(totalStats) as (keyof typeof totalStats)[]) {
          totalStats[k] += data.stats[k] || 0;
        }
      }

      const result: ImportResult = {
        success: true,
        dry_run: dryRun,
        stats: totalStats,
        details: allDetails,
      };

      setResults(prev => ({ ...prev, [slot]: result }));
      setFiles(prev => ({ ...prev, [slot]: { ...prev[slot], status: "done" } }));

      toast({
        title: dryRun ? "Preview complete" : "Import complete",
        description: `${totalStats.created} new, ${totalStats.attached} cross-company, ${totalStats.updated} updated, ${totalStats.flagged} flagged`,
      });
    } catch (err: any) {
      setFiles(prev => ({ ...prev, [slot]: { ...prev[slot], status: "error" } }));
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    }
  }, [files, selectedCompanyId, toast]);

  const getActionBadge = (action: string) => {
    switch (action) {
      case "create_new": return <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">New</Badge>;
      case "attach_membership": return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">Cross-Company</Badge>;
      case "update_existing": return <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">Update</Badge>;
      case "flag_review": return <Badge variant="destructive">Review</Badge>;
      case "skip_duplicate": return <Badge variant="secondary">Skip</Badge>;
      default: return <Badge variant="outline">{action}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Company Employee Migration"
        subtitle={`Connecteam → StaflyApps${selectedCompany ? ` • ${selectedCompany.name}` : ""}`}
      />

      {/* File Upload Slots */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {FILE_SLOTS.map(slot => {
          const config = SLOT_CONFIG[slot];
          const state = files[slot];
          const result = results[slot];
          const Icon = config.icon;

          return (
            <Card key={slot} className="relative">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Icon className={`h-5 w-5 ${config.color}`} />
                  <CardTitle className="text-base">{config.label}</CardTitle>
                </div>
                <CardDescription>{config.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {state.status === "idle" ? (
                  <label className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-muted-foreground/25 p-6 cursor-pointer hover:border-primary/50 transition-colors">
                    <Upload className="h-8 w-8 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Upload .xls / .xlsx / .csv</span>
                    <input
                      type="file"
                      accept=".xls,.xlsx,.csv"
                      className="hidden"
                      onChange={e => {
                        const f = e.target.files?.[0];
                        if (f) handleFileUpload(slot, f);
                      }}
                    />
                  </label>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium truncate max-w-[140px]">{state.file?.name}</span>
                      </div>
                      <Badge variant="secondary">{state.records.length} rows</Badge>
                    </div>

                    {state.detectedType !== slot && (
                      <div className="flex items-center gap-1 text-xs text-amber-600">
                        <AlertTriangle className="h-3 w-3" />
                        Detected as "{state.detectedType}" — assigned to "{slot}"
                      </div>
                    )}

                    {result && (
                      <div className="grid grid-cols-2 gap-1 text-xs">
                        <div className="flex items-center gap-1">
                          <Plus className="h-3 w-3 text-emerald-500" />
                          <span>{result.stats.created} new</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Link2 className="h-3 w-3 text-blue-500" />
                          <span>{result.stats.attached} linked</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3 text-amber-500" />
                          <span>{result.stats.updated} updated</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3 text-destructive" />
                          <span>{result.stats.flagged} flagged</span>
                        </div>
                      </div>
                    )}

                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 gap-1"
                        onClick={() => runImport(slot, true)}
                        disabled={state.status === "importing"}
                      >
                        <Eye className="h-3.5 w-3.5" /> Preview
                      </Button>
                      <Button
                        size="sm"
                        className="flex-1 gap-1"
                        onClick={() => runImport(slot, false)}
                        disabled={state.status === "importing" || !result?.dry_run}
                      >
                        <Play className="h-3.5 w-3.5" /> Import
                      </Button>
                    </div>

                    {state.status === "importing" && <Progress value={50} className="h-1" />}

                    {state.records.length > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full text-xs"
                        onClick={() => setActivePreview(activePreview === slot ? null : slot)}
                      >
                        {activePreview === slot ? "Hide details" : `View ${state.records.length} records`}
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Detail Preview / Results Panel */}
      {activePreview && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              {SLOT_CONFIG[activePreview].label} — 
              {results[activePreview]
                ? (results[activePreview]!.dry_run ? " Preview Results" : " Import Results")
                : " Parsed Records"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="records">
              <TabsList>
                <TabsTrigger value="records">Records</TabsTrigger>
                {results[activePreview] && <TabsTrigger value="actions">Dedup Analysis</TabsTrigger>}
              </TabsList>

              <TabsContent value="records" className="mt-3">
                <div className="rounded-lg border overflow-auto max-h-[400px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-8">#</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Phone</TableHead>
                        <TableHead>CT ID</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Groups</TableHead>
                        {activePreview === "archived" && <TableHead>Archived</TableHead>}
                        {activePreview === "admin" && <TableHead>Access</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {files[activePreview].records.slice(0, 100).map((r, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                          <TableCell className="font-medium whitespace-nowrap">{r.first_name} {r.last_name}</TableCell>
                          <TableCell className="text-xs">{r.email || "—"}</TableCell>
                          <TableCell className="text-xs">{r.phone_number || "—"}</TableCell>
                          <TableCell className="text-xs font-mono">{r.connecteam_employee_id || "—"}</TableCell>
                          <TableCell className="text-xs">{r.employee_role || "—"}</TableCell>
                          <TableCell className="text-xs max-w-[120px] truncate">{r.groups || "—"}</TableCell>
                          {activePreview === "archived" && (
                            <TableCell className="text-xs">{r.archived_at || "—"}</TableCell>
                          )}
                          {activePreview === "admin" && (
                            <TableCell>
                              <Badge variant="outline" className="text-xs">{r.access_level || "—"}</Badge>
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {files[activePreview].records.length > 100 && (
                    <div className="p-2 text-center text-xs text-muted-foreground">
                      Showing first 100 of {files[activePreview].records.length} records
                    </div>
                  )}
                </div>
              </TabsContent>

              {results[activePreview] && (
                <TabsContent value="actions" className="mt-3">
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
                    {[
                      { label: "New", count: results[activePreview]!.stats.created, color: "text-emerald-600" },
                      { label: "Cross-Company", count: results[activePreview]!.stats.attached, color: "text-blue-600" },
                      { label: "Updated", count: results[activePreview]!.stats.updated, color: "text-amber-600" },
                      { label: "Flagged", count: results[activePreview]!.stats.flagged, color: "text-destructive" },
                      { label: "Admin Roles", count: results[activePreview]!.stats.admin_roles, color: "text-violet-600" },
                    ].map(s => (
                      <div key={s.label} className="rounded-lg border p-3 text-center">
                        <div className={`text-2xl font-bold ${s.color}`}>{s.count}</div>
                        <div className="text-xs text-muted-foreground">{s.label}</div>
                      </div>
                    ))}
                  </div>

                  <div className="rounded-lg border overflow-auto max-h-[350px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Action</TableHead>
                          <TableHead>Match Method</TableHead>
                          <TableHead>Confidence</TableHead>
                          <TableHead>Cross-Company</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {results[activePreview]!.details.slice(0, 100).map((d: any, i: number) => (
                          <TableRow key={i}>
                            <TableCell className="font-medium whitespace-nowrap">{d.import_name}</TableCell>
                            <TableCell className="text-xs">{d.import_email || "—"}</TableCell>
                            <TableCell>{getActionBadge(d.action)}</TableCell>
                            <TableCell className="text-xs">{d.method || "—"}</TableCell>
                            <TableCell>
                              {d.confidence > 0 && (
                                <Badge variant={d.confidence >= 0.9 ? "default" : d.confidence >= 0.7 ? "secondary" : "destructive"}>
                                  {Math.round(d.confidence * 100)}%
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-xs">
                              {d.shared_with_company ? (
                                <Badge variant="outline" className="text-xs">Linked</Badge>
                              ) : "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>
              )}
            </Tabs>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
