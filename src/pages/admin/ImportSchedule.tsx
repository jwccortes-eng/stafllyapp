import React, { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, ChevronDown, Trash2, Info, Lock, CalendarDays, Users, MapPin, Building2, Download, ArrowRight, AlertTriangle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { getUserFriendlyError } from "@/lib/error-helpers";
import { safeRead, safeSheetToJson, getSheetNames, getSheet } from "@/lib/safe-xlsx";
import type { SafeWorkbook } from "@/lib/safe-xlsx";
import { useCompany } from "@/hooks/useCompany";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format, parse } from "date-fns";
import PasswordConfirmDialog from "@/components/PasswordConfirmDialog";
import { EmployeeResolver, normalizeName, type AuxUserRecord, type AmbiguousMatch, type MatchMethod, type MatchTelemetry } from "@/lib/employee-matcher";
import { parseConnecteamFile } from "@/lib/connecteam-parser";
import {
  buildFailure,
  classifySupabaseError,
  failuresToCsv,
  failuresToText,
  groupFailuresByShift,
  FAILURE_TYPE_LABELS,
  FAILURE_TYPE_HINTS,
  type AssignmentFailure,
  type AssignmentFailureType,
} from "@/lib/import/assignment-failures";
import {
  buildShiftHash,
  createImportBatch,
  persistRawRows,
  persistNormalizedRows,
  upsertShiftMapping,
  finalizeImportBatch,
  failImportBatch,
  type RawShiftRow,
  type NormalizedRowInput,
} from "@/lib/import/schedule-traceability";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ACCEPTED_EXTENSIONS = ".xls,.xlsx,.csv";
const TARGET_SHIFT_CODE = "45678";
const TARGET_CLIENT_NAME = "chef kaufman";
const TARGET_DATES = new Set(["2026-04-24", "2026-04-25", "2026-04-26"]);

// Schedule Export column names from Connecteam
const SCHEDULE_HEADERS = [
  "Date", "Start", "End", "Timezone", "Availability status",
  "Shift title", "Job", "Sub item", "Address", "Users",
  "Shift tags", "Note", "Note has attachments", "Draft",
  "Unpaid Breaks", "Paid Breaks", "Last Status", "Tasks",
  "Check In", "Check In Note", "Check In GPS",
  "Complete", "Complete Note", "Complete GPS",
];

interface ShiftGroup {
  key: string;
  shiftCode: string;
  date: string;          // ISO date
  startTime: string;     // HH:mm
  endTime: string;       // HH:mm
  job: string;           // Client name
  subItem: string;       // Sub item / shift type
  address: string;
  note: string;
  tags: string;
  status: string;
  employees: string[];   // User names assigned
  employeeStatuses: string[]; // Per-employee "Last Status" from Excel
}

interface ImportSummary {
  totalShifts: number;
  totalAssignments: number;
  totalUnavailable: number;
  matchedEmployees: number;
  unmatchedEmployees: string[];
  matchedClients: number;
  unmatchedClients: string[];
  reconciledShifts: number;
  reconciledAssignments: number;
  skippedExistingAssignments: number;
  matchTelemetry: MatchTelemetry;
  ambiguousMatches: AmbiguousMatch[];
  auxUsersLoaded: number;
  targetGroupCount: number;
  targetShiftDiagnostics: TargetShiftDiagnostic[];
  assignmentFailures: AssignmentFailure[];
  /** Fase 4.1 — traceability surface */
  batchId: string | null;
  batchStatus: "completed" | "failed" | "in_progress";
  totalRowsProcessed: number;
  shiftsCreated: number;
  shiftsUpdated: number;
  /** Per-row review records (matched + unmatched + ambiguous) for CSV export */
  normalizedRows: NormalizedRowInput[];
}

interface TargetShiftEmployeeDiagnostic {
  rawName: string;
  normalizedName: string;
  statusFromExcel: string;
  matchMethod: MatchMethod | null;
  employeeId: string | null;
  ambiguous: boolean;
  unmatched: boolean;
  insertAttempt: "yes" | "no";
  assignmentResult: string;
  reason: string | null;
}

interface TargetShiftDiagnostic {
  date: string;
  shiftCode: string;
  job: string;
  groupKey: string;
  dedupKeyExcel: string;
  dedupKeyDb: string | null;
  existingShiftId: string | null;
  enteredReconcile: boolean;
  employees: string[];
  employeeStatuses: string[];
  employeesDiagnostic: TargetShiftEmployeeDiagnostic[];
}

/**
 * Parse time strings like "05:30am", "11:30pm", "All Day" → "HH:mm" (24h)
 */
function parseTime(raw: string): string | null {
  if (!raw || raw.toLowerCase().includes("all day")) return null;
  const cleaned = raw.trim().toLowerCase();
  const match = cleaned.match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/i);
  if (!match) return null;
  let h = parseInt(match[1], 10);
  const m = match[2];
  const ampm = match[3].toLowerCase();
  if (ampm === "pm" && h < 12) h += 12;
  if (ampm === "am" && h === 12) h = 0;
  return `${String(h).padStart(2, "0")}:${m}`;
}

/**
 * Parse date: MM/DD/YYYY → YYYY-MM-DD
 */
function parseDate(raw: string): string | null {
  if (!raw) return null;
  const match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) {
    return `${match[3]}-${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}`;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  return null;
}

/**
 * Parse "Users" column → name (may have multiple users on same row, but Connecteam usually has one per row)
 */
/** Convert "JOHN DOE" or "john doe" to "John Doe" */
function toTitleCase(s: string): string {
  return s.trim().toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

function parseName(raw: string): { first: string; last: string } | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(/\s+/);
  if (parts.length < 2) return { first: toTitleCase(parts[0]), last: "" };
  return { first: toTitleCase(parts[0]), last: toTitleCase(parts.slice(1).join(" ")) };
}

export default function ImportSchedule() {
  const { selectedCompanyId } = useCompany();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [files, setFiles] = useState<File[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [workbook, setWorkbook] = useState<SafeWorkbook | null>(null);
  const [sheets, setSheets] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState("");
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [previewRows, setPreviewRows] = useState<Record<string, string>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [shiftGroups, setShiftGroups] = useState<ShiftGroup[]>([]);
  const [unavailableRecords, setUnavailableRecords] = useState<{ name: string; date: string }[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [dateRange, setDateRange] = useState<{ from: string; to: string } | null>(null);
  const [deletePasswordOpen, setDeletePasswordOpen] = useState(false);
  const [importProgress, setImportProgress] = useState<{ current: number; total: number; phase: string } | null>(null);
  const [parsingFiles, setParsingFiles] = useState(false);
  const [duplicateFileWarning, setDuplicateFileWarning] = useState<string[] | null>(null);
  // Optional auxiliary file: Connecteam Users export → enriches matching with phone/email/Connecteam ID
  const [auxUsers, setAuxUsers] = useState<AuxUserRecord[]>([]);
  const [auxFileName, setAuxFileName] = useState<string | null>(null);
  const [parsingAux, setParsingAux] = useState(false);

  // Filter dates if the range is large
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");

  // Step 4: filter for the Blocked assignments panel
  const [blockedFilter, setBlockedFilter] = useState<AssignmentFailureType | "all">("all");

  // ── Phase plan: dry-run + payroll lock detection ──
  // Dry-run runs full matching/diagnostics + persists trazabilidad (import_batch,
  // raw_schedule_import_rows, normalized_schedule_rows) but never touches
  // scheduled_shifts / shift_assignments / availability / company_settings.
  // Used for auditing closed/published/paid pay periods (Jan–Mar) without
  // mutating payroll.
  const [dryRun, setDryRun] = useState(false);
  type LockedPeriod = {
    id: string;
    start_date: string;
    end_date: string;
    status: string; // 'closed' | 'published' | 'paid'
  };
  const [lockedPeriods, setLockedPeriods] = useState<LockedPeriod[]>([]);
  const [periodsLoading, setPeriodsLoading] = useState(false);

  /** Process a single workbook sheet and return parsed groups + unavailability */
  const parseSheetData = (wb: SafeWorkbook, sheetName: string) => {
    const ws = getSheet(wb, sheetName);
    if (!ws) return { groups: [] as ShiftGroup[], unavail: [] as { name: string; date: string }[], dates: [] as string[] };
    const json = safeSheetToJson<Record<string, string>>(ws, { defval: "" });
    if (json.length === 0) return { groups: [] as ShiftGroup[], unavail: [] as { name: string; date: string }[], dates: [] as string[] };

    const groupsMap: Record<string, ShiftGroup> = {};
    const unavail: { name: string; date: string }[] = [];
    const allDates: string[] = [];

    for (const row of json) {
      const dateRaw = row["Date"] ?? "";
      const isoDate = parseDate(dateRaw);
      if (!isoDate) continue;
      allDates.push(isoDate);
      const availStatus = (row["Availability status"] ?? "").trim().toLowerCase();
      const userName = (row["Users"] ?? "").trim();
      if (availStatus === "unavailable") {
        if (userName) unavail.push({ name: userName, date: isoDate });
        continue;
      }
      const shiftTitle = (row["Shift title"] ?? "").trim();
      const startRaw = (row["Start"] ?? "").trim();
      const endRaw = (row["End"] ?? "").trim();
      const job = (row["Job"] ?? "").trim();
      if (!shiftTitle && !job && !startRaw) continue;
      const startTime = parseTime(startRaw);
      const endTime = parseTime(endRaw);
      if (!startTime || !endTime) continue;
      const combined = `${shiftTitle} ${job} ${(row["Sub item"] ?? "")}`.toLowerCase();
      const isPayrollConcept = /pay\s*ride|pagar|tip\s*pool|1\/2\s*ride|x\s*hour.*pay/i.test(combined)
        || /^99\s*[-–]/.test(job.trim());
      if (isPayrollConcept) continue;
      const groupKey = `${shiftTitle}|${isoDate}|${startTime}|${endTime}|${job}`;
      if (!groupsMap[groupKey]) {
        groupsMap[groupKey] = {
          key: groupKey, shiftCode: shiftTitle, date: isoDate, startTime, endTime, job,
          subItem: (row["Sub item"] ?? "").trim(), address: (row["Address"] ?? "").trim(),
          note: (row["Note"] ?? "").trim(), tags: (row["Shift tags"] ?? "").trim(),
          status: (row["Last Status"] ?? "").trim(), employees: [], employeeStatuses: [],
        };
      }
      if (userName && !groupsMap[groupKey].employees.includes(userName)) {
        groupsMap[groupKey].employees.push(userName);
        groupsMap[groupKey].employeeStatuses.push((row["Last Status"] ?? "").trim());
      }
    }
    return { groups: Object.values(groupsMap), unavail, dates: allDates };
  };

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files ?? []);
    if (selectedFiles.length === 0) return;

    const validFiles = selectedFiles.filter(f => {
      if (f.size > MAX_FILE_SIZE) {
        toast({ title: "Error", description: `"${f.name}" demasiado grande (máx 10MB)`, variant: "destructive" });
        return false;
      }
      return true;
    });

    if (validFiles.length === 0) return;

    setFiles(validFiles);
    setFile(validFiles[0]); // Keep first for backward compat
    setParsingFiles(true);

    // Parse all files and merge results
    let allGroups: ShiftGroup[] = [];
    let allUnavail: { name: string; date: string }[] = [];
    let allDates: string[] = [];

    for (const f of validFiles) {
      const data = await f.arrayBuffer();
      const wb = await safeRead(data);
      const names = getSheetNames(wb);
      // Use first sheet of each file
      const sheetName = names[0];
      if (!sheetName) continue;
      const result = parseSheetData(wb, sheetName);
      allGroups = [...allGroups, ...result.groups];
      allUnavail = [...allUnavail, ...result.unavail];
      allDates = [...allDates, ...result.dates];
    }

    // Deduplicate groups across files (same key = same shift)
    const dedupMap: Record<string, ShiftGroup> = {};
    for (const g of allGroups) {
      if (!dedupMap[g.key]) {
        dedupMap[g.key] = g;
      } else {
        // Merge employees from duplicate
        for (let i = 0; i < g.employees.length; i++) {
          if (!dedupMap[g.key].employees.includes(g.employees[i])) {
            dedupMap[g.key].employees.push(g.employees[i]);
            dedupMap[g.key].employeeStatuses.push(g.employeeStatuses[i]);
          }
        }
      }
    }

    const mergedGroups = Object.values(dedupMap);
    setShiftGroups(mergedGroups);
    setUnavailableRecords(allUnavail);

    if (allDates.length > 0) {
      allDates.sort();
      setDateRange({ from: allDates[0], to: allDates[allDates.length - 1] });
      setFilterFrom(allDates[0]);
      setFilterTo(allDates[allDates.length - 1]);
    }

    setParsingFiles(false);
    setStep(3);
  }, [toast]);

  /** Optional: load Connecteam Users export to enrich matching with phone/email/Connecteam ID. */
  const handleAuxUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setParsingAux(true);
    try {
      const buf = await f.arrayBuffer();
      const parsed = await parseConnecteamFile(buf, f.name);
      setAuxUsers(parsed as AuxUserRecord[]);
      setAuxFileName(f.name);
      toast({
        title: "Mapa auxiliar cargado",
        description: `${parsed.length} usuarios disponibles para matching enriquecido (phone/email/Connecteam ID).`,
      });
    } catch (err: any) {
      console.error("[ImportSchedule] aux parse failed:", err);
      toast({ title: "Error parseando mapa auxiliar", description: getUserFriendlyError(err), variant: "destructive" });
    }
    setParsingAux(false);
  }, [toast]);

  const filteredGroups = shiftGroups.filter(g => {
    if (filterFrom && g.date < filterFrom) return false;
    if (filterTo && g.date > filterTo) return false;
    return true;
  });

  // Effective range for safety checks: prefer manual filter, fall back to file range.
  const effectiveRangeFrom = filterFrom || dateRange?.from || null;
  const effectiveRangeTo = filterTo || dateRange?.to || null;

  // Detect pay periods that overlap the import range and are non-mutable.
  // We BLOCK live writes against closed/published/paid periods unless dry-run.
  useEffect(() => {
    if (!selectedCompanyId || !effectiveRangeFrom || !effectiveRangeTo) {
      setLockedPeriods([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setPeriodsLoading(true);
      try {
        // Overlap = period.start <= rangeTo AND period.end >= rangeFrom
        const { data, error } = await supabase
          .from("pay_periods")
          .select("id, start_date, end_date, status")
          .eq("company_id", selectedCompanyId)
          .lte("start_date", effectiveRangeTo)
          .gte("end_date", effectiveRangeFrom)
          .in("status", ["closed", "published", "paid"]);
        if (cancelled) return;
        if (error) {
          console.warn("[ImportSchedule] pay_periods lock check failed:", error.message);
          setLockedPeriods([]);
        } else {
          setLockedPeriods((data ?? []) as LockedPeriod[]);
        }
      } finally {
        if (!cancelled) setPeriodsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedCompanyId, effectiveRangeFrom, effectiveRangeTo]);

  const hasLockedPeriods = lockedPeriods.length > 0;

  const handleImport = async (options?: { force?: boolean; dryRun?: boolean }) => {
    const isDryRun = options?.dryRun ?? dryRun;
    if (!selectedCompanyId) {
      console.warn("[ImportSchedule] handleImport blocked: no selectedCompanyId");
      toast({ title: "Sin empresa seleccionada", description: "Selecciona una empresa antes de importar.", variant: "destructive" });
      return;
    }
    if (filteredGroups.length === 0) {
      console.warn("[ImportSchedule] handleImport blocked: filteredGroups is empty");
      toast({ title: "Nada para importar", description: "No hay turnos en el rango seleccionado.", variant: "destructive" });
      return;
    }

    // ── Payroll-lock guard ──
    // If any pay period that overlaps the import range is closed/published/paid,
    // we DO NOT allow live writes. The operator must either narrow the range to
    // open periods, or run the import in audit (dry-run) mode.
    if (hasLockedPeriods && !isDryRun) {
      console.warn("[ImportSchedule] handleImport blocked: locked pay periods overlap range", lockedPeriods);
      toast({
        title: "Periodos de nómina bloqueados",
        description: `${lockedPeriods.length} periodo(s) en este rango están cerrados/publicados/pagados. Usa el modo Auditoría (dry-run) o ajusta el rango.`,
        variant: "destructive",
      });
      return;
    }

    setImporting(true);
    setResult(null);
    setImportProgress({ current: 0, total: filteredGroups.length, phase: isDryRun ? "Auditoría: preparando…" : "Preparando..." });

    // Hoisted so the catch block can mark the batch as failed.
    let batchIdForCatch: string | null = null;

    try {
      // ── Check for duplicate file upload using company_settings ──
      // Post-FIX #1: re-uploading the same file is now SAFE because reconciliation
      // is idempotent. We surface a warning + require explicit confirmation
      // (forceReimport) instead of hard-blocking, so users can fix orphan shifts.
      const { data: setting } = await supabase
        .from("company_settings")
        .select("value")
        .eq("company_id", selectedCompanyId)
        .eq("key", "imported_schedule_files")
        .maybeSingle();
      const importedFiles: string[] = setting?.value ? (Array.isArray(setting.value) ? setting.value as string[] : []) : [];
      const fileNames = files.length > 0 ? files.map(f => f.name) : (file ? [file.name] : []);
      const alreadyImported = fileNames.filter(n => importedFiles.includes(n));
      if (alreadyImported.length > 0 && !options?.force && !isDryRun) {
        console.info("[ImportSchedule] Duplicate file detected, prompting for reconciliation:", alreadyImported);
        setDuplicateFileWarning(alreadyImported);
        setImporting(false);
        setImportProgress(null);
        return;
      }

      // ── Fase 4: Create import_batch + persist raw source rows BEFORE touching shifts ──
      // This guarantees that even if employee matching fails or the import crashes mid-way,
      // the original Connecteam rows are recoverable from raw_schedule_import_rows.
      setImportProgress({ current: 0, total: filteredGroups.length, phase: "Registrando batch de importación..." });
      const { data: { user } } = await supabase.auth.getUser();
      const fileNameForBatch = files[0]?.name ?? file?.name ?? null;
      const batchId = user?.id
        ? await createImportBatch({
            companyId: selectedCompanyId,
            createdBy: user.id,
            fileName: fileNameForBatch,
            dateRangeFrom: filterFrom || null,
            dateRangeTo: filterTo || null,
          })
        : null;
      batchIdForCatch = batchId;
      if (!batchId) {
        console.warn("[ImportSchedule] No batch_id created — proceeding without traceability persistence");
      }
      // Stamp the batch as a dry-run audit so it cannot be confused with a live import.
      if (batchId && isDryRun) {
        const lockedSummary = lockedPeriods.map(p => `${p.start_date}→${p.end_date}:${p.status}`).join(", ");
        await supabase
          .from("import_batches")
          .update({
            status: "dry_run",
            audit_notes: `Dry-run audit (no writes). Locked periods overlapping range: ${lockedSummary || "none"}.`,
          })
          .eq("id", batchId);
      }

      // Persist raw rows for every shift group we are about to process.
      // rawRowMap: shiftHash → raw_row_id (used later when writing normalized rows + mapping).
      let rawRowMap = new Map<string, string>();
      if (batchId) {
        setImportProgress({ current: 0, total: filteredGroups.length, phase: "Guardando filas originales..." });
        const rawRows: RawShiftRow[] = filteredGroups.map(g => {
          const numericCode = g.shiftCode ? g.shiftCode.match(/^(\d+)/)?.[1] || g.shiftCode : "";
          return {
            shift_code: numericCode,
            date: g.date,
            start_time: g.startTime,
            end_time: g.endTime,
            job: g.job,
            sub_item: g.subItem,
            address: g.address,
            note: g.note,
            tags: g.tags,
            status: g.status,
            employees: g.employees,
            employee_statuses: g.employeeStatuses,
          };
        });
        rawRowMap = await persistRawRows(batchId, selectedCompanyId, rawRows);
      }

      // Helper to look up raw_row_id for a ShiftGroup by composite key
      const rawRowIdForGroup = (group: ShiftGroup): string | null => {
        const numericCode = group.shiftCode ? group.shiftCode.match(/^(\d+)/)?.[1] || group.shiftCode : "";
        const hash = buildShiftHash(selectedCompanyId, numericCode, group.date, group.startTime, group.endTime);
        return rawRowMap.get(hash) ?? null;
      };

      // Collected normalized rows — written in batch at the end of the import.
      const normalizedRowsAcc: NormalizedRowInput[] = [];

      // Fetch employees and clients for matching
      // Pull richer columns so the resolver can match by phone / email / external IDs
      // when an auxiliary Connecteam Users export is provided.
      setImportProgress({ current: 0, total: filteredGroups.length, phase: "Cargando maestros..." });
      const [{ data: employees }, { data: clients }] = await Promise.all([
        supabase
          .from("employees")
          .select("id, first_name, last_name, phone_number, email, employer_identification, connecteam_employee_id")
          .eq("company_id", selectedCompanyId),
        supabase.from("clients").select("id, name").eq("company_id", selectedCompanyId).is("deleted_at", null),
      ]);
      const empList = employees ?? [];
      const clientList = clients ?? [];

      // Robust resolver: priorities = aux_bridge → exact_name → reversed_name → fuzzy.
      // Aux records (if any) come from the optional Connecteam Users export the
      // operator uploaded in Step 1 and bridge name → phone/email/Connecteam ID → empId.
      const resolver = new EmployeeResolver(empList, auxUsers.length > 0 ? auxUsers : null);

      const clientMap = new Map<string, string>();
      clientList.forEach(c => clientMap.set(c.name.toLowerCase(), c.id));

      const matchClient = (jobName: string): string | null => {
        if (!jobName) return null;
        const jobLower = jobName.toLowerCase();
        if (clientMap.has(jobLower)) return clientMap.get(jobLower)!;
        const stripped = jobName.replace(/^\d+\s*[-–]\s*/, "").trim().toLowerCase();
        for (const [key, id] of clientMap.entries()) {
          if (key === stripped || stripped.includes(key) || key.includes(stripped)) return id;
        }
        return null;
      };

      // ── Auto-create unmatched clients ──
      setImportProgress({ current: 0, total: filteredGroups.length, phase: "Creando clientes nuevos..." });
      const allJobNames = new Set(filteredGroups.map(g => g.job).filter(Boolean));
      let createdClients = 0;
      for (const jobName of allJobNames) {
        if (matchClient(jobName)) continue;
        const cleanName = jobName.replace(/^\d+\s*[-–]\s*/, "").trim() || jobName;
        const { data: newClient } = await supabase.from("clients").insert({
          company_id: selectedCompanyId,
          name: cleanName,
          notes: `Creado automáticamente desde importación de Connecteam (original: "${jobName}")`,
        } as any).select("id, name").single();
        if (newClient) {
          clientMap.set(cleanName.toLowerCase(), newClient.id);
          clientMap.set(jobName.toLowerCase(), newClient.id);
          createdClients++;
        }
      }

      // Pre-resolve every name in the file to populate telemetry/ambiguous state.
      // Auto-create is intentionally disabled: unmatched names must stay in review.
      setImportProgress({ current: 0, total: filteredGroups.length, phase: "Resolviendo empleados..." });
      const allEmpNames = new Set(filteredGroups.flatMap(g => g.employees));
      const targetGroups = filteredGroups.filter(g => {
        const numericCode = g.shiftCode ? g.shiftCode.match(/^(\d+)/)?.[1] || g.shiftCode : "";
        return numericCode === TARGET_SHIFT_CODE && TARGET_DATES.has(g.date) && g.job.trim().toLowerCase() === TARGET_CLIENT_NAME;
      });
      const targetDiagnostics = new Map<string, TargetShiftDiagnostic>();
      // Cache resolution per name to avoid double-counting telemetry.
      const resolveCache = new Map<string, { id: string | null; ambiguous: boolean; method: MatchMethod | null }>();
      const resolveOnce = (name: string): { id: string | null; ambiguous: boolean; method: MatchMethod | null } => {
        const cached = resolveCache.get(name);
        if (cached) return cached;
        const ambiguousBefore = resolver.ambiguous.length;
        const r = resolver.resolveByName(name);
        const ambiguousAfter = resolver.ambiguous.length;
        const result = { id: r?.employeeId ?? null, ambiguous: ambiguousAfter > ambiguousBefore, method: r?.method ?? null };
        resolveCache.set(name, result);
        return result;
      };

      for (const empName of allEmpNames) {
        if (/^system\s/i.test(empName)) continue;
        resolveOnce(empName);
      }

      let totalShifts = 0;
      let totalAssignments = 0;
      let matchedEmployees = 0;
      let unmatchedEmployeesSet = new Set<string>();
      let matchedClients = 0;
      let unmatchedClientsSet = new Set<string>();
      const assignmentFailures: AssignmentFailure[] = [];

      /** Helper: build the shift-context fields from a ShiftGroup. */
      const failureCtx = (group: ShiftGroup) => {
        const numericCode = group.shiftCode ? group.shiftCode.match(/^(\d+)/)?.[1] || group.shiftCode : "";
        return {
          shift_code: numericCode,
          date: group.date,
          start_time: group.startTime,
          end_time: group.endTime,
          client: group.job,
        };
      };

      // ── Fetch existing shifts for deduplication (composite key) ──
      // Store shift_id + slots so we can reconcile assignments for shifts that already exist.
      setImportProgress({ current: 0, total: filteredGroups.length, phase: "Verificando duplicados..." });
      const existingShiftMap = new Map<string, { id: string; slots: number }>();
      {
        const { data: existingShifts } = await supabase
          .from("scheduled_shifts")
          .select("id, shift_code, date, start_time, end_time, slots")
          .eq("company_id", selectedCompanyId)
          .is("deleted_at", null)
          .gte("date", filterFrom || "1900-01-01")
          .lte("date", filterTo || "2100-12-31");
        (existingShifts ?? []).forEach(s => {
          const key = `${s.shift_code || ""}|${s.date}|${s.start_time?.slice(0,5)}|${s.end_time?.slice(0,5)}`;
          existingShiftMap.set(key, { id: s.id, slots: s.slots ?? 1 });
        });
      }

      for (const group of targetGroups) {
        const numericCode = group.shiftCode ? group.shiftCode.match(/^(\d+)/)?.[1] || group.shiftCode : "";
        const dedupKeyExcel = `${numericCode}|${group.date}|${group.startTime}|${group.endTime}`;
        const existing = existingShiftMap.get(dedupKeyExcel);
        targetDiagnostics.set(group.key, {
          date: group.date,
          shiftCode: numericCode,
          job: group.job,
          groupKey: group.key,
          dedupKeyExcel,
          dedupKeyDb: existing ? dedupKeyExcel : null,
          existingShiftId: existing?.id ?? null,
          enteredReconcile: false,
          employees: [...group.employees],
          employeeStatuses: [...group.employeeStatuses],
          employeesDiagnostic: [],
        });
      }

      const BATCH_SIZE = 10;
      let skippedDuplicates = 0; // legacy counter — kept but no longer incremented (we now reconcile)
      let reconciledShifts = 0;
      let reconciledAssignments = 0;
      let skippedExistingAssignments = 0;

      // Helper: reconcile a single existing shift (idempotent assignment merge)
      const reconcileExistingShift = async (
        existingShiftId: string,
        existingSlots: number,
        group: ShiftGroup,
      ) => {
        // ── Targeted instrumentation for shift_code = 45678 ──
        const numericCodeForDiag = group.shiftCode ? group.shiftCode.match(/^(\d+)/)?.[1] || group.shiftCode : "";
        const isTarget = numericCodeForDiag === TARGET_SHIFT_CODE && TARGET_DATES.has(group.date);
        const diag = isTarget ? targetDiagnostics.get(group.key) ?? null : null;
        if (diag) {
          diag.enteredReconcile = true;
          diag.existingShiftId = existingShiftId;
          diag.dedupKeyDb = `${numericCodeForDiag}|${group.date}|${group.startTime}|${group.endTime}`;
        }
        // Track client/employee match stats just like fresh inserts
        const clientId = matchClient(group.job);
        if (clientId) matchedClients++;
        else if (group.job) unmatchedClientsSet.add(group.job);

        const realEmployees = group.employees.filter(e => !/^system\s/i.test(e));

        // Resolve employee IDs from this group
        type Resolved = { empId: string; status: string; rawName: string };
        const resolved: Resolved[] = [];
        for (let ei = 0; ei < group.employees.length; ei++) {
          const empName = group.employees[ei];
          const statusRaw = (group.employeeStatuses[ei] || "").trim();
          if (/^system\s/i.test(empName)) {
            if (diag) diag.employeesDiagnostic.push({
              rawName: empName, normalizedName: normalizeName(empName), statusFromExcel: statusRaw,
              matchMethod: null, employeeId: null, ambiguous: false, unmatched: false,
              insertAttempt: "no", assignmentResult: "skipped", reason: "system user",
            });
            continue;
          }
          const r = resolveOnce(empName);
          if (!r.id) {
            unmatchedEmployeesSet.add(empName);
            assignmentFailures.push(buildFailure({
              ...failureCtx(group),
              raw_employee_name: empName,
              employee_id: null,
              match_method: null,
              failure_type: r.ambiguous ? "ambiguous_employee" : "unmatched_employee",
              error_message: r.ambiguous
                ? "Ambiguous match — multiple workers matched this name."
                : "No worker matched this name in the directory.",
            }));
            if (diag) diag.employeesDiagnostic.push({
              rawName: empName, normalizedName: normalizeName(empName), statusFromExcel: statusRaw,
              matchMethod: null, employeeId: null, ambiguous: r.ambiguous, unmatched: !r.ambiguous,
              insertAttempt: "no", assignmentResult: "skipped",
              reason: r.ambiguous ? "ambiguous match — not auto-resolved" : "no employee match (resolveByName=null)",
            });
            continue;
          }
          matchedEmployees++;
          const empStatus = (group.employeeStatuses[ei] || "").toLowerCase();
          const statusMap: Record<string, string> = { accept: "accepted", decline: "rejected" };
          resolved.push({ empId: r.id, status: statusMap[empStatus] ?? "accepted", rawName: empName });
          if (diag) diag.employeesDiagnostic.push({
            rawName: empName, normalizedName: normalizeName(empName), statusFromExcel: statusRaw,
            matchMethod: r.method, employeeId: r.id, ambiguous: false, unmatched: false,
            insertAttempt: "no", assignmentResult: "pending", reason: null,
          });
        }

        if (resolved.length === 0) {
          reconciledShifts++;
          return;
        }

        // Fetch existing assignments for this shift (active only)
        const { data: existingAssigns } = await supabase
          .from("shift_assignments")
          .select("id, employee_id, status")
          .eq("shift_id", existingShiftId);

        const existingByEmp = new Map<string, { id: string; status: string }>();
        (existingAssigns ?? []).forEach(a => {
          existingByEmp.set(a.employee_id, { id: a.id, status: a.status });
        });

        // Insert missing assignments one-by-one (overlap trigger may reject some)
        for (const r of resolved) {
          const existing = existingByEmp.get(r.empId);
          const diagRow = diag?.employeesDiagnostic.find(d => d.employeeId === r.empId && d.assignmentResult === "pending");
          if (existing) {
            // Already assigned — only promote pending → accepted/rejected if Excel says so
            if (existing.status === "pending" && (r.status === "accepted" || r.status === "rejected")) {
              if (isDryRun) {
                reconciledAssignments++;
                if (diagRow) { diagRow.insertAttempt = "no"; diagRow.assignmentResult = "would_update"; diagRow.reason = `dry-run: pending → ${r.status}`; }
              } else {
                const { error: updErr } = await supabase
                  .from("shift_assignments")
                  .update({ status: r.status })
                  .eq("id", existing.id);
                if (!updErr) {
                  reconciledAssignments++;
                  if (diagRow) { diagRow.insertAttempt = "no"; diagRow.assignmentResult = "updated"; diagRow.reason = `pending → ${r.status}`; }
                } else {
                  skippedExistingAssignments++;
                  if (diagRow) { diagRow.insertAttempt = "no"; diagRow.assignmentResult = "update_error"; diagRow.reason = updErr.message; }
                }
              }
            } else {
              skippedExistingAssignments++;
              if (diagRow) { diagRow.insertAttempt = "no"; diagRow.assignmentResult = "skipped_existing"; diagRow.reason = `already ${existing.status}`; }
            }
            continue;
          }
          if (isDryRun) {
            // Dry-run: count what we WOULD do without writing.
            reconciledAssignments++;
            if (diagRow) { diagRow.insertAttempt = "no"; diagRow.assignmentResult = "would_insert"; diagRow.reason = "dry-run: assignment not written"; }
            continue;
          }
          try {
            const { error } = await supabase.from("shift_assignments").insert({
              company_id: selectedCompanyId,
              shift_id: existingShiftId,
              employee_id: r.empId,
              status: r.status,
              import_batch_id: batchId,
            } as any);
            if (diagRow) diagRow.insertAttempt = "yes";
            if (!error) {
              reconciledAssignments++;
              if (diagRow) { diagRow.assignmentResult = "inserted"; diagRow.reason = null; }
            } else {
              if (diagRow) { diagRow.assignmentResult = "insert_error"; diagRow.reason = error.message; }
              assignmentFailures.push(buildFailure({
                ...failureCtx(group),
                raw_employee_name: r.rawName,
                employee_id: r.empId,
                match_method: diagRow?.matchMethod ?? null,
                failure_type: classifySupabaseError(error.message),
                error_message: error.message,
              }));
            }
          } catch (ex: any) {
            const exMsg = ex?.message ?? String(ex);
            if (diagRow) { diagRow.insertAttempt = "yes"; diagRow.assignmentResult = "insert_exception"; diagRow.reason = exMsg; }
            assignmentFailures.push(buildFailure({
              ...failureCtx(group),
              raw_employee_name: r.rawName,
              employee_id: r.empId,
              match_method: diagRow?.matchMethod ?? null,
              failure_type: classifySupabaseError(exMsg),
              error_message: exMsg,
            }));
          }
        }

        // Grow slots only if the Excel brings more real employees than current capacity.
        // Always stamp traceability fields (idempotent — safe on every reconcile pass).
        const numericCodeForHash = group.shiftCode ? group.shiftCode.match(/^(\d+)/)?.[1] || group.shiftCode : "";
        const reconHash = buildShiftHash(selectedCompanyId, numericCodeForHash, group.date, group.startTime, group.endTime);
        const updatePayload: any = {
          reconciliation_hash: reconHash,
        };
        if (batchId) updatePayload.import_batch_id = batchId;
        if (realEmployees.length > existingSlots) updatePayload.slots = realEmployees.length;
        await supabase
          .from("scheduled_shifts")
          .update(updatePayload)
          .eq("id", existingShiftId);

        // Mapping + normalized rows (one per resolved employee + one per unmatched name)
        if (batchId) {
          await upsertShiftMapping(selectedCompanyId, {
            reconciliationHash: reconHash,
            staflyShiftId: existingShiftId,
            matchStatus: "reconciled",
            rawRowId: rawRowIdForGroup(group),
            rawData: { job: group.job, employees: group.employees },
          });
          const rrid = rawRowIdForGroup(group);
          if (rrid) {
            for (let ei = 0; ei < group.employees.length; ei++) {
              const empName = group.employees[ei];
              if (/^system\s/i.test(empName)) continue;
              const r = resolveOnce(empName);
              normalizedRowsAcc.push({
                rawRowId: rrid,
                matchedEmployeeId: r.id,
                employeeNameRaw: empName,
                employeeNameNormalized: normalizeName(empName),
                matchConfidence: r.id ? 1 : 0,
                matchMethod: r.method ?? null,
                workDate: group.date,
                startTime: group.startTime,
                endTime: group.endTime,
                shiftTitle: group.job,
                externalShiftId: numericCodeForHash,
                clientName: group.job,
                payType: "hourly",
                status: r.id ? "matched" : (r.ambiguous ? "ambiguous" : "unmatched"),
              });
            }
          }
        }

        reconciledShifts++;
      };

      for (let batchStart = 0; batchStart < filteredGroups.length; batchStart += BATCH_SIZE) {
        const batch = filteredGroups.slice(batchStart, batchStart + BATCH_SIZE);

        setImportProgress({
          current: Math.min(batchStart + BATCH_SIZE, filteredGroups.length),
          total: filteredGroups.length,
          phase: `Importando turnos ${batchStart + 1}-${Math.min(batchStart + BATCH_SIZE, filteredGroups.length)}...`,
        });

        // Split: existing (reconcile) vs new (insert)
        const newBatch: typeof batch = [];
        const shiftPayloads: any[] = [];
        for (const group of batch) {
          // Composite dedup key using cleaned numeric code to match what's stored in DB
          const numericCodeForDedup = group.shiftCode ? group.shiftCode.match(/^(\d+)/)?.[1] || group.shiftCode : "";
          const dedupKey = `${numericCodeForDedup}|${group.date}|${group.startTime}|${group.endTime}`;
          const existing = existingShiftMap.get(dedupKey);
          if (existing) {
            // FIX #1: do NOT skip — reconcile assignments idempotently
            await reconcileExistingShift(existing.id, existing.slots, group);
            continue;
          }

          const clientId = matchClient(group.job);
          if (clientId) matchedClients++;
          else if (group.job) unmatchedClientsSet.add(group.job);

          // Clean shift code: extract only the leading numeric part
          const numericCode = group.shiftCode ? group.shiftCode.match(/^(\d+)/)?.[1] || group.shiftCode : null;

          // Title is kept clean — `shift_code` is the single source of truth and is rendered
          // as a separate `#0001` chip by the cards/headers. Do NOT bake the code into the title.
          let title = "";
          if (group.job) {
            const cleanJob = group.job.replace(/^\d+\s*[-–]\s*/, "").trim();
            title += cleanJob;
          }
          if (group.subItem) title += ` - ${group.subItem}`;
          if (!title.trim()) title = "Turno importado";

          // Auto-detect daily pay type for weekend jobs
          const titleLower = title.toLowerCase();
          const isWeekendJob = /weekend\s*j[oa]b/i.test(group.subItem) || /weekend\s*j[oa]b/i.test(group.job) || /weekend\s*j[oa]b/i.test(titleLower);

          // Count real employees (exclude SYSTEM users)
          const realEmployees = group.employees.filter(e => !/^system\s/i.test(e));

          // Map shift status from employee statuses
          // If all employees accepted → confirmed, if mixed → open, if none → open
          const empStatuses = group.employeeStatuses || [];
          let shiftStatus = "open";
          if (realEmployees.length > 0) {
            const allAccepted = empStatuses.every(s => s.toLowerCase() === "accept");
            const anyDeclined = empStatuses.some(s => s.toLowerCase() === "decline");
            if (allAccepted && empStatuses.length === realEmployees.length) {
              shiftStatus = "confirmed";
            } else if (anyDeclined && empStatuses.filter(s => s.toLowerCase() === "accept").length === 0) {
              shiftStatus = "cancelled";
            }
          }

          const reconHash = buildShiftHash(selectedCompanyId, numericCode || "", group.date, group.startTime, group.endTime);
          shiftPayloads.push({
            company_id: selectedCompanyId,
            title: title.trim(),
            date: group.date,
            start_time: group.startTime,
            end_time: group.endTime,
            client_id: clientId,
            notes: group.note || null,
            meeting_point: group.address || null,
            shift_code: numericCode || null,
            status: shiftStatus,
            slots: realEmployees.length || 1,
            claimable: false,
            pay_type: isWeekendJob ? "daily" : "hourly",
            // Fase 4 traceability stamps
            reconciliation_hash: reconHash,
            created_by: user?.id ?? null,
            ...(batchId ? { import_batch_id: batchId } : {}),
          });
          newBatch.push(group);
          existingShiftMap.set(`${numericCode || ""}|${group.date}|${group.startTime}|${group.endTime}`, { id: "__pending__", slots: realEmployees.length || 1 });
        }

        if (shiftPayloads.length === 0) {
          await new Promise(resolve => setTimeout(resolve, 30));
          continue;
        }

        const { data: insertedShifts, error: shiftErr } = await supabase
          .from("scheduled_shifts")
          .insert(shiftPayloads)
          .select("id");

        if (shiftErr || !insertedShifts) {
          console.error("Batch shift insert error:", shiftErr);
          continue;
        }

        totalShifts += insertedShifts.length;

        // ── Fase 4: write mapping rows for each newly inserted shift ──
        if (batchId) {
          for (let mi = 0; mi < newBatch.length; mi++) {
            const g = newBatch[mi];
            const sh = insertedShifts[mi];
            if (!sh) continue;
            const numericCodeM = g.shiftCode ? g.shiftCode.match(/^(\d+)/)?.[1] || g.shiftCode : "";
            const reconHashM = buildShiftHash(selectedCompanyId, numericCodeM, g.date, g.startTime, g.endTime);
            await upsertShiftMapping(selectedCompanyId, {
              reconciliationHash: reconHashM,
              staflyShiftId: sh.id,
              matchStatus: "created",
              rawRowId: rawRowIdForGroup(g),
              rawData: { job: g.job, employees: g.employees },
            });
          }
        }

        // Create assignments for each shift in the batch
        const assignmentPayloads: any[] = [];
        // Parallel meta array — same index → same payload — for failure attribution
        const assignmentMeta: Array<{ group: ShiftGroup; rawName: string; method: MatchMethod | null }> = [];
        for (let i = 0; i < newBatch.length; i++) {
          const group = newBatch[i];
          const shift = insertedShifts[i];
          if (!shift) continue;
          const numericCodeN = group.shiftCode ? group.shiftCode.match(/^(\d+)/)?.[1] || group.shiftCode : "";
          const rrid = rawRowIdForGroup(group);

          for (let ei = 0; ei < group.employees.length; ei++) {
            const empName = group.employees[ei];
            if (/^system\s/i.test(empName)) continue;
            const r = resolveOnce(empName);
            // Persist a normalized row for EVERY name in the source — matched or not.
            // This is the key Fase 4 invariant: never lose a name from the file.
            if (rrid) {
              normalizedRowsAcc.push({
                rawRowId: rrid,
                matchedEmployeeId: r.id,
                employeeNameRaw: empName,
                employeeNameNormalized: normalizeName(empName),
                matchConfidence: r.id ? 1 : 0,
                matchMethod: r.method ?? null,
                workDate: group.date,
                startTime: group.startTime,
                endTime: group.endTime,
                shiftTitle: group.job,
                externalShiftId: numericCodeN,
                clientName: group.job,
                payType: "hourly",
                status: r.id ? "matched" : (r.ambiguous ? "ambiguous" : "unmatched"),
              });
            }
            if (!r.id) {
              unmatchedEmployeesSet.add(empName);
              assignmentFailures.push(buildFailure({
                ...failureCtx(group),
                raw_employee_name: empName,
                employee_id: null,
                match_method: null,
                failure_type: r.ambiguous ? "ambiguous_employee" : "unmatched_employee",
                error_message: r.ambiguous
                  ? "Ambiguous match — multiple workers matched this name."
                  : "No worker matched this name in the directory.",
              }));
              continue;
            }
            matchedEmployees++;
            const empStatus = (group.employeeStatuses[ei] || "").toLowerCase();
            const statusMap: Record<string, string> = { accept: "accepted", decline: "rejected" };
            const assignStatus = statusMap[empStatus] ?? "accepted";
            assignmentPayloads.push({
              company_id: selectedCompanyId,
              shift_id: shift.id,
              employee_id: r.id,
              status: assignStatus,
              ...(batchId ? { import_batch_id: batchId } : {}),
            });
            assignmentMeta.push({ group, rawName: empName, method: r.method });
          }
        }

        // Insert assignments in sub-batches to handle overlap errors gracefully
        if (assignmentPayloads.length > 0) {
          const { data: assignResult, error: assignErr } = await supabase
            .from("shift_assignments")
            .insert(assignmentPayloads)
            .select("id");

          if (assignErr) {
            // Batch failed (overlap, not_ready, dup, etc.) — retry one-by-one to capture
            // the exact failure_type per assignment.
            for (let pi = 0; pi < assignmentPayloads.length; pi++) {
              const payload = assignmentPayloads[pi];
              const meta = assignmentMeta[pi];
              try {
                const { error } = await supabase.from("shift_assignments").insert(payload);
                if (!error) {
                  totalAssignments++;
                } else {
                  assignmentFailures.push(buildFailure({
                    ...failureCtx(meta.group),
                    raw_employee_name: meta.rawName,
                    employee_id: payload.employee_id,
                    match_method: meta.method,
                    failure_type: classifySupabaseError(error.message),
                    error_message: error.message,
                  }));
                }
              } catch (ex: any) {
                const exMsg = ex?.message ?? String(ex);
                assignmentFailures.push(buildFailure({
                  ...failureCtx(meta.group),
                  raw_employee_name: meta.rawName,
                  employee_id: payload.employee_id,
                  match_method: meta.method,
                  failure_type: classifySupabaseError(exMsg),
                  error_message: exMsg,
                }));
              }
            }
          } else {
            totalAssignments += assignResult?.length ?? 0;
          }
        }

        // Yield to UI thread
        await new Promise(resolve => setTimeout(resolve, 30));
      }

      // ── Fase 4: persist normalized rows accumulated during the import ──
      if (batchId && normalizedRowsAcc.length > 0) {
        setImportProgress({ current: filteredGroups.length, total: filteredGroups.length, phase: "Guardando filas normalizadas..." });
        await persistNormalizedRows(batchId, selectedCompanyId, normalizedRowsAcc);
      }

      // Handle unavailability records
      setImportProgress({ current: filteredGroups.length, total: filteredGroups.length, phase: "Procesando indisponibilidades..." });
      let totalUnavailable = 0;
      const filteredUnavail = unavailableRecords.filter(u => {
        if (filterFrom && u.date < filterFrom) return false;
        if (filterTo && u.date > filterTo) return false;
        return true;
      });

      // Batch unavailability inserts
      const unavailPayloads: any[] = [];
      for (const u of filteredUnavail) {
        const name = parseName(u.name);
        if (!name) continue;
        const r = resolveOnce(`${name.first} ${name.last}`);
        if (!r.id) continue;
        unavailPayloads.push({
          employee_id: r.id,
          company_id: selectedCompanyId,
          date: u.date,
          is_available: false,
          reason: "Importado desde Connecteam (Schedule)",
          source: "import",
        });
      }

      if (unavailPayloads.length > 0) {
        for (let i = 0; i < unavailPayloads.length; i += 50) {
          const batch = unavailPayloads.slice(i, i + 50);
          try {
            const { data } = await supabase.from("employee_availability_overrides")
              .upsert(batch as any, { onConflict: "employee_id,date" })
              .select("id");
            totalUnavailable += data?.length ?? batch.length;
          } catch { /* skip */ }
        }
      }

      const summaryData: ImportSummary = {
        totalShifts,
        totalAssignments,
        totalUnavailable,
        matchedEmployees,
        unmatchedEmployees: Array.from(unmatchedEmployeesSet),
        matchedClients,
        unmatchedClients: Array.from(unmatchedClientsSet),
        reconciledShifts,
        reconciledAssignments,
        skippedExistingAssignments,
        matchTelemetry: { ...resolver.telemetry },
        ambiguousMatches: [...resolver.ambiguous],
        auxUsersLoaded: auxUsers.length,
        targetGroupCount: targetGroups.length,
        targetShiftDiagnostics: Array.from(targetDiagnostics.values()),
        assignmentFailures,
        // Fase 4.1
        batchId,
        batchStatus: "in_progress",
        totalRowsProcessed: filteredGroups.length,
        shiftsCreated: totalShifts,
        shiftsUpdated: reconciledShifts,
        normalizedRows: normalizedRowsAcc,
      };
      setSummary(summaryData);
      console.info("[ImportSchedule] Match telemetry:", resolver.telemetry, "ambiguous:", resolver.ambiguous.length);

      // ── Targeted console.table for shift_code 45678 ──
      if (summaryData.targetShiftDiagnostics.length > 0) {
        console.info(`[ImportSchedule][45678] groups detected: ${summaryData.targetShiftDiagnostics.length}`);
        for (const d of summaryData.targetShiftDiagnostics) {
          console.info(`[ImportSchedule][45678] ${d.date} ${d.job} | dedupKeyExcel=${d.dedupKeyExcel} | dedupKeyDb=${d.dedupKeyDb ?? "—"} | existingShiftId=${d.existingShiftId ?? "—"} | enteredReconcile=${d.enteredReconcile} | employees(${d.employees.length})`);
          // eslint-disable-next-line no-console
          console.table(d.employeesDiagnostic);
        }
      } else {
        console.warn("[ImportSchedule][45678] No target groups found in parsed file (shift_code 45678 + target dates).");
      }

      const createdEmployees = 0;
      const createdMsg = createdClients > 0
        ? ` · ${createdClients} clientes creados`
        : "";
      const unmatchedMsg = summaryData.unmatchedEmployees.length > 0
        ? ` · ${summaryData.unmatchedEmployees.length} empleados no encontrados`
        : "";
      const unavailMsg = totalUnavailable > 0 ? ` · ${totalUnavailable} indisponibilidades` : "";
      const dupMsg = skippedDuplicates > 0 ? ` · ${skippedDuplicates} duplicados omitidos` : "";
      const reconciledMsg = (reconciledShifts > 0 || reconciledAssignments > 0)
        ? ` · ${reconciledShifts} turnos reconciliados, ${reconciledAssignments} asignaciones nuevas (${skippedExistingAssignments} ya existían)`
        : "";

      // ── Record this import to prevent duplicate file uploads ──
      const recordedFileNames = files.length > 0 ? files.map(f => f.name) : (file ? [file.name] : []);
      if (recordedFileNames.length > 0) {
        const { data: existingSetting } = await supabase
          .from("company_settings")
          .select("id, value")
          .eq("company_id", selectedCompanyId)
          .eq("key", "imported_schedule_files")
          .single();
        const prevFiles: string[] = existingSetting?.value ? (Array.isArray(existingSetting.value) ? existingSetting.value as string[] : []) : [];
        const newFiles = [...prevFiles, ...recordedFileNames];
        if (existingSetting) {
          await supabase.from("company_settings").update({ value: newFiles as any }).eq("id", existingSetting.id);
        } else {
          await supabase.from("company_settings").insert({
            company_id: selectedCompanyId,
            key: "imported_schedule_files",
            value: newFiles as any,
          } as any);
        }
      }

      const totalCreated = totalAssignments + reconciledAssignments;
      const blocked = assignmentFailures.length;
      const baseMsg = blocked > 0
        ? `Importación finalizada con advertencias: ${totalCreated} asignaciones creadas, ${blocked} bloqueadas.`
        : `Importación completada: ${totalShifts} turnos, ${totalAssignments} asignaciones${createdMsg}${unmatchedMsg}${unavailMsg}${dupMsg}${reconciledMsg}.`;

      // ── Fase 4: finalize the import_batch with the final counters ──
      if (batchId) {
        await finalizeImportBatch(batchId, {
          shiftsCreated: totalShifts,
          shiftsReconciled: reconciledShifts,
          assignmentsCreated: totalAssignments + reconciledAssignments,
          duplicatesSkipped: skippedDuplicates,
          clientsCreated: createdClients,
          unmatchedEmployees: Array.from(unmatchedEmployeesSet),
          warnings: assignmentFailures.slice(0, 50),
        });
      }
      setSummary(prev => prev ? { ...prev, batchStatus: "completed" } : prev);

      setResult({
        success: blocked === 0,
        message: baseMsg,
      });
      setStep(4);
    } catch (err: any) {
      console.error("[ImportSchedule] Import failed:", err);
      // Mark the batch as failed so it doesn't appear as a successful import
      try {
        if (batchIdForCatch) await failImportBatch(batchIdForCatch, err?.message ?? String(err));
      } catch { /* ignore secondary errors */ }
      setSummary(prev => prev ? { ...prev, batchStatus: "failed" } : prev);
      setResult({ success: false, message: getUserFriendlyError(err) });
      setStep(4); // ensure user sees the result/error screen instead of being stuck on Step 3
      toast({ title: "Error", description: getUserFriendlyError(err), variant: "destructive" });
    }

    setImporting(false);
    setImportProgress(null);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        variant="3"
        title="Importar Turnos Programados"
        subtitle="Schedule Export de Connecteam → Turnos y asignaciones"
      />

      {/* Instructions */}
      <details className="rounded-2xl border bg-card group">
        <summary className="flex items-center gap-3 p-4 cursor-pointer text-sm font-medium text-foreground select-none">
          <Info className="h-4 w-4 text-primary shrink-0" />
          Instrucciones de importación
          <ChevronDown className="h-4 w-4 text-muted-foreground ml-auto transition-transform group-open:rotate-180" />
        </summary>
        <div className="px-4 pb-4 text-sm text-muted-foreground space-y-1 border-t pt-3 mx-4">
          <ul className="list-disc list-inside space-y-0.5 text-xs">
            <li>Sube el archivo <strong>Schedule Export</strong> de Connecteam (.xlsx)</li>
            <li>Se crean <strong>turnos programados</strong> (scheduled_shifts) con asignaciones</li>
            <li>Los <strong>Jobs</strong> se emparejan con clientes existentes</li>
            <li>Los empleados se emparejan por nombre completo</li>
            <li>Las filas <strong>Unavailable</strong> se importan como indisponibilidades</li>
            <li>Puedes filtrar por rango de fechas antes de importar</li>
          </ul>
        </div>
      </details>

      {/* Steps */}
      <div className="flex items-center gap-1.5">
        {[
          { n: 1, label: "Archivo" },
          { n: 2, label: "Hoja" },
          { n: 3, label: "Revisión" },
          { n: 4, label: "Resultado" },
        ].map((s, i) => (
          <React.Fragment key={s.n}>
            {i > 0 && <div className={`h-px flex-1 ${step >= s.n ? "bg-primary" : "bg-border"}`} />}
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              step === s.n ? "bg-primary text-primary-foreground" : step > s.n ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
            }`}>
              <span className="tabular-nums">{s.n}</span>
              <span className="hidden sm:inline">{s.label}</span>
            </div>
          </React.Fragment>
        ))}
      </div>

      {/* Step 1: Upload */}
      {step === 1 && (
        <Card>
          <CardHeader><CardTitle>Paso 1: Selecciona los archivos de Schedule Export</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Archivos XLSX de Schedule Export (puedes seleccionar varios)</Label>
              <div className="mt-1 border-2 border-dashed border-border rounded-xl p-8 text-center hover:border-primary/50 transition-colors">
                {parsingFiles ? (
                  <>
                    <FileSpreadsheet className="h-8 w-8 mx-auto text-primary mb-2 animate-pulse" />
                    <p className="text-sm font-medium">Procesando {files.length} archivo(s)…</p>
                    <p className="text-xs text-muted-foreground mt-1">Analizando y fusionando turnos</p>
                  </>
                ) : (
                  <>
                    <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                    <p className="text-xs text-muted-foreground mb-2">Arrastra o selecciona tus archivos Schedule Export de Connecteam</p>
                    <input type="file" accept={ACCEPTED_EXTENSIONS} multiple onChange={handleFileUpload} className="block w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-primary file:text-primary-foreground file:font-medium hover:file:bg-primary/90 cursor-pointer" />
                  </>
                )}
              </div>
            </div>

            {/* Optional: Connecteam Users export → enriches matching */}
            <div className="rounded-xl border border-dashed border-border p-4 bg-muted/30">
              <div className="flex items-start gap-3">
                <Users className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">Mapa auxiliar (opcional)</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Sube el export de <strong>Users</strong> de Connecteam para matchear empleados por phone, email o Connecteam ID además del nombre. Recomendado cuando hay variaciones de nombre.
                  </p>
                  {auxFileName ? (
                    <div className="mt-2 flex items-center gap-2">
                      <Badge variant="secondary" className="text-[10px]">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        {auxFileName} · {auxUsers.length} usuarios
                      </Badge>
                      <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => { setAuxUsers([]); setAuxFileName(null); }}>
                        Quitar
                      </Button>
                    </div>
                  ) : parsingAux ? (
                    <p className="text-xs text-muted-foreground mt-2 animate-pulse">Procesando…</p>
                  ) : (
                    <input
                      type="file"
                      accept={ACCEPTED_EXTENSIONS}
                      onChange={handleAuxUpload}
                      className="block mt-2 text-xs text-muted-foreground file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border file:border-border file:bg-background file:text-foreground file:font-medium hover:file:bg-muted cursor-pointer"
                    />
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2 skipped in multi-file mode */}

      {/* Step 3: Review & Import */}
      {step === 3 && (
        <div className="space-y-4">
          {/* Files loaded */}
          {files.length > 1 && (
            <Card className="p-4">
              <p className="text-xs font-medium text-muted-foreground mb-2">Archivos cargados ({files.length})</p>
              <div className="flex flex-wrap gap-1.5">
                {files.map((f, i) => (
                  <Badge key={i} variant="secondary" className="text-[10px]">
                    <FileSpreadsheet className="h-3 w-3 mr-1" />{f.name}
                  </Badge>
                ))}
              </div>
            </Card>
          )}

          {/* Aux mapping status */}
          {auxFileName && (
            <Card className="p-3 border-primary/30 bg-primary/5">
              <div className="flex items-center gap-2 text-xs">
                <Users className="h-3.5 w-3.5 text-primary" />
                <span className="font-medium">Mapa auxiliar activo:</span>
                <span className="text-muted-foreground">{auxFileName} · {auxUsers.length} usuarios</span>
                <span className="text-muted-foreground ml-auto">Matching enriquecido por phone/email/Connecteam ID.</span>
              </div>
            </Card>
          )}

          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="p-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <CalendarDays className="h-4 w-4" /> Turnos
              </div>
              <p className="text-2xl font-bold tabular-nums">{filteredGroups.length}</p>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <Users className="h-4 w-4" /> Asignaciones
              </div>
              <p className="text-2xl font-bold tabular-nums">{filteredGroups.reduce((s, g) => s + g.employees.length, 0)}</p>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <Building2 className="h-4 w-4" /> Clientes únicos
              </div>
              <p className="text-2xl font-bold tabular-nums">{new Set(filteredGroups.map(g => g.job).filter(Boolean)).size}</p>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <AlertCircle className="h-4 w-4" /> Indisponibles
              </div>
              <p className="text-2xl font-bold tabular-nums">{unavailableRecords.filter(u => (!filterFrom || u.date >= filterFrom) && (!filterTo || u.date <= filterTo)).length}</p>
            </Card>
          </div>

          {/* Date filter */}
          {dateRange && (
            <Card>
              <CardContent className="p-4">
                <div className="flex flex-wrap items-end gap-4">
                  <div>
                    <Label className="text-xs">Desde</Label>
                    <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} className="block mt-1 border rounded-lg px-3 py-1.5 text-sm bg-background" />
                  </div>
                  <div>
                    <Label className="text-xs">Hasta</Label>
                    <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)} className="block mt-1 border rounded-lg px-3 py-1.5 text-sm bg-background" />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Archivo: {dateRange.from} → {dateRange.to}
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Preview table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Vista previa de turnos (primeros 20)</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                   <TableRow>
                     <TableHead className="text-xs">Código</TableHead>
                     <TableHead className="text-xs">Fecha</TableHead>
                     <TableHead className="text-xs">Horario</TableHead>
                     <TableHead className="text-xs">Cliente (Job)</TableHead>
                     <TableHead className="text-xs">Tipo</TableHead>
                     <TableHead className="text-xs">Estado</TableHead>
                     <TableHead className="text-xs">Empleados</TableHead>
                     <TableHead className="text-xs">Dirección</TableHead>
                   </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredGroups.slice(0, 20).map((g, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-xs font-mono">{g.shiftCode ? `#${g.shiftCode.padStart(4, "0")}` : "—"}</TableCell>
                      <TableCell className="text-xs">{g.date}</TableCell>
                      <TableCell className="text-xs">{g.startTime} - {g.endTime}</TableCell>
                      <TableCell className="text-xs font-medium">{g.job || "—"}</TableCell>
                      <TableCell className="text-xs">{g.subItem || "—"}</TableCell>
                      <TableCell className="text-xs">
                        <Badge variant={g.employeeStatuses.some(s => s.toLowerCase() === "accept") ? "default" : "outline"} className="text-[10px]">
                          {g.employeeStatuses[0] || "—"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">
                        <div className="flex flex-wrap gap-1">
                          {g.employees.slice(0, 3).map((e, j) => (
                            <Badge key={j} variant="secondary" className="text-[10px]">{e}</Badge>
                          ))}
                          {g.employees.length > 3 && <Badge variant="outline" className="text-[10px]">+{g.employees.length - 3}</Badge>}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs max-w-40 truncate" title={g.address}>{g.address || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {filteredGroups.length > 20 && (
                <p className="text-xs text-muted-foreground mt-2 px-1">… y {filteredGroups.length - 20} turnos más</p>
              )}
            </CardContent>
          </Card>

          {/* Inline error if Step 3 produced a result without advancing (legacy guard, etc.) */}
          {result && !result.success && (
            <Card className="border-destructive/30 bg-destructive/5">
              <CardContent className="p-4 flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-semibold">No se pudo procesar</p>
                  <p className="text-muted-foreground mt-1">{result.message}</p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Progress bar */}
          {importProgress && (
            <Card className="p-4 space-y-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{importProgress.phase}</span>
                <span className="tabular-nums">{importProgress.current} / {importProgress.total}</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-300"
                  style={{ width: `${importProgress.total > 0 ? Math.round((importProgress.current / importProgress.total) * 100) : 0}%` }}
                />
              </div>
            </Card>
          )}

          {/* Spacer so sticky bar never covers content */}
          <div className="h-24" />

          {/* Sticky action bar */}
          <div className="sticky bottom-0 -mx-4 sm:-mx-6 px-4 sm:px-6 py-3 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 z-10">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
              <p className="text-xs text-muted-foreground flex-1">
                Esto creará turnos nuevos y reconciliará asignaciones faltantes en turnos existentes. Operación idempotente: no duplica datos.
              </p>
              <div className="flex gap-2 shrink-0">
                <Button variant="outline" size="sm" onClick={() => { setStep(1); setFile(null); setFiles([]); setWorkbook(null); setShiftGroups([]); setResult(null); }}>
                  ← Cambiar archivos
                </Button>
                <Button size="sm" onClick={() => void handleImport()} disabled={importing || filteredGroups.length === 0}>
                  {importing ? "Procesando…" : `Procesar importación (${filteredGroups.length})`}
                </Button>
              </div>
            </div>
          </div>

          {/* Duplicate-file confirmation dialog */}
          <AlertDialog open={!!duplicateFileWarning} onOpenChange={(open) => { if (!open) setDuplicateFileWarning(null); }}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Archivo ya importado anteriormente</AlertDialogTitle>
                <AlertDialogDescription className="space-y-2">
                  <span className="block">
                    Detectamos que ya importaste {duplicateFileWarning?.length === 1 ? "este archivo" : "estos archivos"}:
                  </span>
                  <span className="block font-mono text-xs bg-muted rounded px-2 py-1">
                    {duplicateFileWarning?.join(", ")}
                  </span>
                  <span className="block">
                    Re-procesarlo es <strong>seguro</strong>: no se duplican turnos ni asignaciones. Solo se crearán los turnos nuevos y se reconciliarán las asignaciones faltantes en los turnos existentes (útil para corregir turnos huérfanos sin empleados asignados).
                  </span>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel onClick={() => setDuplicateFileWarning(null)}>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    setDuplicateFileWarning(null);
                    void handleImport({ force: true });
                  }}
                >
                  Re-procesar y reconciliar
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}

      {/* Step 4: Result */}
      {step === 4 && result && (
        <div className="space-y-4">
          {(() => {
            const blocked = summary?.assignmentFailures.length ?? 0;
            const isError = !result.success && blocked === 0;
            const isWarn = blocked > 0;
            const cardCls = isError
              ? "border-destructive/30 bg-destructive/5"
              : isWarn
                ? "border-warning/30 bg-warning/5"
                : "border-emerald-200 bg-emerald-50/50 dark:border-emerald-900 dark:bg-emerald-950/20";
            const iconCls = isError
              ? "h-6 w-6 text-destructive shrink-0 mt-0.5"
              : isWarn
                ? "h-6 w-6 text-warning shrink-0 mt-0.5"
                : "h-6 w-6 text-emerald-600 shrink-0 mt-0.5";
            const Icon = isError || isWarn ? AlertCircle : CheckCircle2;
            const title = isError
              ? "Error en importación"
              : isWarn
                ? "Importación finalizada con advertencias"
                : "Importación exitosa";
            return (
              <Card className={cardCls}>
                <CardContent className="p-6">
                  <div className="flex items-start gap-3">
                    <Icon className={iconCls} />
                    <div>
                      <p className="font-semibold text-sm">{title}</p>
                      <p className="text-sm text-muted-foreground mt-1">{result.message}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })()}

          {/* ── Fase 4.1: Premium traceability panel ────────────────────── */}
          {summary && (() => {
            const ambiguousCount = summary.ambiguousMatches.length;
            const unmatchedCount = summary.unmatchedEmployees.length;
            const matchedCount = summary.matchedEmployees;
            const needsReview = ambiguousCount + unmatchedCount;
            const status = summary.batchStatus;
            const statusBadge =
              status === "failed"
                ? { label: "Failed", cls: "bg-destructive/10 text-destructive border-destructive/30" }
                : status === "in_progress"
                  ? { label: "In progress", cls: "bg-muted text-muted-foreground border-border" }
                  : needsReview > 0
                    ? { label: "Completed · needs review", cls: "bg-warning/10 text-warning border-warning/30" }
                    : { label: "Completed", cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30" };

            const downloadUnmatchedCsv = () => {
              const reviewRows = summary.normalizedRows.filter(r => /match_status=(unmatched|ambiguous)/.test(r.notes ?? ""));
              if (reviewRows.length === 0) {
                toast({ title: "No hay filas para revisar", description: "Todos los empleados quedaron emparejados." });
                return;
              }
              const headers = [
                "employee_name_raw",
                "shift_code",
                "work_date",
                "start_time",
                "end_time",
                "client_name_raw",
                "match_status",
                "notes",
              ];
              const escape = (v: string) => `"${String(v ?? "").replace(/"/g, '""')}"`;
              const lines = [headers.join(",")];
              for (const r of reviewRows) {
                const status = /match_status=ambiguous/.test(r.notes ?? "") ? "ambiguous" : "unmatched";
                lines.push([
                  r.employeeNameRaw,
                  r.externalShiftId,
                  r.workDate,
                  r.startTime,
                  r.endTime,
                  r.clientName,
                  status,
                  (r.notes ?? "").replace(/\s*\|\s*match_status=\w+/, "").trim(),
                ].map(escape).join(","));
              }
              const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `unmatched_${summary.batchId ?? "import"}_${new Date().toISOString().slice(0, 10)}.csv`;
              a.click();
              URL.revokeObjectURL(url);
              toast({ title: "CSV descargado", description: `${reviewRows.length} filas para revisión.` });
            };

            const goToOrphanShifts = () => {
              const params = new URLSearchParams();
              if (summary.batchId) params.set("import_batch", summary.batchId);
              params.set("review", "needs_review");
              navigate(`/app/shifts?${params.toString()}`);
            };

            return (
              <Card className="border-primary/20 bg-gradient-to-br from-background to-muted/30">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <CardTitle className="text-base">Resumen del import</CardTitle>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Trazabilidad completa del lote. Toda fila importada quedó persistida y es recuperable.
                      </p>
                    </div>
                    <Badge variant="outline" className={`text-[11px] ${statusBadge.cls}`}>
                      {statusBadge.label}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Big-number tiles */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                    <div className="rounded-lg border bg-background p-3">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Filas procesadas</p>
                      <p className="text-2xl font-bold tabular-nums mt-1">{summary.totalRowsProcessed}</p>
                    </div>
                    <div className="rounded-lg border bg-background p-3">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Shifts creados</p>
                      <p className="text-2xl font-bold tabular-nums text-primary mt-1">{summary.shiftsCreated}</p>
                    </div>
                    <div className="rounded-lg border bg-background p-3">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Shifts actualizados</p>
                      <p className="text-2xl font-bold tabular-nums mt-1">{summary.shiftsUpdated}</p>
                    </div>
                    <div className="rounded-lg border bg-background p-3">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Asignaciones</p>
                      <p className="text-2xl font-bold tabular-nums text-primary mt-1">{summary.totalAssignments + summary.reconciledAssignments}</p>
                    </div>
                    <div className="rounded-lg border bg-background p-3">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Matched</p>
                      <p className="text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400 mt-1">{matchedCount}</p>
                    </div>
                    <div className="rounded-lg border bg-background p-3">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Necesita revisión</p>
                      <p className={`text-2xl font-bold tabular-nums mt-1 ${needsReview > 0 ? "text-warning" : "text-muted-foreground"}`}>{needsReview}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {unmatchedCount} unmatched · {ambiguousCount} ambiguous
                      </p>
                    </div>
                  </div>

                  {/* Batch identity strip */}
                  <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/40 px-3 py-2 flex-wrap">
                    <div className="text-[11px] text-muted-foreground">
                      Batch ID:{" "}
                      <code className="font-mono text-foreground break-all">{summary.batchId ?? "—"}</code>
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      Source: <span className="text-foreground">connecteam_schedule</span>
                    </div>
                  </div>

                  {/* Needs review banner */}
                  {needsReview > 0 && (
                    <div className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/5 p-3">
                      <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
                      <div className="flex-1 text-sm">
                        <p className="font-medium text-warning">Hay {needsReview} trabajadores que requieren revisión manual</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Estos nombres venían en el archivo pero <strong>no</strong> fueron asignados automáticamente
                          (no hubo match seguro o el nombre era ambiguo). Los turnos sí se crearon — falta asignar al worker correcto.
                          Descarga el CSV para revisarlos o ve directamente a los turnos.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Action row */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button
                      variant={needsReview > 0 ? "default" : "outline"}
                      size="sm"
                      onClick={downloadUnmatchedCsv}
                      disabled={needsReview === 0}
                    >
                      <Download className="h-4 w-4 mr-1.5" />
                      Download unmatched.csv
                    </Button>
                    <Button variant="outline" size="sm" onClick={goToOrphanShifts}>
                      Go to orphan shifts
                      <ArrowRight className="h-4 w-4 ml-1.5" />
                    </Button>
                    {summary.batchId && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          navigator.clipboard.writeText(summary.batchId!);
                          toast({ title: "Batch ID copiado" });
                        }}
                      >
                        Copiar batch ID
                      </Button>
                    )}
                  </div>

                  <p className="text-[10px] text-muted-foreground">
                    Toda fila del archivo se guardó en raw + normalized rows con su <code>batch_id</code>. Si necesitas
                    re-procesar, el lote es reversible y trazable por <code>reconciliation_hash</code>.
                  </p>
                </CardContent>
              </Card>
            );
          })()}

          {summary && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Card className="p-4 text-center">
                <p className="text-2xl font-bold text-primary tabular-nums">{summary.totalShifts}</p>
                <p className="text-xs text-muted-foreground">Turnos creados</p>
              </Card>
              <Card className="p-4 text-center">
                <p className="text-2xl font-bold text-primary tabular-nums">{summary.totalAssignments}</p>
                <p className="text-xs text-muted-foreground">Asignaciones</p>
              </Card>
              <Card className="p-4 text-center">
                <p className="text-2xl font-bold tabular-nums">{summary.totalUnavailable}</p>
                <p className="text-xs text-muted-foreground">Indisponibilidades</p>
              </Card>
              <Card className="p-4 text-center">
                <p className="text-2xl font-bold text-accent-foreground tabular-nums">{summary.reconciledShifts}</p>
                <p className="text-xs text-muted-foreground">Turnos reconciliados</p>
              </Card>
              <Card className="p-4 text-center">
                <p className="text-2xl font-bold text-accent-foreground tabular-nums">{summary.reconciledAssignments}</p>
                <p className="text-xs text-muted-foreground">Asignaciones reconciliadas</p>
              </Card>
              <Card className="p-4 text-center">
                <p className="text-2xl font-bold text-muted-foreground tabular-nums">{summary.skippedExistingAssignments}</p>
                <p className="text-xs text-muted-foreground">Ya existían (omitidas)</p>
              </Card>
            </div>
          )}

          {/* ── Blocked assignments panel ── */}
          {summary && summary.assignmentFailures.length > 0 && (() => {
            const all = summary.assignmentFailures;
            const counts = all.reduce<Record<AssignmentFailureType, number>>((acc, f) => {
              acc[f.failure_type] = (acc[f.failure_type] ?? 0) + 1;
              return acc;
            }, { employee_not_ready: 0, unmatched_employee: 0, ambiguous_employee: 0, duplicate_assignment: 0, overlap: 0, db_error: 0 });
            const filtered = blockedFilter === "all" ? all : all.filter(f => f.failure_type === blockedFilter);
            const grouped = groupFailuresByShift(filtered);
            const filterChips: Array<{ key: AssignmentFailureType | "all"; label: string; count: number }> = [
              { key: "all", label: "All", count: all.length },
              ...(Object.entries(counts) as Array<[AssignmentFailureType, number]>)
                .filter(([, n]) => n > 0)
                .map(([k, n]) => ({ key: k, label: FAILURE_TYPE_LABELS[k], count: n })),
            ];
            const onCopy = async () => {
              try {
                await navigator.clipboard.writeText(failuresToText(all));
                toast({ title: "Reporte copiado", description: `${all.length} bloqueos en el portapapeles.` });
              } catch {
                toast({ title: "No se pudo copiar", variant: "destructive" });
              }
            };
            const onExport = () => {
              const csv = failuresToCsv(all);
              const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `blocked-assignments-${new Date().toISOString().slice(0, 10)}.csv`;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
            };
            return (
              <Card className="border-warning/30 bg-warning/5">
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <CardTitle className="text-sm flex items-center gap-2">
                        <AlertCircle className="h-4 w-4 text-warning" />
                        Assignments bloqueados ({all.length})
                      </CardTitle>
                      <p className="text-[11px] text-muted-foreground mt-1">
                        Estas asignaciones <strong>no se crearon</strong>. Cada fila incluye la causa exacta y la acción sugerida.
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={onCopy}>Copiar reporte</Button>
                      <Button size="sm" variant="outline" onClick={onExport}>Exportar CSV</Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Filter chips */}
                  <div className="flex flex-wrap gap-1.5">
                    {filterChips.map(c => (
                      <button
                        key={c.key}
                        type="button"
                        onClick={() => setBlockedFilter(c.key)}
                        className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                          blockedFilter === c.key
                            ? "bg-warning text-warning-foreground border-warning"
                            : "bg-background text-foreground border-border hover:bg-muted"
                        }`}
                      >
                        {c.label} <span className="tabular-nums opacity-70">· {c.count}</span>
                      </button>
                    ))}
                  </div>

                  {/* Grouped by shift */}
                  {grouped.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Sin bloqueos para el filtro seleccionado.</p>
                  ) : (
                    <div className="space-y-3">
                      {grouped.map(g => (
                        <div key={g.key} className="rounded-lg border bg-background">
                          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-3 py-2 border-b bg-muted/40">
                            <span className="font-mono text-xs font-semibold">#{g.shift_code || "—"}</span>
                            <span className="text-xs text-muted-foreground">{g.date} · {g.start_time}–{g.end_time}</span>
                            <span className="text-xs font-medium truncate" title={g.client}>{g.client || "—"}</span>
                            <Badge variant="outline" className="ml-auto text-[10px]">{g.items.length} bloqueado(s)</Badge>
                          </div>
                          <div className="overflow-x-auto">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead className="text-[10px]">Empleado (Excel)</TableHead>
                                  <TableHead className="text-[10px]">employee_id</TableHead>
                                  <TableHead className="text-[10px]">Match</TableHead>
                                  <TableHead className="text-[10px]">Tipo</TableHead>
                                  <TableHead className="text-[10px]">Mensaje DB</TableHead>
                                  <TableHead className="text-[10px]">Acción sugerida</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {g.items.map((f, i) => (
                                  <TableRow key={i}>
                                    <TableCell className="text-[11px] font-medium">{f.raw_employee_name}</TableCell>
                                    <TableCell className="text-[10px] font-mono break-all text-muted-foreground">{f.employee_id ?? "—"}</TableCell>
                                    <TableCell className="text-[10px]">{f.match_method ?? "—"}</TableCell>
                                    <TableCell className="text-[10px]">
                                      <Badge
                                        variant="outline"
                                        className={
                                          f.failure_type === "employee_not_ready" ? "border-warning/40 text-warning"
                                          : f.failure_type === "duplicate_assignment" ? "border-muted-foreground/30 text-muted-foreground"
                                          : "border-destructive/30 text-destructive"
                                        }
                                      >
                                        {FAILURE_TYPE_LABELS[f.failure_type]}
                                      </Badge>
                                    </TableCell>
                                    <TableCell className="text-[10px] text-muted-foreground break-all max-w-[280px]">{f.error_message}</TableCell>
                                    <TableCell className="text-[10px] break-words max-w-[260px]">{f.suggested_action}</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <p className="text-[10px] text-muted-foreground">
                    Reporte informativo. No hace bypass de reglas — los overrides operativos se gestionan por separado.
                  </p>
                </CardContent>
              </Card>
            );
          })()}

          {/* Match telemetry — how each employee was resolved */}
          {summary && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Cómo se emparejaron los empleados</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div className="rounded-lg border p-2"><p className="text-muted-foreground">Por Connecteam ID / external</p><p className="text-lg font-bold tabular-nums">{summary.matchTelemetry.external_id}</p></div>
                  <div className="rounded-lg border p-2"><p className="text-muted-foreground">Por phone (aux)</p><p className="text-lg font-bold tabular-nums">{summary.matchTelemetry.phone}</p></div>
                  <div className="rounded-lg border p-2"><p className="text-muted-foreground">Por email (aux)</p><p className="text-lg font-bold tabular-nums">{summary.matchTelemetry.email}</p></div>
                  <div className="rounded-lg border p-2"><p className="text-muted-foreground">Aux bridge (Users export)</p><p className="text-lg font-bold tabular-nums">{summary.matchTelemetry.aux_bridge}</p></div>
                  <div className="rounded-lg border p-2"><p className="text-muted-foreground">Por nombre exacto</p><p className="text-lg font-bold tabular-nums">{summary.matchTelemetry.exact_name}</p></div>
                  <div className="rounded-lg border p-2"><p className="text-muted-foreground">Por nombre invertido</p><p className="text-lg font-bold tabular-nums">{summary.matchTelemetry.reversed_name}</p></div>
                  <div className="rounded-lg border p-2"><p className="text-muted-foreground">Fuzzy (cercano único)</p><p className="text-lg font-bold tabular-nums">{summary.matchTelemetry.fuzzy_name}</p></div>
                  <div className="rounded-lg border p-2"><p className="text-muted-foreground">No encontrados</p><p className="text-lg font-bold tabular-nums text-warning">{summary.matchTelemetry.unmatched}</p></div>
                </div>
                {summary.auxUsersLoaded === 0 && (
                  <p className="text-[11px] text-muted-foreground mt-3">
                    Tip: sube el export de <strong>Users</strong> de Connecteam en el Paso 1 para activar matching por phone, email y Connecteam ID.
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {summary && summary.targetShiftDiagnostics.length > 0 && (
            <Card className="border-primary/30 bg-primary/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Diagnóstico focalizado · shift_code 45678 ({summary.targetShiftDiagnostics.length} grupos)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-[11px] text-muted-foreground">
                  Instrumentación temporal. Para cada grupo del Excel cuyo <code>shift_code=45678</code> y fecha está en 2026-04-24/25/26, se registra:
                  qué dedupKey generó, si entró a <code>reconcileExistingShift</code>, y por empleado el método de match, intento de insert y error exacto.
                </p>
                {summary.targetShiftDiagnostics.map((d, i) => (
                  <div key={i} className="space-y-2 border rounded-lg p-3 bg-background">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                      <div><p className="text-muted-foreground">Fecha</p><p className="font-mono">{d.date}</p></div>
                      <div><p className="text-muted-foreground">Job</p><p className="font-medium truncate" title={d.job}>{d.job || "—"}</p></div>
                      <div><p className="text-muted-foreground">dedupKey Excel</p><p className="font-mono break-all">{d.dedupKeyExcel}</p></div>
                      <div><p className="text-muted-foreground">dedupKey DB</p><p className="font-mono break-all">{d.dedupKeyDb ?? "—"}</p></div>
                      <div><p className="text-muted-foreground">existingShiftId</p><p className="font-mono break-all">{d.existingShiftId ?? "—"}</p></div>
                      <div><p className="text-muted-foreground">Entró a reconcile</p><p className="font-mono">{d.enteredReconcile ? "yes" : "no"}</p></div>
                      <div><p className="text-muted-foreground">Empleados (Excel)</p><p className="font-mono">{d.employees.length}</p></div>
                      <div><p className="text-muted-foreground">Diagnosticados</p><p className="font-mono">{d.employeesDiagnostic.length}</p></div>
                    </div>
                    {d.employeesDiagnostic.length > 0 ? (
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-[10px]">Raw name</TableHead>
                              <TableHead className="text-[10px]">Normalized</TableHead>
                              <TableHead className="text-[10px]">Status Excel</TableHead>
                              <TableHead className="text-[10px]">Match method</TableHead>
                              <TableHead className="text-[10px]">employee_id</TableHead>
                              <TableHead className="text-[10px]">Insert?</TableHead>
                              <TableHead className="text-[10px]">Result</TableHead>
                              <TableHead className="text-[10px]">Reason / error</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {d.employeesDiagnostic.map((e, j) => (
                              <TableRow key={j}>
                                <TableCell className="text-[10px] font-medium">{e.rawName}</TableCell>
                                <TableCell className="text-[10px] font-mono text-muted-foreground">{e.normalizedName}</TableCell>
                                <TableCell className="text-[10px]">{e.statusFromExcel || "—"}</TableCell>
                                <TableCell className="text-[10px]">{e.matchMethod ?? "—"}</TableCell>
                                <TableCell className="text-[10px] font-mono break-all">{e.employeeId ?? "—"}</TableCell>
                                <TableCell className="text-[10px]">{e.insertAttempt}</TableCell>
                                <TableCell className="text-[10px]">{e.assignmentResult}</TableCell>
                                <TableCell className="text-[10px] text-muted-foreground break-all">{e.reason ?? "—"}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    ) : (
                      <p className="text-[11px] text-muted-foreground italic">Sin filas de diagnóstico (no entró a reconcile o el Excel no traía empleados).</p>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {summary && summary.ambiguousMatches.length > 0 && (
            <Card className="border-warning/30 bg-warning/5">
              <CardHeader>
                <CardTitle className="text-sm">Matches ambiguos para revisar ({summary.ambiguousMatches.length})</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  Estos nombres del archivo pudieron coincidir con más de un empleado. <strong>No</strong> se crearon ni asignaron — revisa manualmente.
                </p>
                <div className="space-y-1.5">
                  {summary.ambiguousMatches.slice(0, 30).map((a, i) => (
                    <div key={i} className="text-xs border rounded p-2">
                      <p className="font-medium">{a.rawName}</p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {a.candidates.map((c, j) => (
                          <Badge key={j} variant="outline" className="text-[10px]">
                            {c.display} <span className="ml-1 text-muted-foreground">({c.method})</span>
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ))}
                  {summary.ambiguousMatches.length > 30 && (
                    <p className="text-[11px] text-muted-foreground">… y {summary.ambiguousMatches.length - 30} más</p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {summary && summary.unmatchedEmployees.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-sm text-warning">Empleados no encontrados ({summary.unmatchedEmployees.length})</CardTitle></CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-1.5">
                  {summary.unmatchedEmployees.map((e, i) => (
                    <Badge key={i} variant="outline" className="text-xs">{e}</Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {summary && summary.unmatchedClients.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-sm text-warning">Clientes no encontrados ({summary.unmatchedClients.length})</CardTitle></CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-1.5">
                  {summary.unmatchedClients.map((c, i) => (
                    <Badge key={i} variant="outline" className="text-xs">{c}</Badge>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Los turnos se crearon sin cliente. Puedes asignarlos manualmente desde el módulo de Turnos.
                </p>
              </CardContent>
            </Card>
          )}

          <Button variant="outline" onClick={() => { setStep(1); setFile(null); setFiles([]); setWorkbook(null); setShiftGroups([]); setResult(null); setSummary(null); }}>
            Importar más archivos
          </Button>
        </div>
      )}
    </div>
  );
}
