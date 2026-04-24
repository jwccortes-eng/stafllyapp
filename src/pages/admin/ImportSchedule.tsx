import React, { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, ChevronDown, Trash2, Info, Lock, CalendarDays, Users, MapPin, Building2 } from "lucide-react";
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

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ACCEPTED_EXTENSIONS = ".xls,.xlsx,.csv";

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
  const [forceReimport, setForceReimport] = useState(false);

  // Filter dates if the range is large
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");

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

  const filteredGroups = shiftGroups.filter(g => {
    if (filterFrom && g.date < filterFrom) return false;
    if (filterTo && g.date > filterTo) return false;
    return true;
  });

  const handleImport = async () => {
    if (!selectedCompanyId || filteredGroups.length === 0) return;
    setImporting(true);
    setResult(null);
    setImportProgress({ current: 0, total: filteredGroups.length, phase: "Preparando..." });

    try {
      // ── Check for duplicate file upload using company_settings ──
      const { data: setting } = await supabase
        .from("company_settings")
        .select("value")
        .eq("company_id", selectedCompanyId)
        .eq("key", "imported_schedule_files")
        .single();
      const importedFiles: string[] = setting?.value ? (Array.isArray(setting.value) ? setting.value as string[] : []) : [];
      const fileNames = files.length > 0 ? files.map(f => f.name) : (file ? [file.name] : []);
      const alreadyImported = fileNames.filter(n => importedFiles.includes(n));
      if (alreadyImported.length > 0) {
        setResult({ success: false, message: `Archivo(s) ya importado(s): ${alreadyImported.join(", ")}. Usa archivos diferentes o elimina la importación anterior.` });
        setImporting(false);
        setImportProgress(null);
        return;
      }

      // Fetch employees and clients for matching
      setImportProgress({ current: 0, total: filteredGroups.length, phase: "Cargando maestros..." });
      const [{ data: employees }, { data: clients }] = await Promise.all([
        supabase.from("employees").select("id, first_name, last_name").eq("company_id", selectedCompanyId),
        supabase.from("clients").select("id, name").eq("company_id", selectedCompanyId).is("deleted_at", null),
      ]);
      const empList = employees ?? [];
      const clientList = clients ?? [];

      const empMap = new Map<string, string>();
      empList.forEach(e => {
        empMap.set(`${e.first_name} ${e.last_name}`.toLowerCase(), e.id);
      });

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

      // ── Auto-create unmatched employees ──
      setImportProgress({ current: 0, total: filteredGroups.length, phase: "Creando empleados nuevos..." });
      const allEmpNames = new Set(filteredGroups.flatMap(g => g.employees));
      let createdEmployees = 0;
      for (const empName of allEmpNames) {
        if (empMap.has(empName.toLowerCase())) continue;
        const parsed = parseName(empName);
        if (!parsed) continue;
        if (/^system\s/i.test(empName)) continue;
        const { data: newEmp } = await supabase.from("employees").insert({
          company_id: selectedCompanyId,
          first_name: parsed.first,
          last_name: parsed.last,
          is_active: true,
        } as any).select("id").single();
        if (newEmp) {
          empMap.set(empName.toLowerCase(), newEmp.id);
          createdEmployees++;
        }
      }

      let totalShifts = 0;
      let totalAssignments = 0;
      let matchedEmployees = 0;
      let unmatchedEmployeesSet = new Set<string>();
      let matchedClients = 0;
      let unmatchedClientsSet = new Set<string>();

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
        // Track client/employee match stats just like fresh inserts
        const clientId = matchClient(group.job);
        if (clientId) matchedClients++;
        else if (group.job) unmatchedClientsSet.add(group.job);

        const realEmployees = group.employees.filter(e => !/^system\s/i.test(e));

        // Resolve employee IDs from this group
        type Resolved = { empId: string; status: string };
        const resolved: Resolved[] = [];
        for (let ei = 0; ei < group.employees.length; ei++) {
          const empName = group.employees[ei];
          if (/^system\s/i.test(empName)) continue;
          const empId = empMap.get(empName.toLowerCase());
          if (!empId) {
            unmatchedEmployeesSet.add(empName);
            continue;
          }
          matchedEmployees++;
          const empStatus = (group.employeeStatuses[ei] || "").toLowerCase();
          const statusMap: Record<string, string> = { accept: "accepted", decline: "rejected" };
          resolved.push({ empId, status: statusMap[empStatus] ?? "accepted" });
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
          if (existing) {
            // Already assigned — only promote pending → accepted/rejected if Excel says so
            if (existing.status === "pending" && (r.status === "accepted" || r.status === "rejected")) {
              const { error: updErr } = await supabase
                .from("shift_assignments")
                .update({ status: r.status })
                .eq("id", existing.id);
              if (!updErr) reconciledAssignments++;
              else skippedExistingAssignments++;
            } else {
              skippedExistingAssignments++;
            }
            continue;
          }
          try {
            const { error } = await supabase.from("shift_assignments").insert({
              company_id: selectedCompanyId,
              shift_id: existingShiftId,
              employee_id: r.empId,
              status: r.status,
            });
            if (!error) reconciledAssignments++;
          } catch { /* skip overlap */ }
        }

        // Grow slots only if the Excel brings more real employees than current capacity
        if (realEmployees.length > existingSlots) {
          await supabase
            .from("scheduled_shifts")
            .update({ slots: realEmployees.length })
            .eq("id", existingShiftId);
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

        // Create assignments for each shift in the batch
        const assignmentPayloads: any[] = [];
        for (let i = 0; i < newBatch.length; i++) {
          const group = newBatch[i];
          const shift = insertedShifts[i];
          if (!shift) continue;

          for (let ei = 0; ei < group.employees.length; ei++) {
            const empName = group.employees[ei];
            if (/^system\s/i.test(empName)) continue;
            const empId = empMap.get(empName.toLowerCase());
            if (!empId) {
              unmatchedEmployeesSet.add(empName);
              continue;
            }
            matchedEmployees++;
            const empStatus = (group.employeeStatuses[ei] || "").toLowerCase();
            const statusMap: Record<string, string> = { accept: "accepted", decline: "rejected" };
            const assignStatus = statusMap[empStatus] ?? "accepted";
            assignmentPayloads.push({
              company_id: selectedCompanyId,
              shift_id: shift.id,
              employee_id: empId,
              status: assignStatus,
            });
          }
        }

        // Insert assignments in sub-batches to handle overlap errors gracefully
        if (assignmentPayloads.length > 0) {
          const { data: assignResult, error: assignErr } = await supabase
            .from("shift_assignments")
            .insert(assignmentPayloads)
            .select("id");

          if (assignErr) {
            // If batch fails (overlap trigger), fall back to one-by-one
            for (const payload of assignmentPayloads) {
              try {
                const { error } = await supabase.from("shift_assignments").insert(payload);
                if (!error) totalAssignments++;
              } catch { /* skip overlap */ }
            }
          } else {
            totalAssignments += assignResult?.length ?? 0;
          }
        }

        // Yield to UI thread
        await new Promise(resolve => setTimeout(resolve, 30));
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
        const empId = empMap.get(`${name.first} ${name.last}`.toLowerCase());
        if (!empId) continue;
        unavailPayloads.push({
          employee_id: empId,
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
      };
      setSummary(summaryData);

      const createdMsg = (createdClients + createdEmployees) > 0
        ? ` · ${createdClients} clientes y ${createdEmployees} empleados creados`
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

      setResult({
        success: true,
        message: `Importación completada: ${totalShifts} turnos, ${totalAssignments} asignaciones${createdMsg}${unmatchedMsg}${unavailMsg}${dupMsg}${reconciledMsg}.`,
      });
      setStep(4);
    } catch (err: any) {
      setResult({ success: false, message: getUserFriendlyError(err) });
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

          <div className="flex gap-3">
            <Button variant="outline" onClick={() => { setStep(1); setFile(null); setFiles([]); setWorkbook(null); setShiftGroups([]); }}>
              ← Cambiar archivos
            </Button>
            <Button onClick={handleImport} disabled={importing || filteredGroups.length === 0}>
              {importing ? "Importando…" : `Importar ${filteredGroups.length} turnos`}
            </Button>
          </div>

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
        </div>
      )}

      {/* Step 4: Result */}
      {step === 4 && result && (
        <div className="space-y-4">
          <Card className={result.success ? "border-emerald-200 bg-emerald-50/50 dark:border-emerald-900 dark:bg-emerald-950/20" : "border-destructive/30 bg-destructive/5"}>
            <CardContent className="p-6">
              <div className="flex items-start gap-3">
                {result.success ? <CheckCircle2 className="h-6 w-6 text-emerald-600 shrink-0 mt-0.5" /> : <AlertCircle className="h-6 w-6 text-destructive shrink-0 mt-0.5" />}
                <div>
                  <p className="font-semibold text-sm">{result.success ? "Importación exitosa" : "Error en importación"}</p>
                  <p className="text-sm text-muted-foreground mt-1">{result.message}</p>
                </div>
              </div>
            </CardContent>
          </Card>

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
