import React, { useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/ui/page-header";
import { useToast } from "@/hooks/use-toast";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import { getUserFriendlyError } from "@/lib/error-helpers";
import { safeRead, safeSheetToJson, getSheetNames, getSheet, writeExcelFile, parseAnyFileToJson } from "@/lib/safe-xlsx";
import type { SafeWorkbook } from "@/lib/safe-xlsx";
import { PLATFORM_LIST, PLATFORM_CONFIGS, resolveColumn, findColumnKey, type ImportPlatform, type PlatformConfig } from "@/lib/import-platform-configs";
import {
  Upload, FileSpreadsheet, CheckCircle2, AlertCircle, CalendarDays,
  Clock, DollarSign, ChevronRight, ChevronDown, Loader2, Users,
  AlertTriangle, RotateCcw, History, Info, SkipForward, Car, Download,
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";

const MAX_FILE_SIZE = 20 * 1024 * 1024;

/* ─── Type definitions ─── */
interface ShiftGroup {
  key: string;
  shiftCode: string;
  date: string;
  startTime: string;
  endTime: string;
  job: string;
  subItem: string;
  address: string;
  note: string;
  tags: string;
  status: string;
  employees: string[];
  employeeStatuses: string[];
  isWeekendJob: boolean;
  isPayRide: boolean;
}

interface ClockEntry {
  firstName: string;
  lastName: string;
  clockIn: Date;
  clockOut: Date | null;
  shiftHours: number;
  hourlyRate: number;
  scheduledShiftTitle: string;
  employeeNotes: string;
  managerNotes: string;
  isUnpaid: boolean;
  job: string;
}

interface PayrollExtra {
  firstName: string;
  lastName: string;
  employeeId: string | null;
  extras: { column: string; conceptName: string; value: number; category: string }[];
  total: number;
  notes: string;
}

interface ValidationSummary {
  scheduleShifts: number;
  scheduleAssignments: number;
  scheduleDuplicates: number;
  scheduleWeekendJobs: number;
  schedulePayRides: number;
  scheduleUnavailable: number;
  clockEntries: number;
  clockUnpaid: number;
  payrollMovements: number;
  payrollTotal: number;
  unmatchedEmployees: string[];
  warnings: string[];
}

interface ImportBatch {
  id: string;
  created_at: string;
  batch_type: string;
  status: string;
  schedule_file_name: string | null;
  timeclock_file_name: string | null;
  payroll_file_name: string | null;
  schedule_shifts_created: number;
  timeclock_entries_created: number;
  payroll_movements_created: number;
  unmatched_employees: string[];
  warnings: string[];
  date_range_from: string | null;
  date_range_to: string | null;
}

/* ─── Parse helpers ─── */
function parseTime(raw: string): string | null {
  if (!raw || raw.toLowerCase().includes("all day")) return null;
  const match = raw.trim().match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/i);
  if (!match) return null;
  let h = parseInt(match[1], 10);
  const m = match[2];
  const ampm = match[3].toLowerCase();
  if (ampm === "pm" && h < 12) h += 12;
  if (ampm === "am" && h === 12) h = 0;
  return `${String(h).padStart(2, "0")}:${m}`;
}

function parseDate(raw: string): string | null {
  if (!raw) return null;
  const match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) return `${match[3]}-${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  return null;
}

function parseClockDate(dateVal: string): Date | null {
  if (!dateVal?.trim()) return null;
  const trimmed = dateVal.trim();
  const parts = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (parts) return new Date(parseInt(parts[3], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
  const jsDate = new Date(trimmed);
  if (!isNaN(jsDate.getTime())) return jsDate;
  return null;
}

function parseClockTimestamp(dateStr: string, timeStr: string): Date | null {
  const baseDate = parseClockDate(dateStr);
  if (!baseDate) return null;
  if (!timeStr?.trim()) return baseDate;
  const timeParts = timeStr.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!timeParts) return baseDate;
  let hours = parseInt(timeParts[1], 10);
  const minutes = parseInt(timeParts[2], 10);
  const ampm = timeParts[3].toUpperCase();
  if (ampm === "PM" && hours < 12) hours += 12;
  if (ampm === "AM" && hours === 12) hours = 0;
  return new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate(), hours, minutes, 0);
}

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

// Payroll concept map is now loaded from platform config at runtime

const parseCurrency = (val: string): number => {
  if (!val || typeof val !== "string") return 0;
  const cleaned = val.replace(/[$,\s]/g, "").replace(/^\((.+)\)$/, "-$1");
  return parseFloat(cleaned) || 0;
};

// findClockDateKey removed — now using resolveColumn from platform configs

/* ─── Wizard steps ─── */
type WizardStep = "upload" | "validation" | "confirm" | "importing" | "result" | "history";

const STEPS = [
  { key: "upload" as const, label: "Subir Archivos", icon: Upload },
  { key: "validation" as const, label: "Validación", icon: AlertTriangle },
  { key: "confirm" as const, label: "Confirmar", icon: CheckCircle2 },
];

export default function ImportWizard() {
  const { selectedCompanyId } = useCompany();
  const { user } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"wizard" | "history">("wizard");
  const [platform, setPlatform] = useState<ImportPlatform>("connecteam");
  const platformConfig = PLATFORM_CONFIGS[platform];

  // Step state
  const [step, setStep] = useState<WizardStep>("upload");

  // File state
  const [scheduleFiles, setScheduleFiles] = useState<File[]>([]);
  const [clockFile, setClockFile] = useState<File | null>(null);
  const [payrollFile, setPayrollFile] = useState<File | null>(null);

  // Parsed data
  const [shiftGroups, setShiftGroups] = useState<ShiftGroup[]>([]);
  const [unavailableRecords, setUnavailableRecords] = useState<{ name: string; date: string }[]>([]);
  const [clockEntries, setClockEntries] = useState<ClockEntry[]>([]);
  const [payrollExtras, setPayrollExtras] = useState<PayrollExtra[]>([]);
  const [payrollDetectedCols, setPayrollDetectedCols] = useState<string[]>([]);

  // Validation
  const [validation, setValidation] = useState<ValidationSummary | null>(null);
  const [parsing, setParsing] = useState(false);

  // Import state
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<string>("");
  const [importResult, setImportResult] = useState<{
    success: boolean;
    message: string;
    details: Record<string, number>;
  } | null>(null);

  // History
  const [history, setHistory] = useState<ImportBatch[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Confirmation dialog
  const [showConfirm, setShowConfirm] = useState(false);

  /* ─── Load history ─── */
  const loadHistory = useCallback(async () => {
    if (!selectedCompanyId) return;
    setLoadingHistory(true);
    const { data } = await supabase
      .from("import_batches")
      .select("*")
      .eq("company_id", selectedCompanyId)
      .order("created_at", { ascending: false })
      .limit(50);
    setHistory((data as any[]) ?? []);
    setLoadingHistory(false);
  }, [selectedCompanyId]);

  useEffect(() => {
    if (activeTab === "history") loadHistory();
  }, [activeTab, loadHistory]);

  /* ─── Parse Schedule files ─── */
  const parseScheduleFiles = useCallback(async (files: File[]) => {
    let allGroups: ShiftGroup[] = [];
    let allUnavail: { name: string; date: string }[] = [];

    for (const f of files) {
      const json = await parseAnyFileToJson<Record<string, string>>(f, { defval: "" });

      for (const row of json) {
        const sc = platformConfig.schedule.columns;
        const dateRaw = resolveColumn(row, sc.date);
        const isoDate = parseDate(dateRaw);
        if (!isoDate) continue;

        const availStatus = resolveColumn(row, sc.availabilityStatus).toLowerCase();
        const userName = resolveColumn(row, sc.users);

        if (platformConfig.schedule.unavailablePatterns.some(p => p.test(availStatus))) {
          if (userName) allUnavail.push({ name: userName, date: isoDate });
          continue;
        }

        const shiftTitle = resolveColumn(row, sc.shiftTitle);
        const startRaw = resolveColumn(row, sc.start);
        const endRaw = resolveColumn(row, sc.end);
        const job = resolveColumn(row, sc.job);
        const subItem = resolveColumn(row, sc.subItem);

        if (!shiftTitle && !job && !startRaw) continue;
        const startTime = parseTime(startRaw);
        const endTime = parseTime(endRaw);
        if (!startTime || !endTime) continue;

        // Detect PayRide
        const combined = `${shiftTitle} ${job} ${subItem}`.toLowerCase();
        const isPayRide = platformConfig.schedule.payRidePatterns.some(p => p.test(combined)) || /^99\s*[-–]/.test(job.trim());
        const isWeekendJob = platformConfig.schedule.weekendJobPatterns.some(p => p.test(combined));

        if (isPayRide) {
          const existingRide = allGroups.find(g => g.key === `PAYRIDE|${isoDate}|${userName}`);
          if (!existingRide) {
            allGroups.push({
              key: `PAYRIDE|${isoDate}|${userName}`,
              shiftCode: "", date: isoDate, startTime, endTime, job, subItem,
              address: "", note: "", tags: "", status: "",
              employees: userName ? [userName] : [], employeeStatuses: [],
              isWeekendJob: false, isPayRide: true,
            });
          }
          continue;
        }

        const address = resolveColumn(row, sc.address);
        const note = resolveColumn(row, sc.note);
        const tags = resolveColumn(row, sc.tags);
        const lastStatus = resolveColumn(row, sc.lastStatus);

        const groupKey = `${shiftTitle}|${isoDate}|${startTime}|${endTime}|${job}`;
        const existing = allGroups.find(g => g.key === groupKey);
        if (!existing) {
          allGroups.push({
            key: groupKey, shiftCode: shiftTitle, date: isoDate, startTime, endTime, job, subItem,
            address, note, tags, status: lastStatus,
            employees: userName ? [userName] : [], employeeStatuses: [lastStatus],
            isWeekendJob, isPayRide: false,
          });
        } else if (userName && !existing.employees.includes(userName)) {
          existing.employees.push(userName);
          existing.employeeStatuses.push(lastStatus);
        }
      }
    }

    // Deduplicate
    const dedupMap: Record<string, ShiftGroup> = {};
    for (const g of allGroups) {
      if (!dedupMap[g.key]) {
        dedupMap[g.key] = g;
      } else {
        for (let i = 0; i < g.employees.length; i++) {
          if (!dedupMap[g.key].employees.includes(g.employees[i])) {
            dedupMap[g.key].employees.push(g.employees[i]);
            dedupMap[g.key].employeeStatuses.push(g.employeeStatuses[i]);
          }
        }
      }
    }
    return { groups: Object.values(dedupMap), unavail: allUnavail };
  }, [platformConfig]);

  /* ─── Parse Time Clock file ─── */
  const parseClockFile = useCallback(async (f: File) => {
    const json = await parseAnyFileToJson<Record<string, string>>(f, { defval: "" });
    const parsed: ClockEntry[] = [];
    const tc = platformConfig.timeclock.columns;

    for (const row of json) {
      const shiftNum = resolveColumn(row, tc.shiftNumber);
      const type = resolveColumn(row, tc.type);
      if (!shiftNum && !type) continue;

      const firstName = resolveColumn(row, tc.firstName);
      const lastName = resolveColumn(row, tc.lastName);
      if (!firstName && !lastName) continue;
      if (/^SYSTEM$/i.test(firstName)) continue;

      // Resolve date columns (handle duplicate "Start Date" columns)
      const startDateKey = findColumnKey(row, tc.startDate) || "Start Date";
      const endDateKey = findColumnKey(row, tc.endDate) || "End Date";
      const startDateRaw = row[startDateKey] ?? "";
      const inRaw = resolveColumn(row, tc.clockIn);
      const endDateRaw = row[endDateKey] ?? "";
      const outRaw = resolveColumn(row, tc.clockOut);

      const clockIn = parseClockTimestamp(startDateRaw, inRaw);
      if (!clockIn) continue;
      const clockOut = parseClockTimestamp(endDateRaw, outRaw);

      const shiftHours = parseFloat(resolveColumn(row, tc.shiftHours) || "0") || 0;
      const durationHours = clockOut ? (clockOut.getTime() - clockIn.getTime()) / 3600000 : 0;
      const isUnpaid = shiftHours === 0 || platformConfig.timeclock.unpaidPatterns.some(p => p.test(type)) || durationHours > 24;

      parsed.push({
        firstName, lastName, clockIn, clockOut, shiftHours,
        hourlyRate: parseFloat(resolveColumn(row, tc.hourlyRate) || "0") || 0,
        scheduledShiftTitle: resolveColumn(row, tc.scheduledShiftTitle),
        employeeNotes: resolveColumn(row, tc.employeeNotes),
        managerNotes: resolveColumn(row, tc.managerNotes),
        isUnpaid,
        job: type,
      });
    }
    return parsed;
  }, [platformConfig]);

  /* ─── Parse Payroll file ─── */
  const parsePayrollFile = useCallback(async (f: File) => {
    const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
    let json: Record<string, string>[];
    const useSecondSheet = platformConfig.payroll.preferSecondSheet;
    if (ext === "csv" || ext === "txt" || ext === "tsv") {
      json = await parseAnyFileToJson<Record<string, string>>(f, { defval: "" });
    } else {
      const data = await f.arrayBuffer();
      const wb = await safeRead(data);
      const names = getSheetNames(wb);
      const sheetName = useSecondSheet && names.length >= 2 ? names[1] : names[0];
      const ws = getSheet(wb, sheetName);
      if (!ws) return { extras: [] as PayrollExtra[], detectedCols: [] as string[] };
      json = safeSheetToJson<Record<string, string>>(ws, { defval: "" });
    }
    if (json.length === 0) return { extras: [] as PayrollExtra[], detectedCols: [] as string[] };

    const CONCEPT_MAP = platformConfig.payroll.conceptMap;
    const headers = Object.keys(json[0]);
    const detected: string[] = [];
    headers.forEach(h => {
      if (CONCEPT_MAP[h.toLowerCase().trim()]) detected.push(h);
    });

    // Fetch employees for matching
    const pc = platformConfig.payroll.columns;
    const { data: employees } = await supabase
      .from("employees")
      .select("id, first_name, last_name")
      .eq("company_id", selectedCompanyId!);
    const empList = employees ?? [];

    // Group by employee (keep last row = summary)
    const employeeGroups: Record<string, Record<string, string>> = {};
    for (const row of json) {
      const fn = resolveColumn(row, pc.firstName);
      const ln = resolveColumn(row, pc.lastName);
      if (!fn && !ln) continue;
      if (/^SYSTEM$/i.test(fn)) continue;
      const key = `${fn.toLowerCase()}|${ln.toLowerCase()}`;
      employeeGroups[key] = row;
    }

    const results: PayrollExtra[] = [];
    for (const [, row] of Object.entries(employeeGroups)) {
      const fn = resolveColumn(row, pc.firstName);
      const ln = resolveColumn(row, pc.lastName);
      const emp = empList.find(e => e.first_name.toLowerCase() === fn.toLowerCase() && e.last_name.toLowerCase() === ln.toLowerCase());

      const extras: PayrollExtra["extras"] = [];
      let total = 0;
      for (const col of detected) {
        const mapping = CONCEPT_MAP[col.toLowerCase().trim()];
        if (!mapping) continue;
        const val = parseCurrency(row[col]);
        if (val === 0) continue;
        extras.push({ column: col, conceptName: mapping.conceptName, value: Math.abs(val), category: mapping.category });
        total += val;
      }

      if (extras.length > 0) {
        results.push({ firstName: fn, lastName: ln, employeeId: emp?.id ?? null, extras, total, notes: "" });
      }
    }

    return { extras: results, detectedCols: detected };
  }, [selectedCompanyId, platformConfig]);

  /* ─── Parse all files and build validation ─── */
  const handleParseAll = useCallback(async () => {
    if (!selectedCompanyId) return;
    setParsing(true);

    try {
      let schedGroups: ShiftGroup[] = [];
      let unavail: { name: string; date: string }[] = [];
      let clockParsed: ClockEntry[] = [];
      let payrollParsed: PayrollExtra[] = [];
      let payrollCols: string[] = [];

      // Parse in parallel where possible
      const promises: Promise<void>[] = [];

      if (scheduleFiles.length > 0) {
        promises.push(
          parseScheduleFiles(scheduleFiles).then(r => {
            schedGroups = r.groups;
            unavail = r.unavail;
          })
        );
      }

      if (clockFile) {
        promises.push(
          parseClockFile(clockFile).then(r => { clockParsed = r; })
        );
      }

      if (payrollFile) {
        promises.push(
          parsePayrollFile(payrollFile).then(r => {
            payrollParsed = r.extras;
            payrollCols = r.detectedCols;
          })
        );
      }

      await Promise.all(promises);

      setShiftGroups(schedGroups);
      setUnavailableRecords(unavail);
      setClockEntries(clockParsed);
      setPayrollExtras(payrollParsed);
      setPayrollDetectedCols(payrollCols);

      // Build validation summary
      const realShifts = schedGroups.filter(g => !g.isPayRide);
      const payRides = schedGroups.filter(g => g.isPayRide);
      const weekendJobs = realShifts.filter(g => g.isWeekendJob);
      const allScheduleEmps = new Set(realShifts.flatMap(g => g.employees));
      const allClockEmps = new Set(clockParsed.map(e => `${e.firstName} ${e.lastName}`));
      const allPayrollEmps = new Set(payrollParsed.map(e => `${e.firstName} ${e.lastName}`));
      const allEmps = new Set([...allScheduleEmps, ...allClockEmps, ...allPayrollEmps]);

      // Check which employees exist in DB
      const { data: dbEmps } = await supabase
        .from("employees")
        .select("first_name, last_name")
        .eq("company_id", selectedCompanyId);
      const dbEmpNames = new Set((dbEmps ?? []).map(e => `${e.first_name} ${e.last_name}`.toLowerCase()));
      const unmatched = [...allEmps].filter(n => !dbEmpNames.has(n.toLowerCase()) && !/^system\s/i.test(n));

      // Check existing shifts for duplicate count
      const allDates = realShifts.map(g => g.date).sort();
      let scheduleDups = 0;
      if (allDates.length > 0) {
        const { data: existingShifts } = await supabase
          .from("scheduled_shifts")
          .select("shift_code, date, start_time, end_time")
          .eq("company_id", selectedCompanyId)
          .is("deleted_at", null)
          .gte("date", allDates[0])
          .lte("date", allDates[allDates.length - 1]);
        const existingKeys = new Set(
          (existingShifts ?? []).map(s => `${s.shift_code || ""}|${s.date}|${s.start_time?.slice(0, 5)}|${s.end_time?.slice(0, 5)}`)
        );
        for (const g of realShifts) {
          const numCode = g.shiftCode ? g.shiftCode.match(/^(\d+)/)?.[1] || g.shiftCode : "";
          if (existingKeys.has(`${numCode}|${g.date}|${g.startTime}|${g.endTime}`)) scheduleDups++;
        }
      }

      const warnings: string[] = [];
      if (unmatched.length > 0) warnings.push(`${unmatched.length} empleados no encontrados — se crearán automáticamente`);
      if (scheduleDups > 0) warnings.push(`${scheduleDups} turnos ya existen y serán omitidos`);
      if (clockParsed.filter(e => e.isUnpaid).length > 0) warnings.push(`${clockParsed.filter(e => e.isUnpaid).length} registros de reloj sin pago serán omitidos`);
      if (payrollParsed.filter(e => !e.employeeId).length > 0) warnings.push(`${payrollParsed.filter(e => !e.employeeId).length} empleados en nómina sin vincular`);

      setValidation({
        scheduleShifts: realShifts.length,
        scheduleAssignments: realShifts.reduce((s, g) => s + g.employees.filter(e => !/^system\s/i.test(e)).length, 0),
        scheduleDuplicates: scheduleDups,
        scheduleWeekendJobs: weekendJobs.length,
        schedulePayRides: payRides.length,
        scheduleUnavailable: unavail.length,
        clockEntries: clockParsed.filter(e => !e.isUnpaid).length,
        clockUnpaid: clockParsed.filter(e => e.isUnpaid).length,
        payrollMovements: payrollParsed.reduce((s, e) => s + e.extras.length, 0),
        payrollTotal: payrollParsed.reduce((s, e) => s + Math.abs(e.total), 0),
        unmatchedEmployees: unmatched,
        warnings,
      });

      setStep("validation");
    } catch (err: any) {
      toast({ title: "Error al procesar archivos", description: getUserFriendlyError(err), variant: "destructive" });
    }

    setParsing(false);
  }, [selectedCompanyId, scheduleFiles, clockFile, payrollFile, parseScheduleFiles, parseClockFile, parsePayrollFile, toast]);

  /* ─── Execute import ─── */
  const executeImport = useCallback(async () => {
    if (!selectedCompanyId || !user) return;
    setImporting(true);
    setStep("importing");
    setShowConfirm(false);

    const results: Record<string, number> = {};
    const allUnmatched = new Set<string>();
    const allWarnings: string[] = [];

    try {
      // ── Fetch master data ──
      setImportProgress("Cargando datos maestros...");
      const [{ data: employees }, { data: clients }, { data: concepts }] = await Promise.all([
        supabase.from("employees").select("id, first_name, last_name").eq("company_id", selectedCompanyId),
        supabase.from("clients").select("id, name").eq("company_id", selectedCompanyId).is("deleted_at", null),
        supabase.from("concepts").select("id, name, category").eq("company_id", selectedCompanyId).eq("is_active", true),
      ]);

      const empMap = new Map<string, string>();
      (employees ?? []).forEach(e => empMap.set(`${e.first_name} ${e.last_name}`.toLowerCase(), e.id));

      const clientMap = new Map<string, string>();
      (clients ?? []).forEach(c => clientMap.set(c.name.toLowerCase(), c.id));

      const conceptByName = new Map((concepts ?? []).map(c => [c.name.toLowerCase(), c]));

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

      // ═══════════════════════════════════════
      // STEP 1: SCHEDULES
      // ═══════════════════════════════════════
      const realShifts = shiftGroups.filter(g => !g.isPayRide);
      results.scheduleShiftsCreated = 0;
      results.scheduleAssignmentsCreated = 0;
      results.scheduleDuplicatesSkipped = 0;
      results.scheduleClientsCreated = 0;
      results.scheduleEmployeesCreated = 0;

      if (realShifts.length > 0) {
        setImportProgress("Creando clientes nuevos...");
        const allJobNames = new Set(realShifts.map(g => g.job).filter(Boolean));
        for (const jobName of allJobNames) {
          if (matchClient(jobName)) continue;
          const cleanName = jobName.replace(/^\d+\s*[-–]\s*/, "").trim() || jobName;
          const { data: newClient } = await supabase.from("clients").insert({
            company_id: selectedCompanyId,
            name: cleanName,
            notes: `Creado desde importación Connecteam (original: "${jobName}")`,
          } as any).select("id, name").single();
          if (newClient) {
            clientMap.set(cleanName.toLowerCase(), newClient.id);
            clientMap.set(jobName.toLowerCase(), newClient.id);
            results.scheduleClientsCreated++;
          }
        }

        setImportProgress("Creando empleados nuevos...");
        const allEmpNames = new Set(realShifts.flatMap(g => g.employees));
        for (const empName of allEmpNames) {
          if (empMap.has(empName.toLowerCase())) continue;
          const parsed = parseName(empName);
          if (!parsed || /^system\s/i.test(empName)) continue;
          const { data: newEmp } = await supabase.from("employees").insert({
            company_id: selectedCompanyId,
            first_name: parsed.first,
            last_name: parsed.last,
            is_active: true,
          } as any).select("id").single();
          if (newEmp) {
            empMap.set(empName.toLowerCase(), newEmp.id);
            results.scheduleEmployeesCreated++;
          }
        }

        // Fetch existing shifts for dedup
        setImportProgress("Verificando duplicados de turnos...");
        const allDates = realShifts.map(g => g.date).sort();
        const existingShiftKeys = new Set<string>();
        if (allDates.length > 0) {
          const { data: existingShifts } = await supabase
            .from("scheduled_shifts")
            .select("shift_code, date, start_time, end_time")
            .eq("company_id", selectedCompanyId)
            .is("deleted_at", null)
            .gte("date", allDates[0])
            .lte("date", allDates[allDates.length - 1]);
          (existingShifts ?? []).forEach(s => {
            existingShiftKeys.add(`${s.shift_code || ""}|${s.date}|${s.start_time?.slice(0, 5)}|${s.end_time?.slice(0, 5)}`);
          });
        }

        // Insert shifts in batches
        const BATCH_SIZE = 10;
        for (let i = 0; i < realShifts.length; i += BATCH_SIZE) {
          const batch = realShifts.slice(i, i + BATCH_SIZE);
          setImportProgress(`Importando turnos ${i + 1}-${Math.min(i + BATCH_SIZE, realShifts.length)}...`);

          const shiftPayloads: any[] = [];
          const batchGroups: ShiftGroup[] = [];

          for (const group of batch) {
            const numericCode = group.shiftCode ? group.shiftCode.match(/^(\d+)/)?.[1] || group.shiftCode : "";
            const dedupKey = `${numericCode}|${group.date}|${group.startTime}|${group.endTime}`;
            if (existingShiftKeys.has(dedupKey)) {
              results.scheduleDuplicatesSkipped++;
              continue;
            }

            const clientId = matchClient(group.job);
            let title = "";
            if (numericCode) title += `#${numericCode.padStart(4, "0")} `;
            if (group.job) title += group.job.replace(/^\d+\s*[-–]\s*/, "").trim();
            if (group.subItem) title += ` - ${group.subItem}`;
            if (!title.trim()) title = "Turno importado";

            const realEmployees = group.employees.filter(e => !/^system\s/i.test(e));

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
              status: "scheduled",
              slots: realEmployees.length || 1,
              claimable: false,
              pay_type: group.isWeekendJob ? "daily" : "hourly",
            });
            batchGroups.push(group);
            existingShiftKeys.add(dedupKey);
          }

          if (shiftPayloads.length === 0) continue;

          const { data: inserted, error } = await supabase
            .from("scheduled_shifts")
            .insert(shiftPayloads)
            .select("id");

          if (error || !inserted) {
            console.error("Shift batch error:", error);
            continue;
          }
          results.scheduleShiftsCreated += inserted.length;

          // Create assignments
          const assignPayloads: any[] = [];
          for (let j = 0; j < batchGroups.length; j++) {
            const group = batchGroups[j];
            const shift = inserted[j];
            if (!shift) continue;
            for (const empName of group.employees) {
              if (/^system\s/i.test(empName)) continue;
              const empId = empMap.get(empName.toLowerCase());
              if (!empId) {
                allUnmatched.add(empName);
                continue;
              }
              assignPayloads.push({
                company_id: selectedCompanyId,
                shift_id: shift.id,
                employee_id: empId,
                status: "accepted",
              });
            }
          }

          if (assignPayloads.length > 0) {
            const { data: assignResult, error: assignErr } = await supabase
              .from("shift_assignments")
              .insert(assignPayloads)
              .select("id");
            if (assignErr) {
              // Fallback to one-by-one
              for (const p of assignPayloads) {
                const { error: singleErr } = await supabase.from("shift_assignments").insert(p);
                if (!singleErr) results.scheduleAssignmentsCreated++;
              }
            } else {
              results.scheduleAssignmentsCreated += assignResult?.length ?? 0;
            }
          }
        }
      }

      // ═══════════════════════════════════════
      // STEP 2: TIME CLOCK
      // ═══════════════════════════════════════
      results.timeClockCreated = 0;
      results.timeClockLinked = 0;
      results.timeClockOverlap = 0;
      results.timeClockUnpaid = 0;

      const validClock = clockEntries.filter(e => !e.isUnpaid);
      if (validClock.length > 0) {
        setImportProgress("Cargando turnos para vincular relojes...");
        const { data: shifts } = await supabase
          .from("scheduled_shifts")
          .select("id, shift_code, date, start_time, end_time")
          .eq("company_id", selectedCompanyId)
          .is("deleted_at", null);

        // Build multiple lookup maps for reconciliation
        const shiftByCode = new Map<string, string>(); // shift_code|date → id
        const shiftByHash = new Map<string, string>(); // date|start_time → id (fallback)
        (shifts ?? []).forEach(s => {
          if (s.shift_code) shiftByCode.set(`${s.shift_code}|${s.date}`, s.id);
          if (s.start_time) shiftByHash.set(`${s.date}|${s.start_time.slice(0, 5)}`, s.id);
        });

        // Also build employee+date+time assignment map for precise matching
        const { data: assignments } = await supabase
          .from("shift_assignments")
          .select("employee_id, shift_id, scheduled_shifts!inner(date, start_time)")
          .eq("company_id", selectedCompanyId)
          .in("status", ["accepted", "confirmed"]);

        const assignmentMap = new Map<string, string>(); // empId|date|startTime → shiftId
        (assignments as any[] ?? []).forEach((a: any) => {
          const ss = a.scheduled_shifts;
          if (ss && a.employee_id) {
            assignmentMap.set(`${a.employee_id}|${ss.date}|${ss.start_time?.slice(0, 5)}`, a.shift_id);
          }
        });

        for (let i = 0; i < validClock.length; i++) {
          const entry = validClock[i];
          if (i % 50 === 0) setImportProgress(`Importando registros de reloj ${i + 1}/${validClock.length}...`);

          const empName = `${entry.firstName} ${entry.lastName}`.toLowerCase();
          const empId = empMap.get(empName);
          if (!empId) {
            allUnmatched.add(`${entry.firstName} ${entry.lastName}`);
            continue;
          }

          // Reconciliation: try multiple strategies
          let shiftId: string | null = null;
          const clockDate = entry.clockIn.toISOString().slice(0, 10);
          const clockStartTime = `${String(entry.clockIn.getHours()).padStart(2, "0")}:${String(entry.clockIn.getMinutes()).padStart(2, "0")}`;

          // Strategy 1: employee + date + start_time via assignment
          shiftId = assignmentMap.get(`${empId}|${clockDate}|${clockStartTime}`) ?? null;

          // Strategy 2: shift_code + date
          if (!shiftId && entry.scheduledShiftTitle) {
            shiftId = shiftByCode.get(`${entry.scheduledShiftTitle}|${clockDate}`) ?? null;
          }

          // Strategy 3: date + approximate start_time (±30 min)
          if (!shiftId) {
            const clockMinutes = entry.clockIn.getHours() * 60 + entry.clockIn.getMinutes();
            for (const [key, id] of shiftByHash.entries()) {
              if (!key.startsWith(clockDate + "|")) continue;
              const timePart = key.split("|")[1];
              const [h, m] = timePart.split(":").map(Number);
              if (Math.abs(h * 60 + m - clockMinutes) <= 30) {
                shiftId = id;
                break;
              }
            }
          }

          if (shiftId) {
            results.timeClockLinked++;
            // Update shift status → "worked"
            await supabase.from("scheduled_shifts")
              .update({ status: "worked" })
              .eq("id", shiftId)
              .eq("company_id", selectedCompanyId)
              .in("status", ["open", "assigned", "scheduled"]);
          }

          const notesParts: string[] = [];
          if (entry.employeeNotes) notesParts.push(`Empleado: ${entry.employeeNotes}`);
          if (entry.managerNotes) notesParts.push(`Manager: ${entry.managerNotes}`);
          notesParts.push(`[Import ${platformConfig.label}]`);

          const { error } = await supabase.from("time_entries").insert({
            company_id: selectedCompanyId,
            employee_id: empId,
            shift_id: shiftId,
            clock_in: entry.clockIn.toISOString(),
            clock_out: entry.clockOut?.toISOString() ?? null,
            notes: notesParts.join(" | "),
            status: "approved",
          });

          if (error) {
            if (error.message?.includes("overlap") || error.code === "23505") {
              results.timeClockOverlap++;
            }
            continue;
          }
          results.timeClockCreated++;
        }
        results.timeClockUnpaid = clockEntries.filter(e => e.isUnpaid).length;
      }

      // ═══════════════════════════════════════
      // STEP 3: PAYROLL EXTRAS
      // ═══════════════════════════════════════
      results.payrollMovementsCreated = 0;
      results.payrollDuplicatesSkipped = 0;
      results.payrollNoEmployee = 0;
      results.payrollNoConcept = 0;

      if (payrollExtras.length > 0) {
        // Need a period for payroll — find most recent open period
        const { data: periods } = await supabase
          .from("pay_periods")
          .select("id, start_date, end_date, status")
          .eq("company_id", selectedCompanyId)
          .order("start_date", { ascending: false })
          .limit(20);

        const openPeriod = (periods ?? []).find(p => p.status === "open");
        if (!openPeriod) {
          allWarnings.push("No hay periodo abierto — los movimientos de nómina no fueron importados");
        } else {
          setImportProgress("Importando movimientos de nómina...");
          for (const emp of payrollExtras) {
            const empId = emp.employeeId ?? empMap.get(`${emp.firstName} ${emp.lastName}`.toLowerCase());
            if (!empId) {
              results.payrollNoEmployee++;
              allUnmatched.add(`${emp.firstName} ${emp.lastName}`);
              continue;
            }

            for (const extra of emp.extras) {
              const concept = conceptByName.get(extra.conceptName.toLowerCase());
              if (!concept) {
                results.payrollNoConcept++;
                continue;
              }

              // Check duplicate
              const { count } = await supabase
                .from("movements")
                .select("id", { count: "exact", head: true })
                .eq("employee_id", empId)
                .eq("concept_id", concept.id)
                .eq("period_id", openPeriod.id)
                .eq("company_id", selectedCompanyId);

              if ((count ?? 0) > 0) {
                results.payrollDuplicatesSkipped++;
                continue;
              }

              const { error } = await supabase.from("movements").insert({
                employee_id: empId,
                concept_id: concept.id,
                period_id: openPeriod.id,
                company_id: selectedCompanyId,
                total_value: extra.value,
                note: `[Import Wizard] ${extra.conceptName}`,
                created_by: user.id,
              });

              if (!error) results.payrollMovementsCreated++;
            }
          }
        }
      }

      // ── Mark shifts as payroll_processed → closed ──
      if (payrollExtras.length > 0) {
        setImportProgress("Marcando turnos como payroll_processed...");
        const clockDatesSet = new Set(clockEntries.map(e => e.clockIn.toISOString().slice(0, 10)));
        const scheduleDates = shiftGroups.filter(g => !g.isPayRide).map(g => g.date);
        const allProcessedDates = [...new Set([...clockDatesSet, ...scheduleDates])];
        if (allProcessedDates.length > 0) {
          // worked → payroll_processed
          await supabase.from("scheduled_shifts")
            .update({ status: "payroll_processed" })
            .eq("company_id", selectedCompanyId)
            .eq("status", "worked")
            .in("date", allProcessedDates);
          // payroll_processed → closed
          await supabase.from("scheduled_shifts")
            .update({ status: "closed" })
            .eq("company_id", selectedCompanyId)
            .eq("status", "payroll_processed")
            .in("date", allProcessedDates);
        }
      }

      // ── Save import batch ──
      setImportProgress("Guardando historial...");
      const allDates = shiftGroups.filter(g => !g.isPayRide).map(g => g.date).sort();
      const clockDates = clockEntries.map(e => e.clockIn.toISOString().slice(0, 10)).sort();
      const dateFrom = [...allDates, ...clockDates].sort()[0] ?? null;
      const dateTo = [...allDates, ...clockDates].sort().pop() ?? null;

      await supabase.from("import_batches").insert({
        company_id: selectedCompanyId,
        created_by: user.id,
        batch_type: "unified",
        schedule_file_name: scheduleFiles.map(f => f.name).join(", ") || null,
        timeclock_file_name: clockFile?.name ?? null,
        payroll_file_name: payrollFile?.name ?? null,
        schedule_shifts_created: results.scheduleShiftsCreated,
        schedule_assignments_created: results.scheduleAssignmentsCreated,
        schedule_duplicates_skipped: results.scheduleDuplicatesSkipped,
        schedule_clients_created: results.scheduleClientsCreated,
        schedule_employees_created: results.scheduleEmployeesCreated,
        schedule_weekend_jobs: shiftGroups.filter(g => g.isWeekendJob).length,
        schedule_payrides: shiftGroups.filter(g => g.isPayRide).length,
        schedule_unavailable: unavailableRecords.length,
        timeclock_entries_created: results.timeClockCreated,
        timeclock_linked_shifts: results.timeClockLinked,
        timeclock_overlaps_skipped: results.timeClockOverlap,
        timeclock_unpaid_skipped: results.timeClockUnpaid,
        payroll_movements_created: results.payrollMovementsCreated,
        payroll_duplicates_skipped: results.payrollDuplicatesSkipped,
        unmatched_employees: [...allUnmatched],
        warnings: allWarnings,
        date_range_from: dateFrom,
        date_range_to: dateTo,
      } as any);

      setImportResult({
        success: true,
        message: "Importación completada exitosamente",
        details: results,
      });
      setStep("result");

    } catch (err: any) {
      setImportResult({
        success: false,
        message: getUserFriendlyError(err),
        details: results,
      });
      setStep("result");
    }

    setImporting(false);
  }, [selectedCompanyId, user, shiftGroups, clockEntries, payrollExtras, unavailableRecords, scheduleFiles, clockFile, payrollFile]);

  /* ─── Reset ─── */
  const resetWizard = () => {
    setStep("upload");
    setScheduleFiles([]);
    setClockFile(null);
    setPayrollFile(null);
    setShiftGroups([]);
    setUnavailableRecords([]);
    setClockEntries([]);
    setPayrollExtras([]);
    setPayrollDetectedCols([]);
    setValidation(null);
    setImportResult(null);
    setImportProgress("");
  };

  /* ─── File handlers ─── */
  const handleScheduleFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).filter(f => f.size <= MAX_FILE_SIZE);
    if (files.length > 0) setScheduleFiles(files);
  };

  const handleClockFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f && f.size <= MAX_FILE_SIZE) setClockFile(f);
  };

  const handlePayrollFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f && f.size <= MAX_FILE_SIZE) setPayrollFile(f);
  };

  const hasAnyFile = scheduleFiles.length > 0 || clockFile || payrollFile;
  const ACCEPTED_FORMATS = ".xls,.xlsx,.csv,.txt,.tsv";

  /* ─── Template downloads ─── */
  const downloadTemplate = async (type: "schedule" | "timeclock" | "payroll") => {
    const templates: Record<string, { headers: string[]; sample: Record<string, string>[] }> = {
      schedule: {
        headers: ["Date", "Shift title", "Start", "End", "Job", "Sub item", "Users", "Address", "Note", "Shift tags", "Availability status", "Last Status"],
        sample: [
          { Date: "01/15/2025", "Shift title": "101", Start: "8:00 AM", End: "5:00 PM", Job: "01 - ACME Corp", "Sub item": "", Users: "John Smith", Address: "123 Main St", Note: "", "Shift tags": "", "Availability status": "", "Last Status": "Accepted" },
          { Date: "01/15/2025", "Shift title": "102", Start: "6:00 PM", End: "11:00 PM", Job: "02 - Beta Inc", "Sub item": "Weekend Job", Users: "Jane Doe", Address: "", Note: "", "Shift tags": "", "Availability status": "", "Last Status": "Accepted" },
          { Date: "01/15/2025", "Shift title": "99", Start: "7:00 AM", End: "7:30 AM", Job: "99 - PAY RIDE", "Sub item": "PayRide", Users: "John Smith", Address: "", Note: "", "Shift tags": "", "Availability status": "", "Last Status": "" },
        ],
      },
      timeclock: {
        headers: ["Shift Number", "Type", "First name", "Last name", "Start Date", "In", "End Date", "Out", "Shift hours", "Hourly rate (USD)", "Scheduled shift title", "Employee notes", "Manager notes"],
        sample: [
          { "Shift Number": "1", Type: "Regular", "First name": "John", "Last name": "Smith", "Start Date": "01/15/2025", In: "8:00 AM", "End Date": "01/15/2025", Out: "5:00 PM", "Shift hours": "9", "Hourly rate (USD)": "18.50", "Scheduled shift title": "101", "Employee notes": "", "Manager notes": "" },
        ],
      },
      payroll: {
        headers: ["First name", "Last name", "PayPer Day", "Ryde", "Tips", "Reimbursements", "Travel Hours", "Discount"],
        sample: [
          { "First name": "John", "Last name": "Smith", "PayPer Day": "$525.00", Ryde: "$25.00", Tips: "$50.00", Reimbursements: "", "Travel Hours": "", Discount: "" },
        ],
      },
    };

    const tpl = templates[type];
    const data = tpl.sample.map(row => {
      const full: Record<string, string> = {};
      tpl.headers.forEach(h => { full[h] = row[h] ?? ""; });
      return full;
    });

    const names = { schedule: "Plantilla_Programaciones", timeclock: "Plantilla_Relojes", payroll: "Plantilla_Nomina" };
    await writeExcelFile(data, "Template", `${names[type]}.xlsx`);
    toast({ title: "Plantilla descargada", description: `${names[type]}.xlsx` });
  };

  /* ─── Render helpers ─── */
  const KpiCard = ({ label, value, icon: Icon, color = "text-primary" }: { label: string; value: string | number; icon: any; color?: string }) => (
    <div className="flex items-center gap-3 p-3 rounded-xl border bg-card">
      <div className={`p-2 rounded-lg bg-muted ${color}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <p className="text-2xl font-bold">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );

  return (
    <div className="space-y-5">
      <PageHeader
        variant="3"
        title="Asistente de Importación"
        subtitle={`Importa programaciones, relojes y nómina desde ${platformConfig.label}`}
      />

      <Tabs value={activeTab} onValueChange={v => setActiveTab(v as any)}>
        <TabsList>
          <TabsTrigger value="wizard" className="gap-1.5">
            <Upload className="h-4 w-4" />
            Importar
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-1.5">
            <History className="h-4 w-4" />
            Historial
          </TabsTrigger>
        </TabsList>

        <TabsContent value="wizard" className="space-y-5 mt-4">
          {/* Platform selector */}
          {step === "upload" && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Plataforma de origen</p>
              <div className="flex flex-wrap gap-2">
                {PLATFORM_LIST.map(p => (
                  <Button
                    key={p.id}
                    variant={platform === p.id ? "default" : "outline"}
                    size="sm"
                    className="gap-1.5"
                    onClick={() => {
                      setPlatform(p.id);
                      setScheduleFiles([]);
                      setClockFile(null);
                      setPayrollFile(null);
                      setShiftGroups([]);
                      setClockEntries([]);
                      setPayrollExtras([]);
                      setValidation(null);
                    }}
                  >
                    <span className={platform === p.id ? "" : p.color}>{p.label}</span>
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Stepper */}
          {step !== "result" && step !== "importing" && (
            <div className="flex items-center gap-2">
              {STEPS.map((s, i) => {
                const isActive = s.key === step;
                const isPast = STEPS.findIndex(x => x.key === step) > i;
                return (
                  <React.Fragment key={s.key}>
                    {i > 0 && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                      isActive ? "bg-primary text-primary-foreground" :
                      isPast ? "bg-primary/10 text-primary" :
                      "bg-muted text-muted-foreground"
                    }`}>
                      <s.icon className="h-3.5 w-3.5" />
                      {s.label}
                    </div>
                  </React.Fragment>
                );
              })}
            </div>
          )}

          {/* ═══ STEP: UPLOAD ═══ */}
          {step === "upload" && (
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                {/* Schedule */}
                <Card className={scheduleFiles.length > 0 ? "ring-2 ring-primary/30" : ""}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <CalendarDays className="h-4 w-4 text-primary" />
                      Paso 1: Programaciones
                      {scheduleFiles.length > 0 && <Badge variant="secondary" className="ml-auto">{scheduleFiles.length} archivo(s)</Badge>}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs text-muted-foreground mb-3">
                      Schedule Export (.xlsx, .csv, .txt). Detecta turnos, Weekend Jobs y PayRide automáticamente.
                    </p>
                    <label className="flex flex-col items-center gap-2 p-4 border-2 border-dashed rounded-xl cursor-pointer hover:border-primary/50 transition-colors">
                      <Upload className="h-5 w-5 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">
                        {scheduleFiles.length > 0 ? scheduleFiles.map(f => f.name).join(", ") : "Subir archivo(s)"}
                      </span>
                      <input type="file" className="hidden" accept={ACCEPTED_FORMATS} multiple onChange={handleScheduleFiles} />
                    </label>
                    <Button variant="ghost" size="sm" className="mt-2 w-full text-xs gap-1.5 text-muted-foreground" onClick={() => downloadTemplate("schedule")}>
                      <Download className="h-3.5 w-3.5" /> Descargar plantilla
                    </Button>
                  </CardContent>
                </Card>

                {/* Time Clock */}
                <Card className={clockFile ? "ring-2 ring-primary/30" : ""}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Clock className="h-4 w-4 text-emerald-500" />
                      Paso 2: Relojes
                      {clockFile && <Badge variant="secondary" className="ml-auto">1 archivo</Badge>}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs text-muted-foreground mb-3">
                      Time Clock Report (.xlsx, .csv, .txt). Crea entradas de reloj y vincula a turnos.
                    </p>
                    <label className="flex flex-col items-center gap-2 p-4 border-2 border-dashed rounded-xl cursor-pointer hover:border-primary/50 transition-colors">
                      <Upload className="h-5 w-5 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">
                        {clockFile ? clockFile.name : "Subir archivo"}
                      </span>
                      <input type="file" className="hidden" accept={ACCEPTED_FORMATS} onChange={handleClockFile} />
                    </label>
                    <Button variant="ghost" size="sm" className="mt-2 w-full text-xs gap-1.5 text-muted-foreground" onClick={() => downloadTemplate("timeclock")}>
                      <Download className="h-3.5 w-3.5" /> Descargar plantilla
                    </Button>
                  </CardContent>
                </Card>

                {/* Payroll */}
                <Card className={payrollFile ? "ring-2 ring-primary/30" : ""}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <DollarSign className="h-4 w-4 text-amber-500" />
                      Paso 3: Nómina
                      {payrollFile && <Badge variant="secondary" className="ml-auto">1 archivo</Badge>}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs text-muted-foreground mb-3">
                      Nómina Final (.xlsx, .csv, .txt). Detecta Weekend Job, Transporte, Tips, Descuentos.
                    </p>
                    <label className="flex flex-col items-center gap-2 p-4 border-2 border-dashed rounded-xl cursor-pointer hover:border-primary/50 transition-colors">
                      <Upload className="h-5 w-5 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">
                        {payrollFile ? payrollFile.name : "Subir archivo"}
                      </span>
                      <input type="file" className="hidden" accept={ACCEPTED_FORMATS} onChange={handlePayrollFile} />
                    </label>
                    <Button variant="ghost" size="sm" className="mt-2 w-full text-xs gap-1.5 text-muted-foreground" onClick={() => downloadTemplate("payroll")}>
                      <Download className="h-3.5 w-3.5" /> Descargar plantilla
                    </Button>
                  </CardContent>
                </Card>
              </div>

              <div className="flex items-center gap-2 p-3 rounded-xl bg-muted/50 text-xs text-muted-foreground">
                <Info className="h-4 w-4 shrink-0" />
                Soporta Excel (.xlsx), CSV y TXT. Puedes subir solo los archivos que necesites — no es obligatorio completar los 3 pasos.
              </div>

              <div className="flex justify-end">
                <Button onClick={handleParseAll} disabled={!hasAnyFile || parsing} className="gap-2">
                  {parsing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
                  {parsing ? "Procesando..." : "Validar archivos"}
                </Button>
              </div>
            </div>
          )}

          {/* ═══ STEP: VALIDATION ═══ */}
          {step === "validation" && validation && (
            <div className="space-y-4">
              {/* KPIs */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {scheduleFiles.length > 0 && (
                  <KpiCard label="Turnos a crear" value={validation.scheduleShifts - validation.scheduleDuplicates} icon={CalendarDays} />
                )}
                {scheduleFiles.length > 0 && (
                  <KpiCard label="Asignaciones" value={validation.scheduleAssignments} icon={Users} />
                )}
                {clockFile && (
                  <KpiCard label="Registros de reloj" value={validation.clockEntries} icon={Clock} color="text-emerald-500" />
                )}
                {payrollFile && (
                  <KpiCard label="Movimientos nómina" value={validation.payrollMovements} icon={DollarSign} color="text-amber-500" />
                )}
              </div>

              {/* Detections */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {validation.scheduleWeekendJobs > 0 && (
                  <div className="flex items-center gap-2 p-2.5 rounded-xl bg-violet-50 dark:bg-violet-900/15 border text-xs">
                    <FileSpreadsheet className="h-4 w-4 text-violet-500" />
                    <span><strong>{validation.scheduleWeekendJobs}</strong> Weekend Jobs</span>
                  </div>
                )}
                {validation.schedulePayRides > 0 && (
                  <div className="flex items-center gap-2 p-2.5 rounded-xl bg-sky-50 dark:bg-sky-900/15 border text-xs">
                    <Car className="h-4 w-4 text-sky-500" />
                    <span><strong>{validation.schedulePayRides}</strong> PayRides</span>
                  </div>
                )}
                {validation.scheduleDuplicates > 0 && (
                  <div className="flex items-center gap-2 p-2.5 rounded-xl bg-amber-50 dark:bg-amber-900/15 border text-xs">
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                    <span><strong>{validation.scheduleDuplicates}</strong> duplicados</span>
                  </div>
                )}
                {validation.scheduleUnavailable > 0 && (
                  <div className="flex items-center gap-2 p-2.5 rounded-xl bg-muted border text-xs">
                    <AlertCircle className="h-4 w-4 text-muted-foreground" />
                    <span><strong>{validation.scheduleUnavailable}</strong> no disponibles</span>
                  </div>
                )}
              </div>

              {/* Warnings */}
              {validation.warnings.length > 0 && (
                <Card className="border-amber-200 dark:border-amber-800">
                  <CardContent className="pt-4">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                      <div className="text-xs space-y-1">
                        {validation.warnings.map((w, i) => <p key={i}>{w}</p>)}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Unmatched employees */}
              {validation.unmatchedEmployees.length > 0 && (
                <details className="rounded-xl border">
                  <summary className="p-3 text-xs font-medium cursor-pointer select-none flex items-center gap-2">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    {validation.unmatchedEmployees.length} empleados no encontrados
                    <ChevronDown className="h-3.5 w-3.5 ml-auto" />
                  </summary>
                  <div className="px-3 pb-3 text-xs text-muted-foreground">
                    {validation.unmatchedEmployees.join(", ")}
                  </div>
                </details>
              )}

              {/* Payroll preview */}
              {payrollExtras.length > 0 && (
                <details className="rounded-xl border">
                  <summary className="p-3 text-xs font-medium cursor-pointer select-none flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-amber-500" />
                    Vista previa de nómina ({payrollExtras.length} empleados, ${validation.payrollTotal.toLocaleString("en-US", { minimumFractionDigits: 2 })})
                    <ChevronDown className="h-3.5 w-3.5 ml-auto" />
                  </summary>
                  <div className="overflow-x-auto max-h-60">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Empleado</TableHead>
                          {payrollDetectedCols.map(c => <TableHead key={c} className="text-xs">{c}</TableHead>)}
                          <TableHead className="text-xs text-right">Total</TableHead>
                          <TableHead className="text-xs">Estado</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {payrollExtras.slice(0, 20).map((e, i) => (
                          <TableRow key={i}>
                            <TableCell className="text-xs">{e.firstName} {e.lastName}</TableCell>
                            {payrollDetectedCols.map(c => {
                              const ex = e.extras.find(x => x.column === c);
                              return <TableCell key={c} className="text-xs">{ex ? `$${ex.value.toFixed(2)}` : "—"}</TableCell>;
                            })}
                            <TableCell className="text-xs text-right font-medium">${Math.abs(e.total).toFixed(2)}</TableCell>
                            <TableCell>
                              <Badge variant={e.employeeId ? "default" : "destructive"} className="text-[10px]">
                                {e.employeeId ? "Vinculado" : "No encontrado"}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {payrollExtras.length > 20 && (
                      <p className="text-xs text-muted-foreground p-2">...y {payrollExtras.length - 20} más</p>
                    )}
                  </div>
                </details>
              )}

              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep("upload")} className="gap-1.5">
                  <RotateCcw className="h-4 w-4" />
                  Volver
                </Button>
                <Button onClick={() => setStep("confirm")} className="gap-1.5">
                  <CheckCircle2 className="h-4 w-4" />
                  Revisar y confirmar
                </Button>
              </div>
            </div>
          )}

          {/* ═══ STEP: CONFIRM ═══ */}
          {step === "confirm" && validation && (
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-primary" />
                    Confirmar Importación
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="text-sm space-y-2">
                    {scheduleFiles.length > 0 && (
                      <div className="flex items-center gap-2">
                        <CalendarDays className="h-4 w-4 text-primary" />
                        <span><strong>{validation.scheduleShifts - validation.scheduleDuplicates}</strong> turnos se crearán con <strong>{validation.scheduleAssignments}</strong> asignaciones</span>
                      </div>
                    )}
                    {clockFile && (
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-emerald-500" />
                        <span><strong>{validation.clockEntries}</strong> registros de reloj se crearán</span>
                      </div>
                    )}
                    {payrollFile && (
                      <div className="flex items-center gap-2">
                        <DollarSign className="h-4 w-4 text-amber-500" />
                        <span><strong>{validation.payrollMovements}</strong> movimientos de nómina ($
                          {validation.payrollTotal.toLocaleString("en-US", { minimumFractionDigits: 2 })})</span>
                      </div>
                    )}
                  </div>

                  <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-900/15 border border-amber-200 dark:border-amber-800 text-xs">
                    <strong>⚠️ Esta acción no se puede deshacer fácilmente.</strong> Los datos se escribirán directamente en la base de datos.
                    Revisa los totales antes de confirmar.
                  </div>
                </CardContent>
              </Card>

              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep("validation")} className="gap-1.5">
                  <RotateCcw className="h-4 w-4" />
                  Volver
                </Button>
                <Button onClick={() => setShowConfirm(true)} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white">
                  <CheckCircle2 className="h-4 w-4" />
                  Confirmar e importar
                </Button>
              </div>
            </div>
          )}

          {/* ═══ STEP: IMPORTING ═══ */}
          {step === "importing" && (
            <Card>
              <CardContent className="py-12 flex flex-col items-center gap-4">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm font-medium">{importProgress || "Procesando..."}</p>
                <p className="text-xs text-muted-foreground">No cierres esta ventana</p>
              </CardContent>
            </Card>
          )}

          {/* ═══ STEP: RESULT ═══ */}
          {step === "result" && importResult && (
            <div className="space-y-4">
              <Card className={importResult.success ? "border-emerald-200 dark:border-emerald-800" : "border-destructive"}>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    {importResult.success
                      ? <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                      : <AlertCircle className="h-5 w-5 text-destructive" />
                    }
                    {importResult.message}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {importResult.details.scheduleShiftsCreated !== undefined && (
                      <KpiCard label="Turnos creados" value={importResult.details.scheduleShiftsCreated} icon={CalendarDays} />
                    )}
                    {importResult.details.scheduleAssignmentsCreated !== undefined && (
                      <KpiCard label="Asignaciones" value={importResult.details.scheduleAssignmentsCreated} icon={Users} />
                    )}
                    {importResult.details.timeClockCreated !== undefined && (
                      <KpiCard label="Relojes creados" value={importResult.details.timeClockCreated} icon={Clock} color="text-emerald-500" />
                    )}
                    {importResult.details.payrollMovementsCreated !== undefined && (
                      <KpiCard label="Movimientos" value={importResult.details.payrollMovementsCreated} icon={DollarSign} color="text-amber-500" />
                    )}
                    {(importResult.details.scheduleDuplicatesSkipped ?? 0) > 0 && (
                      <KpiCard label="Duplicados omitidos" value={importResult.details.scheduleDuplicatesSkipped} icon={SkipForward} color="text-muted-foreground" />
                    )}
                    {(importResult.details.timeClockOverlap ?? 0) > 0 && (
                      <KpiCard label="Solapamientos" value={importResult.details.timeClockOverlap} icon={AlertTriangle} color="text-amber-500" />
                    )}
                    {(importResult.details.scheduleClientsCreated ?? 0) > 0 && (
                      <KpiCard label="Clientes creados" value={importResult.details.scheduleClientsCreated} icon={FileSpreadsheet} color="text-sky-500" />
                    )}
                    {(importResult.details.scheduleEmployeesCreated ?? 0) > 0 && (
                      <KpiCard label="Empleados creados" value={importResult.details.scheduleEmployeesCreated} icon={Users} color="text-violet-500" />
                    )}
                  </div>
                </CardContent>
              </Card>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={resetWizard} className="gap-1.5">
                  <RotateCcw className="h-4 w-4" />
                  Nueva importación
                </Button>
                <Button variant="outline" onClick={() => { setActiveTab("history"); loadHistory(); }} className="gap-1.5">
                  <History className="h-4 w-4" />
                  Ver historial
                </Button>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ═══ HISTORY TAB ═══ */}
        <TabsContent value="history" className="mt-4">
          {loadingHistory ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : history.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                No hay importaciones registradas
              </CardContent>
            </Card>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Fecha</TableHead>
                    <TableHead className="text-xs">Tipo</TableHead>
                    <TableHead className="text-xs">Archivos</TableHead>
                    <TableHead className="text-xs text-right">Turnos</TableHead>
                    <TableHead className="text-xs text-right">Relojes</TableHead>
                    <TableHead className="text-xs text-right">Movimientos</TableHead>
                    <TableHead className="text-xs">Rango</TableHead>
                    <TableHead className="text-xs">Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map(h => (
                    <TableRow key={h.id}>
                      <TableCell className="text-xs">{format(new Date(h.created_at), "dd/MM/yyyy HH:mm")}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">{h.batch_type}</Badge>
                      </TableCell>
                      <TableCell className="text-xs max-w-40 truncate">
                        {[h.schedule_file_name, h.timeclock_file_name, h.payroll_file_name].filter(Boolean).join(", ") || "—"}
                      </TableCell>
                      <TableCell className="text-xs text-right">{h.schedule_shifts_created || "—"}</TableCell>
                      <TableCell className="text-xs text-right">{h.timeclock_entries_created || "—"}</TableCell>
                      <TableCell className="text-xs text-right">{h.payroll_movements_created || "—"}</TableCell>
                      <TableCell className="text-xs">
                        {h.date_range_from && h.date_range_to
                          ? `${h.date_range_from} → ${h.date_range_to}`
                          : "—"
                        }
                      </TableCell>
                      <TableCell>
                        <Badge variant={h.status === "completed" ? "default" : "destructive"} className="text-[10px]">
                          {h.status === "completed" ? "✓" : "Revertido"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Confirm dialog */}
      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Confirmar importación?</AlertDialogTitle>
            <AlertDialogDescription>
              Se escribirán datos en las tablas de turnos, relojes y/o movimientos.
              Los duplicados se omitirán automáticamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={executeImport} className="bg-emerald-600 hover:bg-emerald-700">
              Importar ahora
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
