import { useEffect, useState, useCallback, useMemo } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { usePageView } from "@/hooks/useAuditLog";
import AuditPanel from "@/components/audit/AuditPanel";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPaginated } from "@/lib/supabase-pagination";
import { formatPersonName, formatDisplayText } from "@/lib/format-helpers";
import { Button } from "@/components/ui/button";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { EntityCard } from "@/components/entities/EntityCard";
import { buildWorkerEntityView, type WorkerEntityInput } from "@/lib/entities/entity-presenters";
import { getRiskMeta } from "@/lib/data-quality-risks";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Plus, Search, Upload, FileSpreadsheet, CheckCircle2, MoreHorizontal, Pencil, Trash2, UserX, UserCheck, Eye, RefreshCw, ArrowUpDown, Users, Download, X, Phone, Mail, LayoutGrid, List, MessageCircle, Send, Loader2, Clock, Shield, KeyRound, Settings2, Archive, Hash, Building2, UserPlus, Rocket, Car, FileWarning, RotateCw, Copy as CopyIcon, UserSearch } from "lucide-react";
import { normalizePhone } from "@/lib/phone";
import { BulkActionsBar } from "@/components/ui/bulk-actions-bar";
import { PageHeader } from "@/components/ui/page-header";
import { PremiumPageHeader, type PremiumPageHeaderKpi } from "@/components/ui/premium-page-header";
import { OperationalWorkspace, type WorkspaceMetric } from "@/components/stafly-ui/OperationalWorkspace";

import { PremiumFilterBar, type ActiveFilterChip } from "@/components/ui/premium-filter-bar";
import { PremiumAvatar, type PremiumAvatarStatus } from "@/components/ui/premium-avatar";
import { ViewSwitcher, type ViewMode } from "@/components/ui/view-switcher";
import { SortIndicator } from "@/components/ui/sort-indicator";
import { useUrlFilters } from "@/hooks/useUrlFilters";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSortPreference } from "@/hooks/useSortPreference";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorBlock } from "@/components/ui/error-block";
import { cn } from "@/lib/utils";
import { notifyError, notifySuccess, notifyWarning } from "@/lib/feedback/notify";
import { getUserFriendlyError } from "@/lib/error-helpers";
import { parseConnecteamFile, type ParsedEmployee } from "@/lib/connecteam-parser";
import { safeRead, safeSheetToJson, getSheetNames, getSheet, writeExcelFile } from "@/lib/safe-xlsx";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import {
  resolveExistingEmployeeIdentity,
  resolveIdentityFromIndex,
  buildEmployeeIdentityIndex,
  identityBlockMessage,
  EMPLOYEE_IDENTITY_FIELDS,
  type IdentityCandidateRecord,
} from "@/lib/identity/employee-identity-resolver";
import { buildEmployeeCreationTrace, logEmployeeCreation, newCorrelationId } from "@/lib/identity/creation-trace";
import PasswordConfirmDialog from "@/components/PasswordConfirmDialog";
import { EmployeeProfileTabs } from "@/components/employee/EmployeeProfileTabs";
import { BulkRateAssignment } from "@/components/employee/BulkRateAssignment";
import { EmployeeInviteDialog } from "@/components/employee/EmployeeInviteDialog";
import WorkerDataQualityReview from "@/components/employee/WorkerDataQualityReview";
import WorkerDocumentsCompliance from "@/components/employee/WorkerDocumentsCompliance";
import IdentityResolutionDrawer from "@/components/employee/IdentityResolutionDrawer";
import { isPendingIdentity, isPlaceholderWorker } from "@/lib/employee-identity";
import { QuickAddInviteWizard } from "@/components/employee/QuickAddInviteWizard";
import { useEmployeeInvitations } from "@/hooks/useEmployeeInvitations";
import { canInviteWorker, isWorkerInviteFailed } from "@/lib/worker-actions";
import { useSubscription } from "@/hooks/useSubscription";
import UpgradeBanner from "@/components/billing/UpgradeBanner";
import { formatDistanceToNow, parseISO, isValid, differenceInDays } from "date-fns";
import { enUS } from "date-fns/locale";
import { ArchiveEmployeeDialog } from "@/components/employee/ArchiveEmployeeDialog";
import { ColumnPreferencesDialog, useColumnPreferences, EMPLOYEE_COLUMNS } from "@/components/employee/ColumnPreferencesDialog";
import { BulkActivationCampaignDialog } from "@/components/employee/BulkActivationCampaignDialog";
import { useOnboardingConfig } from "@/hooks/useOnboardingConfig";
import { ModuleSettingsSheet } from "@/components/settings/ModuleSettingsSheet";
import type { SettingsSection } from "@/components/settings/ModuleSettingsSheet";
import DataQualityRiskPanel, { WorkerRiskTags } from "@/components/employee/DataQualityRiskPanel";
import { analyzeEmployeeRisks, type RiskKey } from "@/lib/data-quality-risks";
import { buildBulkRemindersText } from "@/lib/data-quality-actions";
import { useCompanyDocuments } from "@/hooks/useCompanyDocuments";
import MobileDataQualitySummary from "@/components/employee/MobileDataQualitySummary";
import { WorkerPhotoStatusChip } from "@/components/employee/WorkerPhotoStatusChip";
import { PhotoReviewCriteriaCard } from "@/components/employee/PhotoReviewCriteriaCard";

// Fields that only owner/admin can see
const SENSITIVE_FIELD_KEYS = new Set([
  "access_pin", "driver_licence", "has_car", "country_code", "english_level",
]);

const CONNECTEAM_FIELDS: { key: string; label: string; fileCol: string[]; required?: boolean; hidden?: boolean }[] = [
  { key: "first_name", label: "First Name", fileCol: ["First name"], required: true },
  { key: "last_name", label: "Last Name", fileCol: ["Last name"], required: true },
  { key: "phone_number", label: "Phone", fileCol: ["Mobile phone", "Phone"] },
  { key: "country_code", label: "Country Code", fileCol: ["Country code"] },
  { key: "email", label: "Email", fileCol: ["Email"] },
  { key: "birthday", label: "Birthday", fileCol: ["Birthday", "Date of Birth"] },
  { key: "address", label: "Address", fileCol: ["Address"] },
  { key: "county", label: "County", fileCol: ["County"] },
  { key: "access_pin", label: "Access PIN", fileCol: [], hidden: true },
  { key: "start_date", label: "Start Date", fileCol: ["Start Date"] },
  { key: "english_level", label: "English Level", fileCol: ["English Level"] },
  { key: "employee_role", label: "Role", fileCol: ["Role"] },
  { key: "qualify", label: "Qualification", fileCol: ["Qualify"] },
  { key: "recommended_by", label: "Recommended By", fileCol: ["Recommended by?"] },
  { key: "direct_manager", label: "Direct Manager", fileCol: ["Direct manager"] },
  { key: "has_car", label: "Has Car?", fileCol: ["You have car?"] },
  { key: "driver_licence", label: "License", fileCol: ["Driver Licence"] },
  { key: "end_date", label: "End Date", fileCol: ["End Date"] },
  { key: "date_added", label: "Date Added", fileCol: ["Date added"] },
  { key: "last_login", label: "Last Login", fileCol: ["Last login"] },
  { key: "connecteam_employee_id", label: "Connecteam ID", fileCol: ["Connecteam User ID"] },
  { key: "added_via", label: "Added Via", fileCol: ["Added via"] },
  { key: "added_by", label: "Added By", fileCol: ["Added by"] },
  { key: "groups", label: "Groups", fileCol: ["Groups"] },
  { key: "tags", label: "Tags", fileCol: ["Tags"] },
];

type EmployeeRecord = Record<string, any>;

const toTitleCase = (s: string | null | undefined): string => {
  if (!s) return "";
  return s.trim().toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
};

const NAME_FIELDS = ["first_name", "last_name", "direct_manager", "recommended_by", "added_by"];

interface ImportPreviewRow extends EmployeeRecord {
  exists: boolean;
}

interface UpdateDiff {
  employeeId: string;
  name: string;
  changes: { field: string; label: string; oldVal: string; newVal: string }[];
  selected: boolean;
}

/* ── Status badge — delegates to reusable component ── */
import { PortalAccessBadge } from "@/components/employee/PortalAccessBadge";
import type { InvitationMap } from "@/hooks/useEmployeeInvitations";
import { inviteUrl } from "@/lib/app-url";


function EmpStatusBadge({
  employee,
  showInvite,
  onInvite,
  onCopyLink,
  invitation,
}: {
  employee: EmployeeRecord;
  showInvite?: boolean;
  onInvite?: () => void;
  onCopyLink?: (token: string) => void;
  invitation?: InvitationMap[string] | null;
}) {
  return (
    <PortalAccessBadge
      employee={employee}
      invitation={invitation}
      showInviteAction={showInvite}
      onInvite={onInvite}
      onCopyLink={onCopyLink}
    />
  );
}

const BOOLEAN_FIELDS = new Set(["has_car"]);

interface EmployeeFormProps {
  fields: typeof CONNECTEAM_FIELDS;
  form: Record<string, string>;
  setForm: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  loading: boolean;
  onSubmit: (e: React.FormEvent) => void;
  submitLabel: string;
}

function EmployeeForm({ fields, form, setForm, loading, onSubmit, submitLabel }: EmployeeFormProps) {
  return (
    <form onSubmit={onSubmit} className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
      {fields.map(f => (
        <FormField key={f.key} label={f.label} required={f.required} htmlFor={`emp-${f.key}`}>
          {BOOLEAN_FIELDS.has(f.key) ? (
            <div className="flex items-center gap-2 h-8">
              <Checkbox id={`emp-${f.key}`} checked={form[f.key] === "Yes" || form[f.key] === "true" || form[f.key] === "Sí"} onCheckedChange={c => setForm(prev => ({ ...prev, [f.key]: c ? "Yes" : "No" }))} />
              <Label htmlFor={`emp-${f.key}`} className="text-xs font-normal cursor-pointer">{form[f.key] === "Yes" || form[f.key] === "true" || form[f.key] === "Sí" ? "Yes" : "No"}</Label>
            </div>
          ) : (
            <Input id={`emp-${f.key}`} value={form[f.key] ?? ""} onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))} required={f.required} className="h-8 text-sm" />
          )}
        </FormField>
      ))}
      <Button type="submit" className="w-full" disabled={loading}>{loading ? "Saving..." : submitLabel}</Button>
    </form>
  );
}

export default function Employees() {
  usePageView("Employees");
  const { selectedCompanyId, selectedCompany } = useCompany();
  const { role, allRoles, canAccessAdminForCompany, user } = useAuth();
  // S3.5A: tenant-scoped admin check (was global canAccessAdmin).
  // Effective privilege: trust either the resolved highest-priority role OR
  // company-scoped admin access for the currently selected tenant. Same admin
  // role set as before — no permission widening.
  const canAdminHere = canAccessAdminForCompany(selectedCompanyId);
  const isPrivileged =
    role === 'developer' ||
    role === 'owner' ||
    role === 'company_owner' ||
    role === 'admin' ||
    allRoles.has('developer') ||
    allRoles.has('owner') ||
    allRoles.has('company_owner') ||
    allRoles.has('admin') ||
    canAdminHere;

  // Diagnostic log (safe — no PII). Helps confirm why the duplicates entry
  // does or doesn't show in the current company context.
  useEffect(() => {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.log("Workers duplicates access", {
        role,
        allRoles: Array.from(allRoles),
        canAdminHere,
        isPrivileged,
        selectedCompanyId,
      });
    }
  }, [role, allRoles, canAdminHere, isPrivileged, selectedCompanyId]);
  const { canAddEmployees, limits, plan } = useSubscription();
  const { config: onboardingConfig, updateConfig: updateOnboardingConfig, loading: onboardingConfigLoading } = useOnboardingConfig();
  const { invitations, logInvitation, refetch: refetchInvitations } = useEmployeeInvitations(selectedCompanyId ?? null);
  const [employees, setEmployees] = useState<EmployeeRecord[]>([]);
  const [onboardingSettingsOpen, setOnboardingSettingsOpen] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  // URL-persisted filters (search, status tab, role, group)
  const { filters: urlFilters, setFilter, resetFilters, activeCount: urlActiveCount } = useUrlFilters({
    q: "",
    status: "active",
    role: "all",
    group: "all",
    risk: "all",
    photo: "all",
  });
  const search = urlFilters.q;
  const setSearch = (v: string) => setFilter({ q: v });
 type StatusTab = "active" | "invited" | "failed" | "inactive" | "pending" | "all" | "missing-docs" | "no-photo" | "drivers" | "no-activity" | "new";
 const statusTab = (urlFilters.status as StatusTab) || "active";
  const setStatusTab = (v: StatusTab) => setFilter({ status: v });
  const filterRole = urlFilters.role;
  const setFilterRole = (v: string) => setFilter({ role: v });
  const filterGroup = urlFilters.group;
  const setFilterGroup = (v: string) => setFilter({ group: v });
  const riskFilter = (urlFilters.risk as RiskKey | "all") || "all";
  const setRiskFilter = (v: RiskKey | "all") => setFilter({ risk: v });
  type PhotoFilter = "all" | "missing" | "unreviewed" | "rejected" | "approved";
  const photoFilter = (urlFilters.photo as PhotoFilter) || "all";
  const setPhotoFilter = (v: PhotoFilter) => setFilter({ photo: v });

  // Persisted sort. v4 adds "photo" (missing/unreviewed first).
  type SortKey = "name" | "code" | "role" | "last_activity" | "photo";
  const { sort, onSort, directionFor, setSort } = useSortPreference<SortKey>(
    "employees",
    { key: "name", direction: "asc" },
  );

  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  // Open create dialog when navigated with ?create=1
  useEffect(() => {
    if (searchParams.get("create") === "1") {
      setOpen(true);
      setSearchParams(prev => { const p = new URLSearchParams(prev); p.delete("create"); return p; }, { replace: true });
    }
  }, [searchParams]);
  const [importOpen, setImportOpen] = useState(false);
  const [updateOpen, setUpdateOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<EmployeeRecord | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<EmployeeRecord | null>(null);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [viewEmployee, setViewEmployee] = useState<EmployeeRecord | null>(null);
  const [identityResolveOpen, setIdentityResolveOpen] = useState(false);
  const [profileActiveTab, setProfileActiveTab] = useState<string>("info");
  const [isEditing, setIsEditing] = useState(false);
  const [importPreview, setImportPreview] = useState<ImportPreviewRow[]>([]);
  const [importStep, setImportStep] = useState<"upload" | "preview" | "done">("upload");
  const [importResult, setImportResult] = useState<{ created: number; skipped: number } | null>(null);
  const [importing, setImporting] = useState(false);
  // Default desktop view is the premium "roster" (identity-card list).
  // Table remains available via the ViewSwitcher.
  const [viewMode, setViewMode] = useState<ViewMode>("roster");
  const isMobile = useIsMobile();
  // On mobile we always render the premium card view to avoid horizontal overflow
  // and to hide noisy admin metadata (employer_identification etc.) from the list.
  // P1 responsive: móvil usa SIEMPRE el roster canónico (EntityCard), no una vista aparte.
  const effectiveViewMode: ViewMode = isMobile ? "roster" : viewMode;
  const [updateDiffs, setUpdateDiffs] = useState<UpdateDiff[]>([]);
  const [updateStep, setUpdateStep] = useState<"upload" | "preview" | "done">("upload");
  const [updateResult, setUpdateResult] = useState<{ updated: number; skipped: number; created?: number } | null>(null);
  const [updating, setUpdating] = useState(false);
  const [updateMode, setUpdateMode] = useState<"diff" | "full">("full");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [bulkInviting, setBulkInviting] = useState(false);
  const [bulkReinviting, setBulkReinviting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [archiveTarget, setArchiveTarget] = useState<EmployeeRecord | null>(null);
  const [colPrefsOpen, setColPrefsOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [campaignOpen, setCampaignOpen] = useState(false);
  const { visibleColumns, savePreferences } = useColumnPreferences("employees");

  // Quick action: copy active invite token as a shareable activation link.
  const copyInviteLink = async (token: string) => {
    try {
      await navigator.clipboard.writeText(inviteUrl(token));
      notifySuccess({
        key: "invite-link-copy",
        title: "Enlace de invitación copiado",
        fact: "El enlace de activación está en tu portapapeles.",
        consequence: "Compártelo por el canal que prefieras.",
      });
    } catch (e) {
      notifyError({
        key: "invite-link-copy",
        title: "No pudimos copiar el enlace",
        fact: "Tu navegador bloqueó el acceso al portapapeles.",
        consequence: "Copia el enlace manualmente desde el perfil del worker.",
        cause: e,
      });
    }
  };

  const handleBulkPortalInvite = async () => {
    if (!selectedCompanyId) return;
    setBulkInviting(true);
    try {
      const { data, error } = await supabase.functions.invoke("bulk-portal-invite", {
        body: { company_id: selectedCompanyId },
      });
      if (error || data?.error) {
        notifyError({
          key: "bulk-invite",
          title: "No pudimos enviar las invitaciones",
          fact: data?.error ?? "El envío masivo no se completó.",
          consequence: "Ningún worker fue invitado. Vuelve a intentarlo.",
          cause: error ?? data?.error,
        });
        return;
      }
      notifySuccess({
        key: "bulk-invite",
        title: "Invitaciones enviadas",
        fact: `${data.processed} workers activados · ${data.emails_sent} emails enviados${data.skipped > 0 ? ` · ${data.skipped} omitidos` : ""}.`,
        consequence: "Podrán acceder al portal en cuanto activen su cuenta.",
      });
      fetchEmployees();
    } catch (e: any) {
      notifyError({
        key: "bulk-invite",
        title: "No pudimos enviar las invitaciones",
        fact: "Se perdió la conexión con el servidor.",
        consequence: "Ningún worker fue invitado. Revisa tu conexión e intenta de nuevo.",
        cause: e,
      });
    } finally {
      setBulkInviting(false);
    }
  };

  // ─── Selection helpers (per-row checkboxes for bulk actions) ─────────────
  const toggleRowSelected = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const clearSelection = () => setSelectedIds(new Set());
  const selectAllInList = (ids: string[]) => setSelectedIds(new Set(ids));

  /**
   * Bulk re-invite — re-sends invitations only for currently selected workers
   * whose latest invitation is in a failure state (failed / bounced / dlq).
   * Reuses the existing `bulk-portal-invite` edge function with `employee_ids`.
   */
  const handleBulkReinviteSelected = async () => {
    if (!selectedCompanyId) return;
    const failedIds = Array.from(selectedIds).filter(id => {
      const emp = employees.find(e => e.id === id);
      return emp ? isInviteFailed(emp) : false;
    });
    if (failedIds.length === 0) {
      notifyWarning({
        key: "bulk-reinvite",
        title: "No hay invitaciones para reenviar",
        fact: "Ninguno de los workers seleccionados tiene una invitación fallida.",
        consequence: "Selecciona workers cuyo último envío falló o rebotó.",
      });
      return;
    }
    setBulkReinviting(true);
    try {
      const { data, error } = await supabase.functions.invoke("bulk-portal-invite", {
        body: { company_id: selectedCompanyId, employee_ids: failedIds },
      });
      if (error || data?.error) {
        notifyError({
          key: "bulk-reinvite",
          title: "No pudimos reenviar las invitaciones",
          fact: data?.error ?? "El reenvío no se completó.",
          consequence: "Los workers siguen sin invitación válida.",
          cause: error ?? data?.error,
        });
        return;
      }
      const sent = Number(data?.emails_sent ?? 0);
      const processed = Number(data?.processed ?? 0);
      const skipped = Number(data?.skipped ?? 0);
      // Backend can return success with 0 processed (e.g. all employees lack phone).
      // Surface that as a warning instead of a misleading "Re-invited 0 ✅".
      if (sent === 0 && processed === 0) {
        // Éxito técnico con resultado cero: nunca lo presentamos como éxito.
        notifyWarning({
          key: "bulk-reinvite",
          title: "No se envió ninguna invitación",
          fact: data?.message ?? "Los workers seleccionados no tienen teléfono o no están en un estado elegible.",
          consequence: "Abre un perfil para revisar qué dato falta.",
        });
      } else {
        notifySuccess({
          key: "bulk-reinvite",
          title: `${sent} invitación${sent === 1 ? "" : "es"} reenviada${sent === 1 ? "" : "s"}`,
          fact: `${processed} procesados${skipped > 0 ? ` · ${skipped} omitidos` : ""}.`,
          consequence: "Los workers recibirán un nuevo enlace de activación.",
        });
      }
      clearSelection();
      await Promise.all([fetchEmployees(), refetchInvitations()]);
    } catch (e: any) {
      notifyError({
        key: "bulk-reinvite",
        title: "No pudimos reenviar las invitaciones",
        fact: "Se perdió la conexión con el servidor.",
        consequence: "No se envió nada. Revisa tu conexión e intenta de nuevo.",
        cause: e,
      });
    } finally {
      setBulkReinviting(false);
    }
  };

  const emptyForm = () => Object.fromEntries(CONNECTEAM_FIELDS.map(f => [f.key, ""]));

  const fetchEmployees = async () => {
    if (!selectedCompanyId) return;
    setFetchError(false);
    try {
      // Paginated fetch — Quality Staff has >1k employees, and the implicit
      // PostgREST cap of 1,000 rows was hiding workers whose first_name sorted
      // past the cutoff (e.g. "Monica Tabares" at row ~1,059). We keep the
      // exact same select + filters + ordering and only swap the executor.
      const COLS = "id, company_id, first_name, last_name, phone_number, email, employee_role, is_active, start_date, end_date, groups, tags, direct_manager, connecteam_employee_id, user_id, created_at, updated_at, avatar_url, country_code, date_added, driver_licence, english_level, gender, has_car, qualify, recommended_by, added_by, added_via, last_login, access_pin, employer_identification, onboarding_status, address_city, address_state, can_drive, has_vehicle, photo_review_status, photo_reviewed_at, photo_reviewed_by, photo_rejection_reason, worker_type, identity_status, requires_identity_resolution, payroll_approval_blocked, original_placeholder_name, identity_source, identity_notes";
      const result = await fetchAllPaginated<EmployeeRecord>((from, to) =>
        supabase
          .from("employees")
          .select(COLS)
          .eq("company_id", selectedCompanyId)
          .order("first_name", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to)
      );
      if (result.error) throw new Error(result.error.message);
      setEmployees(result.data);
    } catch (err) {
      console.error("fetchEmployees error:", err);
      setFetchError(true);
    } finally {
      setInitialLoading(false);
    }
  };

  useEffect(() => { fetchEmployees(); }, [selectedCompanyId]);

  // Reset bulk selection whenever the visible scope changes — prevents acting
  // on hidden rows. Search is debounce-free and cheap; covers all filter axes.
  useEffect(() => { clearSelection(); }, [statusTab, filterRole, filterGroup, search, selectedCompanyId]);

  // Keyboard shortcut: Esc clears selection while the bulk actions bar is shown.
  useEffect(() => {
    if (selectedIds.size === 0) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") clearSelection();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedIds.size]);


  const activeEmployeeCount = employees.filter(e => e.is_active !== false).length;
  const atEmployeeLimit = !canAddEmployees(activeEmployeeCount);

  const findCol = (row: Record<string, any>, candidates: string[]) => {
    const keys = Object.keys(row);
    for (const c of candidates) {
      const found = keys.find(k => k.toLowerCase().replace(/[_\s-]/g, "") === c.toLowerCase().replace(/[_\s-]/g, ""));
      if (found) return String(row[found]).trim();
    }
    return "";
  };

  const buildInsertData = (src: Record<string, string>) => {
    const data: Record<string, any> = {};
    CONNECTEAM_FIELDS.forEach(f => {
      let val = (src[f.key] ?? "").trim();
      if (NAME_FIELDS.includes(f.key)) val = toTitleCase(val);
      data[f.key] = val || null;
    });
    data.first_name = data.first_name || "";
    data.last_name = data.last_name || "";
    return data;
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (atEmployeeLimit) {
      notifyWarning({
        key: "employee-limit",
        title: "Alcanzaste el límite de tu plan",
        fact: `El plan ${limits.label} permite hasta ${limits.maxEmployees} workers activos.`,
        consequence: "Archiva workers inactivos o mejora tu plan para añadir más.",
      });
      return;
    }
    setLoading(true);
    const draft = buildInsertData(form);
    // P0 Fase 1 · resolver canónico de identidad antes de crear.
    const identity = await resolveExistingEmployeeIdentity(selectedCompanyId!, {
      firstName: draft.first_name,
      lastName: draft.last_name,
      phone: draft.phone_number,
      email: draft.email,
      employerIdentification: draft.employer_identification,
      externalId: draft.connecteam_employee_id,
    });
    if (identity.outcome !== "NOT_FOUND") {
      notifyWarning({
        key: "employee-identity-guard",
        title:
          identity.outcome === "EXACT_MATCH"
            ? "Esta persona ya existe"
            : "Posible duplicado: revisión requerida",
        fact: identityBlockMessage(identity),
        consequence: "No se creó ningún registro nuevo. Abre el perfil existente o resuelve la duplicidad.",
      });
      setLoading(false);
      return;
    }
    const { data: createdRow, error } = await supabase
      .from("employees")
      .insert({
        ...draft,
        ...buildEmployeeCreationTrace({ source: "manual", actorId: user?.id, actorLabel: user?.email }),
        company_id: selectedCompanyId,
      } as any)
      .select("id")
      .single();
    if (error) {
      notifyError({
        key: "employee-create",
        title: "No pudimos crear el worker",
        fact: getUserFriendlyError(error),
        consequence: "No se guardó nada. Tus datos siguen en el formulario.",
        cause: error,
      });
    } else {
      void logEmployeeCreation({
        companyId: selectedCompanyId!,
        employeeIds: createdRow?.id ? [createdRow.id] : [],
        trace: { source: "manual", actorId: user?.id, actorLabel: user?.email },
      });
      notifySuccess({
        key: "employee-create",
        title: "Worker creado",
        fact: "El perfil quedó guardado.",
        consequence: "Ya puedes asignarlo a turnos.",
      });

      setOpen(false);
      setForm(emptyForm());
      fetchEmployees();
    }
    setLoading(false);
  };

  const openEdit = (emp: EmployeeRecord) => {
    setEditingEmployee(emp);
    const f: Record<string, string> = {};
    CONNECTEAM_FIELDS.forEach(field => { f[field.key] = emp[field.key] ?? ""; });
    setForm(f);
    setEditOpen(true);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEmployee) return;
    setLoading(true);
    const { error } = await supabase.from("employees").update(buildInsertData(form) as any).eq("id", editingEmployee.id);
    if (error) {
      notifyError({
        key: "employee-update",
        title: "No pudimos guardar los cambios",
        fact: getUserFriendlyError(error),
        consequence: "El perfil quedó como estaba. Tus datos siguen en el formulario.",
        cause: error,
      });
    } else {
      notifySuccess({
        key: "employee-update",
        title: "Worker actualizado",
        fact: "Los cambios quedaron guardados.",
        consequence: "Se reflejan en los turnos futuros.",
      });
      setEditOpen(false);
      setEditingEmployee(null);
      setForm(emptyForm());
      fetchEmployees();
    }
    setLoading(false);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase.from("employees").delete().eq("id", deleteTarget.id);
    if (error) {
      notifyError({
        key: "employee-delete",
        title: "No pudimos archivar al worker",
        fact: getUserFriendlyError(error),
        consequence: "El worker sigue activo y asignable.",
        cause: error,
      });
    } else {
      notifySuccess({
        key: "employee-delete",
        title: "Worker archivado",
        fact: "Ya no aparece en la lista activa.",
        consequence: "No podrá ser asignado a nuevos turnos.",
      });
      fetchEmployees();
    }
    setDeleteTarget(null);
  };

  const toggleActive = async (emp: EmployeeRecord) => {
    if (emp.is_active) {
      setArchiveTarget(emp);
      return;
    }
    // Reactivating — check rehire eligibility first
    const { data: archiveRec } = await supabase
      .from("employee_archive_records" as any)
      .select("eligible_for_rehire, reason, notes")
      .eq("employee_id", emp.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single() as any;

    if (archiveRec && archiveRec.eligible_for_rehire === false) {
      const proceed = window.confirm(
        `⚠️ WARNING: ${emp.first_name} ${emp.last_name} was marked as NOT ELIGIBLE FOR REHIRE.\n\nReason: ${archiveRec.reason}\n${archiveRec.notes ? `Notes: ${archiveRec.notes}` : ""}\n\nDo you want to reactivate anyway?`
      );
      if (!proceed) return;
    }

    const { error } = await supabase.from("employees").update({ is_active: true }).eq("id", emp.id);
    if (error) {
      notifyError({
        key: "employee-reactivate",
        title: "No pudimos reactivar al worker",
        fact: getUserFriendlyError(error),
        consequence: "Sigue archivado y no puede ser asignado.",
        cause: error,
      });
    } else {
      notifySuccess({
        key: "employee-reactivate",
        title: "Worker reactivado",
        fact: "Vuelve a estar en la lista activa.",
        consequence: "Ya puede ser asignado a turnos.",
      });
      fetchEmployees();
    }
  };

  const matchEmployee = (parsed: ParsedEmployee): EmployeeRecord | undefined => {
    if (parsed.connecteam_employee_id) {
      const match = employees.find(e => e.connecteam_employee_id === parsed.connecteam_employee_id);
      if (match) return match;
    }
    if (parsed.phone_number) {
      const phone = parsed.phone_number.replace(/\D/g, "");
      const match = employees.find(e => e.phone_number?.replace(/\D/g, "") === phone);
      if (match) return match;
    }
    if (parsed.first_name && parsed.last_name) {
      const match = employees.find(
        e => e.first_name?.toLowerCase().trim() === parsed.first_name?.toLowerCase().trim() &&
             e.last_name?.toLowerCase().trim() === parsed.last_name?.toLowerCase().trim()
      );
      if (match) return match;
    }
    return undefined;
  };

  // ---- IMPORT ----
  const handleImportFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const content = await f.arrayBuffer();
    let parsed: ParsedEmployee[];
    try {
      parsed = await parseConnecteamFile(content, f.name);
    } catch {
      const wb = await safeRead(content);
      const names = getSheetNames(wb);
      const ws = getSheet(wb, names[0]);
      if (!ws) return;
      const rows = safeSheetToJson<Record<string, any>>(ws, { defval: "" });
      parsed = rows.map(row => {
        const mapped: ParsedEmployee = {};
        CONNECTEAM_FIELDS.forEach(field => { mapped[field.key] = findCol(row, field.fileCol); });
        return mapped;
      }).filter(r => r.first_name || r.last_name);
    }
    const seen = new Set<string>();
    const preview: ImportPreviewRow[] = [];
    for (const row of parsed) {
      const key = `${(row.first_name ?? "").toLowerCase()}|${(row.last_name ?? "").toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      preview.push({ ...row, exists: !!matchEmployee(row) });
    }
    setImportPreview(preview);
    setImportStep("preview");
  }, [employees]);

  /** Índice canónico de identidad del tenant (P0 Fase 1). */
  const loadIdentityIndex = async () => {
    const { data } = await supabase
      .from("employees")
      .select(EMPLOYEE_IDENTITY_FIELDS)
      .eq("company_id", selectedCompanyId!)
      .limit(5000);
    return buildEmployeeIdentityIndex((data ?? []) as unknown as IdentityCandidateRecord[]);
  };

  const executeImport = async () => {
    setImporting(true);
    const toCreate = importPreview.filter(r => !r.exists);
    const index = await loadIdentityIndex();
    const correlationId = newCorrelationId("csv-import");
    const createdIds: string[] = [];
    let created = 0;
    let blocked = 0;
    for (const emp of toCreate) {
      const data = buildInsertData(emp);
      const identity = resolveIdentityFromIndex(index, {
        firstName: data.first_name,
        lastName: data.last_name,
        phone: data.phone_number,
        email: data.email,
        employerIdentification: data.employer_identification,
        externalId: data.connecteam_employee_id,
      });
      if (identity.outcome !== "NOT_FOUND") { blocked++; continue; }
      const { data: row, error } = await supabase
        .from("employees")
        .insert({
          ...data,
          ...buildEmployeeCreationTrace({ source: "csv", actorId: user?.id, actorLabel: user?.email, correlationId }),
          company_id: selectedCompanyId,
        } as any)
        .select("id")
        .single();
      if (!error) { created++; if (row?.id) createdIds.push(row.id); }
    }
    if (createdIds.length) {
      void logEmployeeCreation({
        companyId: selectedCompanyId!,
        employeeIds: createdIds,
        trace: { source: "csv", actorId: user?.id, actorLabel: user?.email, correlationId },
        preventedDuplicates: blocked,
      });
    }
    if (blocked > 0) {
      notifyWarning({
        key: "csv-identity-guard",
        title: "Filas retenidas por posible duplicado",
        fact: `${blocked} personas ya existen o requieren revisión de identidad.`,
        consequence: "No se crearon esos registros. Resuélvelos en Calidad de identidad.",
      });
    }
    setImportResult({ created, skipped: importPreview.filter(r => r.exists).length + blocked });
    setImportStep("done");
    setImporting(false);
    fetchEmployees();
  };

  const resetImport = () => { setImportStep("upload"); setImportPreview([]); setImportResult(null); };

  // ---- UPDATE (diff or full replace) ----
  const handleUpdateFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const content = await f.arrayBuffer();
    let parsed: ParsedEmployee[];
    try {
      parsed = await parseConnecteamFile(content, f.name);
    } catch {
      const wb = await safeRead(content);
      const names = getSheetNames(wb);
      const ws = getSheet(wb, names[0]);
      if (!ws) return;
      const rows = safeSheetToJson<Record<string, any>>(ws, { defval: "" });
      parsed = rows.map(row => {
        const mapped: ParsedEmployee = {};
        CONNECTEAM_FIELDS.forEach(field => { mapped[field.key] = findCol(row, field.fileCol); });
        return mapped;
      }).filter(r => r.first_name || r.last_name);
    }
    const diffs: UpdateDiff[] = [];
    for (const row of parsed) {
      const existing = matchEmployee(row);
      if (!existing) {
        if (updateMode === "full") {
          const allChanges = CONNECTEAM_FIELDS.filter(field => row[field.key]?.trim()).map(field => ({ field: field.key, label: field.label, oldVal: "—", newVal: row[field.key] ?? "" }));
          if (allChanges.length > 0) diffs.push({ employeeId: "__new__" + (row.connecteam_employee_id || row.phone_number || `${row.first_name}_${row.last_name}`), name: `${row.first_name ?? ""} ${row.last_name ?? ""} (NEW)`, changes: allChanges, selected: true });
        }
        continue;
      }
      const changes: UpdateDiff["changes"] = [];
      CONNECTEAM_FIELDS.forEach(field => {
        const newVal = (row[field.key] ?? "").trim();
        const oldVal = String(existing[field.key] ?? "").trim();
        if (updateMode === "full") { if (newVal) changes.push({ field: field.key, label: field.label, oldVal: oldVal || "—", newVal }); }
        else { if (newVal && newVal !== oldVal) changes.push({ field: field.key, label: field.label, oldVal: oldVal || "—", newVal }); }
      });
      if (changes.length > 0) diffs.push({ employeeId: existing.id, name: `${existing.first_name} ${existing.last_name}`, changes, selected: true });
    }
    setUpdateDiffs(diffs);
    setUpdateStep("preview");
  }, [employees, updateMode]);

  const toggleDiffSelected = (idx: number) => {
    setUpdateDiffs(prev => prev.map((d, i) => i === idx ? { ...d, selected: !d.selected } : d));
  };

  const executeUpdateDiffs = async () => {
    setUpdating(true);
    const selected = updateDiffs.filter(d => d.selected);
    let updated = 0, created = 0, blockedByIdentity = 0;
    for (const diff of selected) {
      const updateData: Record<string, any> = {};
      diff.changes.forEach(c => { updateData[c.field] = NAME_FIELDS.includes(c.field) ? toTitleCase(c.newVal) : (c.newVal || null); });
      if (diff.employeeId.startsWith("__new__")) {
        updateData.first_name = updateData.first_name || "";
        updateData.last_name = updateData.last_name || "";
        const identity = await resolveExistingEmployeeIdentity(selectedCompanyId!, {
          firstName: updateData.first_name,
          lastName: updateData.last_name,
          phone: updateData.phone_number,
          email: updateData.email,
          employerIdentification: updateData.employer_identification,
          externalId: updateData.connecteam_employee_id,
        });
        if (identity.outcome !== "NOT_FOUND") { blockedByIdentity++; continue; }
        const { error } = await supabase.from("employees").insert({
          ...updateData,
          ...buildEmployeeCreationTrace({ source: "csv", actorId: user?.id, actorLabel: user?.email }),
          company_id: selectedCompanyId,
        } as any);
        if (!error) created++;
      } else {
        const { error } = await supabase.from("employees").update(updateData as any).eq("id", diff.employeeId);
        if (!error) updated++;
      }
    }
    if (blockedByIdentity > 0) {
      notifyWarning({
        key: "csv-update-identity-guard",
        title: "Altas retenidas por posible duplicado",
        fact: `${blockedByIdentity} personas nuevas ya existen o requieren revisión de identidad.`,
        consequence: "No se crearon esos registros. Resuélvelos en Calidad de identidad.",
      });
    }
    setUpdateResult({ updated, skipped: updateDiffs.length - selected.length + blockedByIdentity, created });
    setUpdateStep("done");
    setUpdating(false);
    fetchEmployees();
  };

  const resetUpdate = () => { setUpdateStep("upload"); setUpdateDiffs([]); setUpdateResult(null); };

  const handleExport = async () => {
    const exportFields = CONNECTEAM_FIELDS;
    const rows = filtered.map(emp => {
      const row: Record<string, string> = {};
      exportFields.forEach(f => { row[f.label] = emp[f.key] ?? ""; });
      row["Status"] = emp.is_active ? "Active" : "Inactive";
      return row;
    });
    await writeExcelFile(rows, "Employees", `employees_${new Date().toISOString().slice(0, 10)}.xlsx`);
    notifySuccess({
      key: "employees-export",
      title: "Exportación lista",
      fact: `${rows.length} workers exportados a Excel.`,
      consequence: "El archivo se descargó en tu dispositivo.",
    });
  };

  const uniqueRoles = [...new Set(employees.map(e => e.employee_role).filter(Boolean))];
  const uniqueGroups = [...new Set(employees.map(e => e.groups).filter(Boolean))];

  // Helpers for the expanded operational tabs.
  const isMissingDocs = (e: EmployeeRecord) =>
    e.is_active !== false && e.onboarding_status && e.onboarding_status !== "complete";
  const isDriver = (e: EmployeeRecord) => {
    // Honor driver-detection rule: legacy `has_car` text wins over `can_drive` boolean.
    const hc = (e.has_car ?? "").toString().toLowerCase().trim();
    if (hc === "yes" || hc === "sí" || hc === "si" || hc === "true") return true;
    if (hc === "no" || hc === "false") return false;
    return !!e.can_drive;
  };
  const lastActivityDate = (e: EmployeeRecord): Date | null => {
    const raw = e.last_login || e.updated_at;
    if (!raw) return null;
    const d = parseISO(raw);
    return isValid(d) ? d : null;
  };
  const isNoActivity = (e: EmployeeRecord) => {
    if (e.is_active === false) return false;
    const d = lastActivityDate(e);
    if (!d) return true;
    return differenceInDays(new Date(), d) > 30;
  };
  const isNew = (e: EmployeeRecord) => {
    const raw = e.created_at;
    if (!raw) return false;
    const d = parseISO(raw);
    if (!isValid(d)) return false;
    return differenceInDays(new Date(), d) <= 14;
  };

  // Helper: invitation in a failure state (failed / bounced / dlq).
  // Delegates to the central `isWorkerInviteFailed` helper so the rule lives
  // in a single place (`src/lib/worker-actions.ts`) and matches the bulk-action
  // and per-row enforcement used elsewhere.
  const isInviteFailed = (e: EmployeeRecord) => isWorkerInviteFailed(e, invitations[e.id]);

  // Photo readiness signal — Photo Review Status v2.
  // Now backed by the real DB review fields. Inactive workers stay silent.
  const isMissingPhoto = (e: EmployeeRecord) =>
    e.is_active !== false && !(e.avatar_url && String(e.avatar_url).trim().length > 0);

  /**
   * Photo Quality Gate — Spanish-first status resolver (Photo Review Status v2).
   *   - inactive                                           → null (silent)
   *   - active + no avatar                                 → "required"
   *   - active + avatar + photo_review_status='approved'   → "approved"
   *   - active + avatar + photo_review_status='rejected'   → "invalid"
   *   - active + avatar + (null or 'pending')              → "pending"
   */
  const photoStatusFor = (
    e: EmployeeRecord,
  ): "required" | "pending" | "approved" | "invalid" | null => {
    if (e.is_active === false) return null;
    const has = e.avatar_url && String(e.avatar_url).trim().length > 0;
    if (!has) return "required";
    if (e.photo_review_status === "approved") return "approved";
    if (e.photo_review_status === "rejected") return "invalid";
    return "pending";
  };

  const statusCounts = {
    active: employees.filter(e => e.is_active !== false && !!e.user_id).length,
    invited: employees.filter(e => e.is_active !== false && !e.user_id && !!invitations[e.id]).length,
    failed: employees.filter(e => e.is_active !== false && !e.user_id && isInviteFailed(e)).length,
    pending: employees.filter(e => e.is_active !== false && !e.user_id && !invitations[e.id]).length,
    inactive: employees.filter(e => e.is_active === false).length,
    "missing-docs": employees.filter(isMissingDocs).length,
    "no-photo": employees.filter(isMissingPhoto).length,
    drivers: employees.filter(isDriver).length,
    "no-activity": employees.filter(isNoActivity).length,
    new: employees.filter(isNew).length,
    all: employees.length,
  };

  const matchesStatusTab = (e: EmployeeRecord, tab: StatusTab) => {
    switch (tab) {
      case "all": return true;
      case "active": return e.is_active !== false && !!e.user_id;
      case "invited": return e.is_active !== false && !e.user_id && !!invitations[e.id];
      case "failed": return e.is_active !== false && !e.user_id && isInviteFailed(e);
      case "pending": return e.is_active !== false && !e.user_id && !invitations[e.id];
      case "inactive": return e.is_active === false;
      case "missing-docs": return isMissingDocs(e);
      case "no-photo": {
        // Photo Review Queue v2 — filter pills:
        //   "all"        → missing + pending + rejected (needs admin attention)
        //   "missing"    → no avatar at all
        //   "unreviewed" → avatar uploaded, not yet approved/rejected (pending)
        //   "rejected"   → admin marked photo as not valid
        //   "approved"   → admin-approved photos (browse only)
        const s = photoStatusFor(e);
        if (s === null) return false; // inactive
        if (photoFilter === "missing")    return s === "required";
        if (photoFilter === "unreviewed") return s === "pending";
        if (photoFilter === "rejected")   return s === "invalid";
        if (photoFilter === "approved")   return s === "approved";
        // "all" = anything that still needs attention (excludes approved noise)
        return s === "required" || s === "pending" || s === "invalid";
      }
      case "drivers": return isDriver(e);
      case "no-activity": return isNoActivity(e);
      case "new": return isNew(e);
      default: return true;
    }
  };

  // Document signals (read-only) — feeds doc-compliance risks into the same engine.
  const { signals: documentSignals } = useCompanyDocuments({
    companyId: selectedCompanyId ?? null,
    employees,
  });

  // Risk analysis (read-only). Recomputes when document signals change.
  const riskAnalysis = useMemo(
    () => analyzeEmployeeRisks(employees, documentSignals),
    [employees, documentSignals],
  );

  const baseFiltered = employees.filter((e) => {
    const haystack = `${e.first_name ?? ""} ${e.last_name ?? ""} ${e.email ?? ""} ${e.phone_number ?? ""} ${e.employer_identification ?? ""}`.toLowerCase();
    const matchesSearch = haystack.includes(search.toLowerCase());
    const matchesRole = filterRole === "all" || e.employee_role === filterRole;
    const matchesGroup = filterGroup === "all" || e.groups === filterGroup;
    const matchesRisk = riskFilter === "all" || (riskAnalysis.byId.get(e.id)?.includes(riskFilter) ?? false);
    return matchesSearch && matchesStatusTab(e, statusTab) && matchesRole && matchesGroup && matchesRisk;
  });

  // Persisted sort applied to the filtered list.
  const filtered = [...baseFiltered].sort((a, b) => {
    const dir = sort.direction === "asc" ? 1 : -1;
    if (sort.key === "name") {
      const an = `${a.first_name ?? ""} ${a.last_name ?? ""}`.trim().toLowerCase();
      const bn = `${b.first_name ?? ""} ${b.last_name ?? ""}`.trim().toLowerCase();
      return an.localeCompare(bn) * dir;
    }
    if (sort.key === "code") {
      return String(a.employer_identification ?? "").localeCompare(String(b.employer_identification ?? ""), undefined, { numeric: true }) * dir;
    }
    if (sort.key === "role") {
      return String(a.employee_role ?? "").localeCompare(String(b.employee_role ?? "")) * dir;
    }
    if (sort.key === "last_activity") {
      const ad = lastActivityDate(a)?.getTime() ?? 0;
      const bd = lastActivityDate(b)?.getTime() ?? 0;
      return (ad - bd) * dir;
    }
    if (sort.key === "photo") {
      // Order: required (0) → invalid (1) → pending (2) → approved/null (3).
      const rank = (e: EmployeeRecord) => {
        const s = photoStatusFor(e);
        if (s === "required") return 0;
        if (s === "invalid") return 1;
        if (s === "pending") return 2;
        return 3;
      };
      return (rank(a) - rank(b)) * dir;
    }
    return 0;
  });

  const activeFilterCount = [filterRole !== "all", filterGroup !== "all", riskFilter !== "all"].filter(Boolean).length;
  const clearFilters = () => { setFilterRole("all"); setFilterGroup("all"); setRiskFilter("all"); };

  // When the user searches and gets 0 results in the current tab, but there ARE
  // matches in other tabs, surface that so they don't think the employee is missing.
  const hiddenBySearch = search && statusTab !== "all"
    ? employees.filter(e => {
        const hay = `${e.first_name ?? ""} ${e.last_name ?? ""} ${e.email ?? ""} ${e.phone_number ?? ""} ${e.employer_identification ?? ""}`.toLowerCase();
        return hay.includes(search.toLowerCase());
      }).length
    : 0;

  const openDetailSheet = (emp: EmployeeRecord) => {
    setViewEmployee(emp);
    setIsEditing(false);
    const f: Record<string, string> = {};
    CONNECTEAM_FIELDS.forEach(field => { f[field.key] = emp[field.key] ?? ""; });
    setForm(f);
    if (isPrivileged && emp.id) {
      const sensitiveFields = ['access_pin', 'driver_licence'].filter(k => emp[k]);
      if (sensitiveFields.length > 0) {
        supabase.rpc('log_sensitive_access', { _table_name: 'employees', _record_id: emp.id, _fields: sensitiveFields }).then();
      }
    }
  };

  const handleSaveFromSheet = async () => {
    if (!viewEmployee) return;
    setLoading(true);
    const { error } = await supabase.from("employees").update(buildInsertData(form) as any).eq("id", viewEmployee.id);
    if (error) {
      notifyError({
        key: "employee-update",
        title: "No pudimos guardar los cambios",
        fact: getUserFriendlyError(error),
        consequence: "El perfil quedó como estaba.",
        cause: error,
      });
    } else {
      notifySuccess({
        key: "employee-update",
        title: "Worker actualizado",
        fact: "Los cambios quedaron guardados.",
        consequence: "Se reflejan en los turnos futuros.",
      });
      setIsEditing(false);
      fetchEmployees();
      setViewEmployee(prev => prev ? { ...prev, ...buildInsertData(form) } : prev);
    }
    setLoading(false);
  };

  // KPI strip for the premium header.
  // NOTE (Fase 1, 2026-07-06): labels aclarados sin cambiar fórmulas.
  //  · "Activos con portal" = is_active !== false && !!user_id (misma lógica de antes).
  //  · "Workers con docs pendientes" = cuenta de workers, no cantidad total de requisitos.
  const kpis: PremiumPageHeaderKpi[] = [
    { label: "Total", value: statusCounts.all, onClick: () => setStatusTab("all"), active: statusTab === "all" },
    { label: "Activos con portal", value: statusCounts.active, hint: "Workers activos con cuenta de portal vinculada.", accent: "success", onClick: () => setStatusTab("active"), active: statusTab === "active" },
    { label: "Pendientes de activar app", value: statusCounts.pending, hint: "Invitación enviada, portal aún sin acceder.", accent: statusCounts.pending > 0 ? "warning" : "default", onClick: () => setStatusTab("pending"), active: statusTab === "pending" },
    { label: "Workers con docs pendientes", value: statusCounts["missing-docs"], hint: "Cuenta workers con onboarding/documentos pendientes, no requisitos totales.", accent: statusCounts["missing-docs"] > 0 ? "destructive" : "default", onClick: () => setStatusTab("missing-docs"), active: statusTab === "missing-docs" },
    { label: "Conductores", value: statusCounts.drivers, accent: "primary", onClick: () => setStatusTab("drivers"), active: statusTab === "drivers" },
  ];

  // ── Strong duplicate signal count (lightweight, mirrors WorkerDuplicates filters) ──
  const strongDuplicateCount = useMemo(() => {
    if (!isPrivileged || employees.length === 0) return 0;
    const SHARED_EXACT = new Set(["qualitystaff@gmail.com", "noemail", "noemail@noemail.com", "test@test.com"]);
    const SHARED_RE = /^(test|example|admin@|info@|staffing@|office@|support@|noemail)|@example\./i;
    const emailUsage = new Map<string, number>();
    for (const e of employees) {
      const em = (e.email ?? "").trim().toLowerCase();
      if (em) emailUsage.set(em, (emailUsage.get(em) ?? 0) + 1);
    }
    const isShared = (em: string) =>
      !em || SHARED_EXACT.has(em) || SHARED_RE.test(em) || (emailUsage.get(em) ?? 0) >= 5;

    const dupMembers = new Set<string>();
    const phoneMap = new Map<string, string[]>();
    const emailMap = new Map<string, string[]>();
    const eidMap = new Map<string, string[]>();
    for (const e of employees) {
      const phone = normalizePhone((e as any).phone_number);
      if (phone) {
        const arr = phoneMap.get(phone) ?? [];
        arr.push(e.id);
        phoneMap.set(phone, arr);
      }
      const em = (e.email ?? "").trim().toLowerCase();
      if (em && !isShared(em)) {
        const arr = emailMap.get(em) ?? [];
        arr.push(e.id);
        emailMap.set(em, arr);
      }
      const eid = ((e as any).employer_identification ?? "").trim().toLowerCase();
      if (eid) {
        const arr = eidMap.get(eid) ?? [];
        arr.push(e.id);
        eidMap.set(eid, arr);
      }
    }
    let groups = 0;
    for (const m of [phoneMap, emailMap, eidMap]) {
      for (const ids of m.values()) {
        if (ids.length > 1) {
          groups += 1;
          ids.forEach((id) => dupMembers.add(id));
        }
      }
    }
    // Approximation: number of strong buckets (some may coalesce into the same logical group;
    // the dashboard shows the exact transitive count).
    return groups;
  }, [employees, isPrivileged]);

  // Active filter chips (chips show as removable pills under the search bar).
  const activeChips: ActiveFilterChip[] = [
    ...(filterRole !== "all" ? [{ key: "role", label: <>Role: <strong className="ml-0.5">{formatDisplayText(filterRole, "label")}</strong></>, onRemove: () => setFilterRole("all") }] : []),
    ...(filterGroup !== "all" ? [{ key: "group", label: <>Group: <strong className="ml-0.5">{filterGroup}</strong></>, onRemove: () => setFilterGroup("all") }] : []),
    ...(riskFilter !== "all" ? [{ key: "risk", label: <>Risk: <strong className="ml-0.5">{riskFilter.replace(/_/g, " ")}</strong></>, onRemove: () => setRiskFilter("all") }] : []),
  ];

  /* ────────────────────────────────────────────────────────────────────
   * P0 — Operational First Layout.
   * Los KPIs dejan de ser cards grandes: pasan a chips compactos con la
   * MISMA acción (cambiar de pestaña). La calidad de datos baja al panel
   * administrativo colapsable. Nada de lógica cambia aquí.
   * ──────────────────────────────────────────────────────────────────*/
  const workspaceMetrics: WorkspaceMetric[] = kpis.map((k) => ({
    label: k.label,
    value: k.value,
    hint: typeof k.hint === "string" ? k.hint : undefined,
    onClick: k.onClick,
    active: k.active,
    tone:
      k.accent === "success"
        ? "success"
        : k.accent === "warning"
          ? "warning"
          : k.accent === "destructive"
            ? "critical"
            : k.accent === "primary"
              ? "primary"
              : "neutral",
  }));

  const statusTabsNode = (
    <div className="flex items-center gap-0.5 overflow-x-auto">
      {([
        { key: "active" as const, label: "Activos", count: statusCounts.active },
        { key: "pending" as const, label: "Pendientes", count: statusCounts.pending },
        { key: "invited" as const, label: "Invitados", count: statusCounts.invited },
        ...(statusCounts.failed > 0
          ? [{ key: "failed" as const, label: "Invitación fallida", count: statusCounts.failed, tone: "destructive" as const }]
          : []),
        {
          key: "missing-docs" as const,
          label: "Documentos",
          count: statusCounts["missing-docs"],
          tone: statusCounts["missing-docs"] > 0 ? ("warning" as const) : undefined,
        },
        {
          key: "no-photo" as const,
          label: "Foto requerida",
          count: statusCounts["no-photo"],
          tone: statusCounts["no-photo"] > 0 ? ("warning" as const) : undefined,
        },
        { key: "new" as const, label: "Nuevos", count: statusCounts.new },
        { key: "drivers" as const, label: "Conductores", count: statusCounts.drivers },
        { key: "no-activity" as const, label: "Sin actividad", count: statusCounts["no-activity"] },
        { key: "inactive" as const, label: "Históricos", count: statusCounts.inactive },
        { key: "all" as const, label: "Todos", count: statusCounts.all },
      ]).map(tab => {
        const isActive = statusTab === tab.key;
        const tone = (tab as any).tone as "destructive" | "warning" | undefined;
        const isDestructive = tone === "destructive";
        const isWarning = tone === "warning";
        return (
          <button
            key={tab.key}
            onClick={() => setStatusTab(tab.key)}
            className={cn(
              "px-3 py-2 text-xs font-medium border-b-2 transition-colors -mb-px whitespace-nowrap",
              isActive
                ? isDestructive
                  ? "border-destructive text-destructive"
                  : isWarning
                    ? "border-warning text-warning"
                    : "border-primary text-primary"
                : isDestructive
                  ? "border-transparent text-destructive/80 hover:text-destructive hover:border-destructive/40"
                  : isWarning
                    ? "border-transparent text-warning/80 hover:text-warning hover:border-warning/40"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
            )}
          >
            {tab.label}
            <span className={cn(
              "ml-1.5 text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded-md",
              isActive
                ? isDestructive
                  ? "bg-destructive/10 text-destructive"
                  : isWarning
                    ? "bg-warning/15 text-warning"
                    : "bg-primary/10 text-primary"
                : isDestructive
                  ? "bg-destructive/10 text-destructive"
                  : isWarning
                    ? "bg-warning/15 text-warning"
                    : "bg-muted text-muted-foreground",
            )}>{tab.count}</span>
          </button>
        );
      })}
    </div>
  );

  const filtersNode = (
    <PremiumFilterBar
      search={search}
      onSearchChange={setSearch}
      searchPlaceholder="Search by name, phone, email, or Stafly ID…"
      quickFilters={
        <>
          {uniqueRoles.length > 0 && (
            <Select value={filterRole} onValueChange={setFilterRole}>
              <SelectTrigger className="w-[130px] h-8 text-xs"><SelectValue placeholder="Role" /></SelectTrigger>
              <SelectContent><SelectItem value="all">All roles</SelectItem>{uniqueRoles.map(r => (<SelectItem key={r} value={r}>{formatDisplayText(r, "label")}</SelectItem>))}</SelectContent>
            </Select>
          )}
          {uniqueGroups.length > 0 && (
            <Select value={filterGroup} onValueChange={setFilterGroup}>
              <SelectTrigger className="w-[130px] h-8 text-xs"><SelectValue placeholder="Group" /></SelectTrigger>
              <SelectContent><SelectItem value="all">All groups</SelectItem>{uniqueGroups.map(g => (<SelectItem key={g} value={g}>{g}</SelectItem>))}</SelectContent>
            </Select>
          )}
          <Select
            value={sort.key}
            onValueChange={(v) => setSort({ key: v as SortKey, direction: sort.direction })}
          >
            <SelectTrigger className="w-[170px] h-8 text-xs" aria-label="Ordenar por">
              <ArrowUpDown className="h-3 w-3 mr-1 text-muted-foreground" />
              <SelectValue placeholder="Ordenar por" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name">Ordenar: Nombre</SelectItem>
              <SelectItem value="code">Ordenar: ID Stafly</SelectItem>
              <SelectItem value="last_activity">Ordenar: Última actividad</SelectItem>
              <SelectItem value="photo">Ordenar: Foto</SelectItem>
              <SelectItem value="role">Ordenar: Rol</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-2 text-[11px]"
            onClick={() => setSort({ key: sort.key, direction: sort.direction === "asc" ? "desc" : "asc" })}
            title={sort.direction === "asc" ? "Ascendente" : "Descendente"}
          >
            {sort.direction === "asc" ? "Asc ↑" : "Desc ↓"}
          </Button>
        </>
      }
      activeChips={activeChips}
      resultCount={filtered.length}
      onReset={clearFilters}
      rightSlot={
        <>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setColPrefsOpen(true)} title="Column preferences">
            <Settings2 className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
          <ViewSwitcher value={viewMode} onChange={setViewMode} modes={["roster", "table", "compact"]} />
        </>
      }
    />
  );

  const adminPanelNode = isPrivileged ? (
    <div className="space-y-3">
      <Card
        className="border-warning/20 bg-gradient-to-r from-warning/5 via-card to-card hover:border-warning/40 transition-colors cursor-pointer group"
        onClick={() => navigate("/app/workers/duplicates")}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            navigate("/app/workers/duplicates");
          }
        }}
      >
        <CardContent className="p-3 flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-warning/10 text-warning flex items-center justify-center shrink-0">
            <UserSearch className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-foreground">Data Quality</span>
              {strongDuplicateCount > 0 ? (
                <Badge
                  variant="outline"
                  className="h-5 px-1.5 bg-warning/10 text-warning border-warning/30 text-[10px] font-semibold"
                  title="Cuenta grupos detectados, no personas únicas."
                >
                  {strongDuplicateCount} {strongDuplicateCount === 1 ? "grupo con posible duplicado" : "grupos con posible duplicado"}
                </Badge>
              ) : (
                <Badge variant="outline" className="h-5 px-1.5 text-[10px] text-muted-foreground border-border">
                  Sin duplicados detectados
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {strongDuplicateCount > 0
                ? "Grupos con posibles duplicados. Revisa antes de que impacten shifts o payroll."
                : "Sin señales fuertes de duplicados en la vista actual. Puedes correr un escaneo profundo cuando quieras."}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs shrink-0 group-hover:border-warning/40 group-hover:text-warning"
            onClick={(e) => {
              e.stopPropagation();
              navigate("/app/workers/duplicates");
            }}
          >
            <UserSearch className="h-3.5 w-3.5 mr-1.5" />
            Revisar duplicados
          </Button>
        </CardContent>
      </Card>

      {employees.length > 0 && (
        <DataQualityRiskPanel
          employees={employees}
          documentSignals={documentSignals}
          riskFilter={riskFilter}
          onRiskFilterChange={setRiskFilter}
          compact
          companyName={selectedCompany?.name ?? null}
        />
      )}
    </div>
  ) : undefined;


  return (
    <div className="space-y-3 overflow-x-clip max-w-full">
      {/* ─── P1 Stafly Responsive Design System — un solo árbol para desktop y móvil ─── */}
      <OperationalWorkspace
        title="Equipo"
        metrics={workspaceMetrics}
        tabs={statusTabsNode}
        filters={filtersNode}
        admin={adminPanelNode}
        adminHint="Calidad de datos, duplicados y riesgos"
        action={

          <>
            {/* Mobile keeps only Quick add to avoid header overflow */}
            <div className="hidden md:contents">
            {isPrivileged && (
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setCampaignOpen(true)}>
                <Rocket className="h-3.5 w-3.5 mr-1.5" />
                Campaña de activación
              </Button>
            )}
            {isPrivileged && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs relative"
                onClick={() => navigate("/app/workers/duplicates")}
                title="Detectar personas duplicadas"
              >
                <UserSearch className="h-3.5 w-3.5 mr-1.5" />
                Ver duplicados
                {strongDuplicateCount > 0 && (
                  <Badge
                    variant="outline"
                    className="ml-1.5 h-5 px-1.5 bg-warning/10 text-warning border-warning/30 text-[10px] font-semibold"
                  >
                    {strongDuplicateCount}
                  </Badge>
                )}
              </Button>
            )}
            <BulkRateAssignment />
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={handleExport} disabled={filtered.length === 0}>
              <Download className="h-3.5 w-3.5 mr-1.5" />Exportar
            </Button>
            {/* Update Dialog */}
            <Dialog open={updateOpen} onOpenChange={(v) => { setUpdateOpen(v); if (!v) resetUpdate(); }}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 text-xs"><ArrowUpDown className="h-3.5 w-3.5 mr-1.5" />Actualizar datos</Button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Update worker data</DialogTitle>
                  <DialogDescription>Upload an Excel or CSV file to update information</DialogDescription>
                </DialogHeader>
                {updateStep === "upload" && (
                  <div className="space-y-4">
                    <Tabs defaultValue="full" onValueChange={(v) => setUpdateMode(v as "diff" | "full")}>
                      <TabsList className="grid w-full grid-cols-2"><TabsTrigger value="full">Full replace</TabsTrigger><TabsTrigger value="diff">Changes only</TabsTrigger></TabsList>
                      <TabsContent value="full"><p className="text-sm text-muted-foreground mb-3">Replaces <strong>all fields</strong> of the employee with the file data.</p></TabsContent>
                      <TabsContent value="diff"><p className="text-sm text-muted-foreground mb-3">Only updates fields that are <strong>different</strong>.</p></TabsContent>
                    </Tabs>
                    <div className="border-2 border-dashed border-border rounded-xl p-8 text-center hover:border-primary/50 transition-colors">
                      <RefreshCw className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                      <p className="text-sm text-muted-foreground mb-3">Upload the file with updated data</p>
                      <input type="file" accept=".xls,.xlsx,.csv,.txt" onChange={handleUpdateFile} className="block w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-primary file:text-primary-foreground file:font-medium hover:file:bg-primary/90 cursor-pointer" />
                    </div>
                  </div>
                )}
                {updateStep === "preview" && (
                  <div className="space-y-4">
                    {updateDiffs.length === 0 ? (
                      <div className="text-center py-8"><CheckCircle2 className="h-12 w-12 text-primary mx-auto mb-4" /><p className="text-lg font-medium">No changes found</p><Button className="mt-4" onClick={() => { setUpdateOpen(false); resetUpdate(); }}>Close</Button></div>
                    ) : (
                      <>
                        <div className="flex gap-2 text-sm items-center flex-wrap">
                          <Badge variant="outline" className="bg-chart-4/10 text-chart-4 border-chart-4/20">{updateDiffs.filter(d => !d.employeeId.startsWith("__new__")).length} to update</Badge>
                          {updateDiffs.some(d => d.employeeId.startsWith("__new__")) && <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">{updateDiffs.filter(d => d.employeeId.startsWith("__new__")).length} new</Badge>}
                        </div>
                        <div className="max-h-[50vh] overflow-y-auto space-y-3">
                          {updateDiffs.map((diff, idx) => (
                            <div key={diff.employeeId} className={`border rounded-lg p-3 transition-opacity ${!diff.selected ? 'opacity-40' : ''}`}>
                              <div className="flex items-center gap-3 mb-2">
                                <Checkbox checked={diff.selected} onCheckedChange={() => toggleDiffSelected(idx)} />
                                <span className="font-medium text-sm">{diff.name}</span>
                                <Badge variant="secondary" className="text-xs">{diff.changes.length} fields</Badge>
                              </div>
                              <div className="ml-7 space-y-1 max-h-32 overflow-y-auto">
                                {diff.changes.map(c => (
                                  <div key={c.field} className="flex items-center gap-2 text-xs">
                                    <span className="text-muted-foreground w-28 shrink-0">{c.label}:</span>
                                    {c.oldVal !== "—" && <><span className="text-destructive/70 line-through max-w-[30%] truncate">{c.oldVal}</span><span>→</span></>}
                                    <span className="text-primary font-medium max-w-[40%] truncate">{c.newVal}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="flex gap-2"><Button variant="outline" onClick={resetUpdate}>Cancel</Button><Button onClick={executeUpdateDiffs} disabled={updating || updateDiffs.every(d => !d.selected)}>{updating ? "Processing..." : `Apply to ${updateDiffs.filter(d => d.selected).length}`}</Button></div>
                      </>
                    )}
                  </div>
                )}
                {updateStep === "done" && updateResult && (
                  <div className="text-center py-6"><CheckCircle2 className="h-12 w-12 text-primary mx-auto mb-4" /><p className="text-lg font-medium">{updateResult.updated > 0 && `${updateResult.updated} updated`}{updateResult.created && updateResult.created > 0 && ` · ${updateResult.created} created`}</p><Button className="mt-4" onClick={() => { setUpdateOpen(false); resetUpdate(); }}>Close</Button></div>
                )}
              </DialogContent>
            </Dialog>
            {/* Import Dialog */}
            <Dialog open={importOpen} onOpenChange={(v) => { setImportOpen(v); if (!v) resetImport(); }}>
              <DialogTrigger asChild><Button variant="outline" size="sm" className="h-8 text-xs"><Upload className="h-3.5 w-3.5 mr-1.5" />Import</Button></DialogTrigger>
              <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
                <DialogHeader><DialogTitle>Import Workers</DialogTitle><DialogDescription>Only creates new records, does not update existing ones</DialogDescription></DialogHeader>
                {importStep === "upload" && (
                  <div className="border-2 border-dashed border-border rounded-xl p-8 text-center hover:border-primary/50 transition-colors">
                    <FileSpreadsheet className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                    <p className="text-sm text-muted-foreground mb-3">Upload the exported file (Excel or CSV)</p>
                    <input type="file" accept=".xls,.xlsx,.csv,.txt" onChange={handleImportFile} className="block w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-primary file:text-primary-foreground file:font-medium hover:file:bg-primary/90 cursor-pointer" />
                  </div>
                )}
                {importStep === "preview" && (
                  <div className="space-y-4">
                    <div className="flex gap-3 text-sm"><span className="bg-primary/10 text-primary px-3 py-1 rounded-full font-medium">{importPreview.filter(r => !r.exists).length} new</span><span className="bg-muted text-muted-foreground px-3 py-1 rounded-full font-medium">{importPreview.filter(r => r.exists).length} already exist</span></div>
                    <div className="max-h-60 overflow-y-auto border rounded-lg"><Table><TableHeader><TableRow><TableHead className="text-xs">Name</TableHead><TableHead className="text-xs">Phone</TableHead><TableHead className="text-xs">Status</TableHead></TableRow></TableHeader><TableBody>{importPreview.map((r, i) => (<TableRow key={i} className={r.exists ? "opacity-50" : ""}><TableCell className="text-xs font-medium">{r.first_name} {r.last_name}</TableCell><TableCell className="text-xs">{r.phone_number || "—"}</TableCell><TableCell><span className={`text-xs px-2 py-0.5 rounded-full ${r.exists ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary"}`}>{r.exists ? "Exists" : "New"}</span></TableCell></TableRow>))}</TableBody></Table></div>
                    <div className="flex gap-2"><Button variant="outline" onClick={resetImport}>Cancel</Button><Button onClick={executeImport} disabled={importing || importPreview.every(r => r.exists)}>{importing ? "Importing..." : `Import ${importPreview.filter(r => !r.exists).length}`}</Button></div>
                  </div>
                )}
                {importStep === "done" && importResult && (<div className="text-center py-6"><CheckCircle2 className="h-12 w-12 text-primary mx-auto mb-4" /><p className="text-lg font-medium">{importResult.created} workers created</p><Button className="mt-4" onClick={() => { setImportOpen(false); resetImport(); }}>Close</Button></div>)}
              </DialogContent>
            </Dialog>
            <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (v) setForm(emptyForm()); }}>
              <DialogTrigger asChild><Button disabled={atEmployeeLimit} size="sm" className="h-8 text-xs"><Plus className="h-3.5 w-3.5 mr-1.5" />New (full form)</Button></DialogTrigger>
              <DialogContent className="max-w-md"><DialogHeader><DialogTitle>New Worker</DialogTitle><DialogDescription>Enter the new worker's information</DialogDescription></DialogHeader>{atEmployeeLimit ? <UpgradeBanner feature={`Limit of ${limits.maxEmployees} active workers`} /> : <EmployeeForm fields={CONNECTEAM_FIELDS} form={form} setForm={setForm} loading={loading} onSubmit={handleCreate} submitLabel="Create" />}</DialogContent>
            </Dialog>
            </div>
            <Button size="sm" variant="default" className="h-8 text-xs" disabled={atEmployeeLimit} onClick={() => setQuickAddOpen(true)}>
              <UserPlus className="h-3.5 w-3.5 mr-1.5" />Quick add
            </Button>
            <QuickAddInviteWizard open={quickAddOpen} onOpenChange={setQuickAddOpen} onEmployeeCreated={() => fetchEmployees()} />
            {/* Mobile-only: collapsed actions menu so users can still reach key actions */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="h-8 w-8 md:hidden" aria-label="More actions">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                {isPrivileged && (
                  <DropdownMenuItem onClick={() => setCampaignOpen(true)} className="gap-2 text-sm">
                    <Rocket className="h-4 w-4" /> Campaña de activación
                  </DropdownMenuItem>
                )}
                {isPrivileged && (
                  <DropdownMenuItem onClick={() => navigate("/app/workers/duplicates")} className="gap-2 text-sm">
                    <UserSearch className="h-4 w-4" /> Detect duplicates
                    {strongDuplicateCount > 0 && (
                      <Badge variant="outline" className="ml-auto h-5 px-1.5 bg-warning/10 text-warning border-warning/30 text-[10px]">
                        {strongDuplicateCount}
                      </Badge>
                    )}
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={handleExport} disabled={filtered.length === 0} className="gap-2 text-sm">
                  <Download className="h-4 w-4" /> Export
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setOnboardingSettingsOpen(true)} className="gap-2 text-sm">
                  <Settings2 className="h-4 w-4" /> Onboarding settings
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground font-normal">
                  Desktop recommended
                </DropdownMenuLabel>
                <DropdownMenuItem
                  disabled
                  className="gap-2 text-sm opacity-70"
                >
                  <ArrowUpDown className="h-4 w-4" /> Update via file
                  <Badge variant="outline" className="ml-auto h-4 px-1 text-[9px]">Desktop</Badge>
                </DropdownMenuItem>
                <DropdownMenuItem disabled className="gap-2 text-sm opacity-70">
                  <Upload className="h-4 w-4" /> Import workers
                  <Badge variant="outline" className="ml-auto h-4 px-1 text-[9px]">Desktop</Badge>
                </DropdownMenuItem>
                <DropdownMenuItem disabled className="gap-2 text-sm opacity-70">
                  <Hash className="h-4 w-4" /> Bulk rates
                  <Badge variant="outline" className="ml-auto h-4 px-1 text-[9px]">Desktop</Badge>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="ghost" size="icon" className="hidden md:inline-flex h-8 w-8" onClick={() => setOnboardingSettingsOpen(true)} title="Onboarding settings">
              <Settings2 className="h-4 w-4" />
            </Button>
          </>
        }
      >








      {/* ─── Photo Review Queue v1 — Foto requerida tab header ─── */}
      {statusTab === "no-photo" && (
        <PhotoReviewCriteriaCard
          photoFilter={photoFilter}
          onPhotoFilterChange={setPhotoFilter}
          counts={{
            all: employees.filter((e) => {
              const s = photoStatusFor(e);
              return s === "required" || s === "pending" || s === "invalid";
            }).length,
            missing: employees.filter((e) => photoStatusFor(e) === "required").length,
            unreviewed: employees.filter((e) => photoStatusFor(e) === "pending").length,
            rejected: employees.filter((e) => photoStatusFor(e) === "invalid").length,
            approved: employees.filter((e) => photoStatusFor(e) === "approved").length,
          }}
        />
      )}


      {/* ─── Bulk actions bar — appears when ≥1 row selected ─── */}
      {(() => {
        if (selectedIds.size === 0) return null;
        const selectedFailedCount = Array.from(selectedIds).reduce((acc, id) => {
          const emp = employees.find(e => e.id === id);
          return emp && isInviteFailed(emp) ? acc + 1 : acc;
        }, 0);
        const canReinvite = selectedFailedCount > 0 && !bulkReinviting;
        const reinviteLabel = bulkReinviting
          ? "Re-inviting…"
          : selectedFailedCount > 0
            ? `Re-invite ${selectedFailedCount} failed`
            : "Re-invite selected";

        // Selected workers with at least one Phase 2 actionable risk → eligible
        // for the WhatsApp / CSV bulk helpers. Computed inline so we never
        // mutate state from a render-only path.
        const selectedRows = Array.from(selectedIds)
          .map((id) => employees.find((e) => e.id === id))
          .filter(Boolean) as EmployeeRecord[];
        const selectedWithIssues = selectedRows.filter(
          (e) => (riskAnalysis.byId.get(e.id) ?? []).length > 0,
        );

        const handleCopyWhatsapp = async () => {
          const rows = selectedWithIssues.map((e) => ({
            employeeId: e.id,
            firstName: e.first_name,
            lastName: e.last_name,
            phone: e.phone_number,
            risks: riskAnalysis.byId.get(e.id) ?? [],
          }));
          const { text, included, skipped } = buildBulkRemindersText(rows, {
            companyName: selectedCompany?.name ?? null,
          });
          if (!text) {
            notifyWarning({
              key: "bulk-reminders",
              title: "No hay recordatorios que enviar",
              fact: "Ninguno de los workers seleccionados tiene datos pendientes.",
              consequence: "Selecciona workers con incidencias detectadas.",
            });
            return;
          }
          try {
            await navigator.clipboard.writeText(text);
            notifySuccess({
              key: "bulk-reminders",
              title: `${included} recordatorio${included === 1 ? "" : "s"} copiado${included === 1 ? "" : "s"}`,
              fact: skipped > 0
                ? `${skipped} worker${skipped === 1 ? "" : "s"} omitido${skipped === 1 ? "" : "s"} por no tener pendientes.`
                : "El texto incluye separadores por worker.",
              consequence: "Pégalo en WhatsApp Web para enviarlos.",
            });
          } catch (e) {
            notifyError({
              key: "bulk-reminders",
              title: "No pudimos copiar los recordatorios",
              fact: "Tu navegador bloqueó el acceso al portapapeles.",
              consequence: "No se envió nada. Intenta desde otro navegador.",
              cause: e,
            });
          }
        };

        const handleExportSelectedCsv = () => {
          if (selectedWithIssues.length === 0) {
            notifyWarning({
              key: "issues-export",
              title: "No hay nada para exportar",
              fact: "Ninguno de los workers seleccionados tiene incidencias.",
              consequence: "Selecciona workers con datos pendientes.",
            });
            return;
          }
          const header = ["worker_id", "first_name", "last_name", "email", "phone_number", "employer_identification", "is_active", "portal_active", "risk_tags"];
          const escape = (v: any) => {
            const s = v == null ? "" : String(v);
            return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
          };
          const lines = [header.join(",")];
          for (const e of selectedWithIssues) {
            const tags = riskAnalysis.byId.get(e.id) ?? [];
            lines.push([
              e.id, e.first_name ?? "", e.last_name ?? "", e.email ?? "",
              e.phone_number ?? "", e.employer_identification ?? "",
              e.is_active === false ? "false" : "true",
              e.user_id ? "true" : "false",
              tags.join("|"),
            ].map(escape).join(","));
          }
          const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `worker_issues_${new Date().toISOString().slice(0, 10)}.csv`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          notifySuccess({
            key: "issues-export",
            title: `${selectedWithIssues.length} workers exportados`,
            fact: "El CSV con las incidencias se descargó.",
            consequence: "Compártelo con quien deba corregir los datos.",
          });
        };

        return (
          <BulkActionsBar
            selectedCount={selectedIds.size}
            totalCount={filtered.length}
            noun="worker"
            onClear={clearSelection}
            actions={
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <Button
                        variant={canReinvite ? "destructive" : "outline"}
                        size="xs"
                        onClick={handleBulkReinviteSelected}
                        disabled={!canReinvite}
                      >
                        {bulkReinviting
                          ? <Loader2 className="h-3 w-3 animate-spin" />
                          : <RotateCw className="h-3 w-3" />}
                        {reinviteLabel}
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs max-w-[260px]">
                    {selectedFailedCount === 0
                      ? "Select workers whose invitation failed, bounced or hit DLQ to enable bulk re-invite."
                      : `Resends invitations for ${selectedFailedCount} selected worker${selectedFailedCount === 1 ? "" : "s"} with a failed delivery state. Other selected rows are skipped.`}
                  </TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <Button
                        variant="outline"
                        size="xs"
                        onClick={handleCopyWhatsapp}
                        disabled={selectedWithIssues.length === 0}
                      >
                        <MessageCircle className="h-3 w-3" />
                        Copy WhatsApp ({selectedWithIssues.length})
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs max-w-[260px]">
                    Builds one reminder per selected worker with detected issues and copies them to your clipboard. No messages are sent automatically.
                  </TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <Button
                        variant="outline"
                        size="xs"
                        onClick={handleExportSelectedCsv}
                        disabled={selectedWithIssues.length === 0}
                      >
                        <Download className="h-3 w-3" />
                        Export issues CSV
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs max-w-[260px]">
                    Downloads a CSV of the selected workers with detected risk tags for offline review.
                  </TooltipContent>
                </Tooltip>
              </>
            }
          />
        );
      })()}

      {/* ─── Content ─── */}
      {initialLoading ? (
        <PageSkeleton variant="table" />
      ) : fetchError ? (
        <ErrorBlock
          title="Couldn't load workers"
          message="We couldn't reach the workers list. Check your connection and try again."
          onRetry={fetchEmployees}
        />
      ) : filtered.length === 0 ? (
        statusTab === "failed" ? (
          <EmptyState
            icon={CheckCircle2}
            title="No failed invitations 🎉"
            description="The activation backlog is clean. New failures will appear here automatically when an invitation bounces or hits DLQ."
            actionLabel="View pending activation"
            onAction={() => setStatusTab("pending")}
          />
        ) : statusTab === "pending" && employees.length > 0 && !search ? (
          <EmptyState
            icon={CheckCircle2}
            title="Nothing pending"
            description="Every active worker has either accessed the portal or has an invitation in flight. Use 'Quick add' to onboard someone new."
            actionLabel="Quick add"
            onAction={() => setQuickAddOpen(true)}
          />
        ) : statusTab === "inactive" && employees.length > 0 && !search ? (
          <EmptyState
            icon={UserCheck}
            title="No archived workers"
            description="Workers you archive will appear here. Archived workers can be reactivated at any time."
          />
        ) : statusTab === "missing-docs" && employees.length > 0 && !search ? (
          <EmptyState
            icon={CheckCircle2}
            title="All workers have their documents 🎉"
            description="Onboarding requirements are complete across the active roster."
          />
        ) : (
          <EmptyState
            icon={Users}
            title={
              hiddenBySearch > 0
                ? `${hiddenBySearch} coincidencia${hiddenBySearch === 1 ? "" : "s"} en otra vista`
                : search
                  ? "No encontramos trabajadores en esta vista."
                  : "Aún no hay trabajadores"
            }
            description={
              hiddenBySearch > 0
                ? `Hay ${hiddenBySearch} trabajador${hiddenBySearch === 1 ? "" : "es"} que coincide${hiddenBySearch === 1 ? "" : "n"} con "${search}" fuera de esta vista.`
                : search
                  ? "Prueba cambiar filtros o revisar Todos."
                  : "Usa 'Quick add' para crear tu primer trabajador y opcionalmente enviarle una invitación."
            }
            actionLabel={hiddenBySearch > 0 ? "Ver en Todos" : (!search ? "Quick add" : undefined)}
            onAction={
              hiddenBySearch > 0
                ? () => setStatusTab("all")
                : (!search ? () => setQuickAddOpen(true) : undefined)
            }
          />
        )
      ) : effectiveViewMode === "roster" ? (
        /* ─── Roster (default desktop) — identity-card list ─── */
        <div className="space-y-2">
          {/* Photo guidance now lives in the filter-bar sub-strip (single source). */}
          <div className="rounded-2xl border border-border/50 bg-card overflow-hidden divide-y divide-border/30">
            {filtered.map((e) => {
              const phone = e.phone_number?.replace(/[^+\d]/g, "") ?? "";
              const risks = riskAnalysis.byId.get(e.id) ?? [];
              const ps = photoStatusFor(e);
              const view = buildWorkerEntityView(
                e as unknown as WorkerEntityInput,
                {
                  attention:
                    isMissingDocs(e) ||
                    ps === "required" ||
                    ps === "invalid" ||
                    risks.length > 0,
                  documentsPending: isMissingDocs(e),
                  isDriver: isDriver(e),
                  photoRequired: ps === "required" || ps === "invalid",
                },
                formatPersonName(`${e.first_name} ${e.last_name}`),
              );
              const riskBadges = risks.map((k) => {
                const meta = getRiskMeta(k);
                return {
                  key: `risk-${k}`,
                  label: meta.label,
                  hint: meta.description,
                  tone: (meta.tone === "destructive"
                    ? "critical"
                    : meta.tone === "warning"
                      ? "warning"
                      : "info") as "critical" | "warning" | "info",
                };
              });
              return (
                <EntityCard
                  key={e.id}
                  bare
                  kind="worker"
                  name={view.name}
                  reference={view.reference}
                  avatarUrl={e.avatar_url}
                  primaryDetail={e.phone_number ?? e.email ?? undefined}
                  status={view.status}
                  statusLabel={view.statusLabel}
                  badges={[...riskBadges, ...view.badges]}
                  onClick={() => navigate(`/app/employees/${e.id}`)}
                  actions={
                    <>
                      <EmpStatusBadge
                        employee={e}
                        invitation={invitations[e.id]}
                        showInvite
                        onInvite={() => { setViewEmployee(e); setInviteOpen(true); }}
                        onCopyLink={copyInviteLink}
                      />
                      {phone && (
                        <a
                          href={`https://wa.me/${phone.replace(/^\+/, "")}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hidden sm:inline-flex items-center justify-center h-7 w-7 rounded-lg text-emerald-600 hover:bg-emerald-500/10 transition"
                          aria-label={`WhatsApp ${e.first_name}`}
                        >
                          <MessageCircle className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </>
                  }
                />
              );
            })}
          </div>
        </div>
      ) : effectiveViewMode === "compact" ? (
        /* ─── Compact List ─── */
        <div className="rounded-xl border border-border/50 bg-card overflow-hidden divide-y divide-border/40">
          {filtered.map(e => {
            // Surface "incomplete" workers (no phone or no PIN) with the same
            // attention-grabbing tone as missing-docs so they're operable at a glance.
            const isIncomplete =
              e.is_active !== false &&
              (!(e.phone_number ?? "").toString().replace(/\D/g, "") || !(e.access_pin ?? "").toString().trim());
            const status: PremiumAvatarStatus = e.is_active === false
              ? "inactive"
              : isMissingDocs(e) || isIncomplete ? "missing-docs"
              : isNew(e) ? "new"
              : !e.user_id ? "pending"
              : "active";
            return (
              <div
                key={e.id}
                onClick={() => navigate(`/app/employees/${e.id}`)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 hover:bg-accent/30 transition-colors cursor-pointer",
                  !e.is_active && "opacity-50"
                )}
              >
                <PremiumAvatar firstName={e.first_name} lastName={e.last_name} avatarUrl={e.avatar_url} size="sm" status={status} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-xs font-semibold truncate">{formatPersonName(`${e.first_name} ${e.last_name}`)}</span>
                    {e.employer_identification && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="shrink-0 text-[10px] font-mono tabular-nums text-muted-foreground">{e.employer_identification}</span>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-xs">ID Stafly · referencia de payroll</TooltipContent>
                      </Tooltip>
                    )}
                    {!e.is_active && (
                      <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground bg-muted px-1.5 py-0.5 rounded">Histórico</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 flex-wrap">
                    <WorkerRiskTags risks={riskAnalysis.byId.get(e.id) ?? []} max={2} className="mt-0.5" />
                    {isMissingPhoto(e) && (
                      <WorkerPhotoStatusChip status="required" className="mt-0.5" />
                    )}
                  </div>
                </div>
                {e.phone_number && <span className="text-[10px] text-muted-foreground hidden md:inline">{e.phone_number}</span>}
                {isDriver(e) && <Car className="h-3 w-3 text-sky-500 shrink-0" aria-label="Driver" />}
                <EmpStatusBadge employee={e} invitation={invitations[e.id]} />
              </div>
            );
          })}
        </div>
      ) : effectiveViewMode === "cards" ? (
        /* ─── Cards View ─── */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
          {filtered.map(e => {
            const phone = e.phone_number?.replace(/[^+\d]/g, "") ?? "";
            const status: PremiumAvatarStatus = e.is_active === false
              ? "inactive"
              : isMissingDocs(e) ? "missing-docs"
              : isNew(e) ? "new"
              : isDriver(e) ? "driver"
              : !e.user_id ? "pending"
              : "active";
            return (
              <div
                key={e.id}
                onClick={() => navigate(`/app/employees/${e.id}`)}
                className={cn(
                  "group relative rounded-xl border border-border/40 bg-card p-2.5 sm:p-3 hover:shadow-md sm:hover:-translate-y-0.5 transition-all duration-200 cursor-pointer",
                  !e.is_active && "opacity-40"
                )}
              >
                <div className="flex items-start gap-2.5">
                  <PremiumAvatar firstName={e.first_name} lastName={e.last_name} avatarUrl={e.avatar_url} size="md" status={status} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <p className="text-[13px] font-bold truncate leading-tight">{formatPersonName(`${e.first_name} ${e.last_name}`)}</p>
                      {!e.is_active && (
                        <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground bg-muted px-1.5 py-0.5 rounded">Histórico</span>
                      )}
                    </div>
                    {e.employer_identification && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-block mt-0.5 text-[10px] font-mono tabular-nums text-muted-foreground">
                            ID Stafly · {e.employer_identification}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-xs">Referencia de payroll</TooltipContent>
                      </Tooltip>
                    )}
                    <div className="flex items-center gap-1 flex-wrap mt-1">
                      <WorkerRiskTags risks={riskAnalysis.byId.get(e.id) ?? []} max={2} />
                      {isMissingPhoto(e) && (
                        <WorkerPhotoStatusChip status="required" />
                      )}
                    </div>
                    {e.employee_role && <span className="inline-block mt-1 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-primary/8 text-primary">{formatDisplayText(e.employee_role, "label")}</span>}
                    <div className="mt-1 space-y-0.5">
                      {e.phone_number && <p className="text-[10px] text-muted-foreground truncate flex items-center gap-1"><Phone className="h-2.5 w-2.5" />{e.phone_number}</p>}
                      {e.email && <p className="text-[10px] text-muted-foreground truncate flex items-center gap-1 hidden sm:flex"><Mail className="h-2.5 w-2.5" />{e.email}</p>}
                    </div>
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <EmpStatusBadge employee={e} invitation={invitations[e.id]} showInvite onInvite={() => { setViewEmployee(e); setInviteOpen(true); }} onCopyLink={copyInviteLink} />
                  <div className="flex items-center gap-1">
                    {phone && (
                      <>
                        <a
                          href={`tel:${phone}`}
                          onClick={(ev) => ev.stopPropagation()}
                          className="md:hidden inline-flex items-center justify-center h-8 w-8 rounded-lg bg-primary/10 text-primary active:scale-95 transition"
                          aria-label={`Call ${e.first_name}`}
                        >
                          <Phone className="h-3.5 w-3.5" />
                        </a>
                        <a
                          href={`https://wa.me/${phone.replace(/^\+/, "")}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(ev) => ev.stopPropagation()}
                          className="md:hidden inline-flex items-center justify-center h-8 w-8 rounded-lg bg-emerald-500/10 text-emerald-600 active:scale-95 transition"
                          aria-label={`WhatsApp ${e.first_name}`}
                        >
                          <MessageCircle className="h-3.5 w-3.5" />
                        </a>
                      </>
                    )}
                    {e.access_pin && <span className="text-[9px] text-muted-foreground/50 hidden sm:inline">PIN</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* ─── List View (Dense Table) ─── */
        <div className="rounded-xl border border-border/40 bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 h-8">
                {(() => {
                  const failedInView = filtered.filter(isInviteFailed);
                  const allFailedSelected = failedInView.length > 0 && failedInView.every(e => selectedIds.has(e.id));
                  const someFailedSelected = failedInView.some(e => selectedIds.has(e.id));
                  return (
                    <TableHead className="w-8 pl-3 pr-0">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex">
                            <Checkbox
                              aria-label="Select all failed invitations in view"
                              checked={allFailedSelected ? true : (someFailedSelected ? "indeterminate" : false)}
                              disabled={failedInView.length === 0}
                              onCheckedChange={(c) => {
                                if (c) selectAllInList(failedInView.map(e => e.id));
                                else clearSelection();
                              }}
                            />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="right" className="text-xs max-w-[220px]">
                          {failedInView.length === 0
                            ? "No failed invitations in this view"
                            : `Select all ${failedInView.length} failed invitation${failedInView.length === 1 ? "" : "s"}`}
                        </TooltipContent>
                      </Tooltip>
                    </TableHead>
                  );
                })()}
                <TableHead className="w-8 pl-2 pr-0"></TableHead>
                <TableHead
                  className="text-[10px] cursor-pointer select-none hover:bg-muted/40 transition-colors"
                  onClick={() => onSort("name")}
                  aria-sort={sort.key === "name" ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}
                >
                  <span className="inline-flex items-center gap-1">Name <SortIndicator direction={directionFor("name")} /></span>
                </TableHead>
                {visibleColumns.includes("employer_identification") && (
                  <TableHead
                    className="text-[10px] w-[80px] cursor-pointer select-none hover:bg-muted/40 transition-colors"
                    onClick={() => onSort("code")}
                    aria-sort={sort.key === "code" ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}
                  >
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-flex items-center gap-1">ID Stafly <SortIndicator direction={directionFor("code")} /></span>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs">ID Stafly · referencia de payroll</TooltipContent>
                    </Tooltip>
                  </TableHead>
                )}
                {visibleColumns.includes("phone_number") && <TableHead className="hidden sm:table-cell text-[10px]">Phone</TableHead>}
                {visibleColumns.includes("email") && <TableHead className="hidden md:table-cell text-[10px]">Email</TableHead>}
                {visibleColumns.includes("employee_role") && (
                  <TableHead
                    className="hidden lg:table-cell text-[10px] cursor-pointer select-none hover:bg-muted/40 transition-colors"
                    onClick={() => onSort("role")}
                    aria-sort={sort.key === "role" ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}
                  >
                    <span className="inline-flex items-center gap-1">Role <SortIndicator direction={directionFor("role")} /></span>
                  </TableHead>
                )}
                {visibleColumns.includes("groups") && <TableHead className="hidden xl:table-cell text-[10px]">Group</TableHead>}
                {visibleColumns.includes("onboarding_status") && <TableHead className="hidden lg:table-cell text-[10px]">Onboarding</TableHead>}
                {visibleColumns.includes("address_city") && <TableHead className="hidden xl:table-cell text-[10px]">City</TableHead>}
                {visibleColumns.includes("address_state") && <TableHead className="hidden xl:table-cell text-[10px]">State</TableHead>}
                {visibleColumns.includes("can_drive") && <TableHead className="hidden xl:table-cell text-[10px]">Drives</TableHead>}
                {visibleColumns.includes("has_vehicle") && <TableHead className="hidden xl:table-cell text-[10px]">Vehicle</TableHead>}
                {visibleColumns.includes("english_level") && <TableHead className="hidden xl:table-cell text-[10px]">English</TableHead>}
                {visibleColumns.includes("start_date") && <TableHead className="hidden xl:table-cell text-[10px]">Start</TableHead>}
                {visibleColumns.includes("status") && <TableHead className="text-[10px] w-[80px]">Status</TableHead>}
                {visibleColumns.includes("last_login") && (
                  <TableHead
                    className="hidden lg:table-cell text-[10px] w-[80px] cursor-pointer select-none hover:bg-muted/40 transition-colors"
                    onClick={() => onSort("last_activity")}
                    aria-sort={sort.key === "last_activity" ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}
                  >
                    <span className="inline-flex items-center gap-1">Last login <SortIndicator direction={directionFor("last_activity")} /></span>
                  </TableHead>
                )}
                <TableHead className="w-8 pr-3"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((e) => {
                const rowSelected = selectedIds.has(e.id);
                const rowFailed = isInviteFailed(e);
                return (
                <TableRow
                  key={e.id}
                  className={cn(
                    "group hover:bg-accent/30 transition-colors cursor-pointer h-10",
                    !e.is_active && "opacity-35",
                    rowSelected && "bg-primary/[0.04]"
                  )}
                  onClick={() => navigate(`/app/employees/${e.id}`)}
                >
                  <TableCell className="py-1 pl-3 pr-0" onClick={ev => ev.stopPropagation()}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-flex">
                          <Checkbox
                            aria-label={rowFailed ? `Select ${e.first_name} ${e.last_name} for re-invite` : `Selection only enabled for failed invitations`}
                            checked={rowSelected}
                            disabled={!rowFailed}
                            onCheckedChange={() => toggleRowSelected(e.id)}
                          />
                        </span>
                      </TooltipTrigger>
                      {!rowFailed && (
                        <TooltipContent side="right" className="text-xs max-w-[220px]">
                          Bulk re-invite is limited to workers whose last invitation failed.
                        </TooltipContent>
                      )}
                    </Tooltip>
                  </TableCell>
                  <TableCell className="py-1 pl-2 pr-0">
                    <EmployeeAvatar firstName={e.first_name ?? ""} lastName={e.last_name ?? ""} avatarUrl={e.avatar_url} gender={e.gender} size="md" />
                  </TableCell>
                  <TableCell className="py-1">
                    <div className="leading-tight">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-semibold">{formatPersonName(`${e.first_name} ${e.last_name}`)}</span>
                        {!e.is_active && (
                          <span className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground bg-muted px-1.5 py-0.5 rounded">Histórico</span>
                        )}
                      </div>
                      <span className="sm:hidden block text-[10px] text-muted-foreground mt-0.5">{e.phone_number || e.email || ""}</span>
                      <div className="flex items-center gap-1 flex-wrap mt-1">
                        <WorkerRiskTags risks={riskAnalysis.byId.get(e.id) ?? []} max={2} />
                        {isMissingPhoto(e) && (
                          <WorkerPhotoStatusChip status="required" />
                        )}
                      </div>
                    </div>
                  </TableCell>
                  {visibleColumns.includes("employer_identification") && (
                    <TableCell className="py-1">
                      {e.employer_identification ? (
                        <span className="text-[11px] font-mono font-semibold tabular-nums text-foreground">{e.employer_identification}</span>
                      ) : <span className="text-[11px] text-muted-foreground/25">—</span>}
                    </TableCell>
                  )}
                  {visibleColumns.includes("phone_number") && (
                    <TableCell className="hidden sm:table-cell py-1">
                      {e.phone_number ? (
                        <a href={`tel:${e.phone_number}`} onClick={ev => ev.stopPropagation()} className="text-[11px] text-muted-foreground hover:text-primary transition-colors">{e.phone_number}</a>
                      ) : <span className="text-[11px] text-muted-foreground/25">—</span>}
                    </TableCell>
                  )}
                  {visibleColumns.includes("email") && (
                    <TableCell className="hidden md:table-cell py-1">
                      {e.email ? (
                        <span className="text-[11px] text-muted-foreground truncate max-w-[160px] block">{e.email}</span>
                      ) : <span className="text-[11px] text-muted-foreground/25">—</span>}
                    </TableCell>
                  )}
                  {visibleColumns.includes("employee_role") && (
                    <TableCell className="hidden lg:table-cell py-1">
                      {e.employee_role ? (
                        <span className="text-[10px] text-muted-foreground">{formatDisplayText(e.employee_role, "label")}</span>
                      ) : <span className="text-[10px] text-muted-foreground/25">—</span>}
                    </TableCell>
                  )}
                  {visibleColumns.includes("groups") && (
                    <TableCell className="hidden xl:table-cell py-1">
                      {e.groups ? <span className="text-[10px] text-muted-foreground truncate max-w-[100px] block">{e.groups.split(",")[0].trim()}</span> : <span className="text-[10px] text-muted-foreground/25">—</span>}
                    </TableCell>
                  )}
                  {visibleColumns.includes("onboarding_status") && (
                    <TableCell className="hidden lg:table-cell py-1">
                      <Badge variant={e.onboarding_status === "complete" ? "default" : "secondary"} className="text-[9px] py-0">
                        {e.onboarding_status === "complete" ? "Complete" : e.onboarding_status === "incomplete" ? "Incomplete" : "Pending"}
                      </Badge>
                    </TableCell>
                  )}
                  {visibleColumns.includes("address_city") && (
                    <TableCell className="hidden xl:table-cell py-1">
                      <span className="text-[10px] text-muted-foreground">{e.address_city || "—"}</span>
                    </TableCell>
                  )}
                  {visibleColumns.includes("address_state") && (
                    <TableCell className="hidden xl:table-cell py-1">
                      <span className="text-[10px] text-muted-foreground">{e.address_state || "—"}</span>
                    </TableCell>
                  )}
                  {visibleColumns.includes("can_drive") && (
                    <TableCell className="hidden xl:table-cell py-1">
                      <span className="text-[10px]">{e.can_drive ? "✓" : "—"}</span>
                    </TableCell>
                  )}
                  {visibleColumns.includes("has_vehicle") && (
                    <TableCell className="hidden xl:table-cell py-1">
                      <span className="text-[10px]">{e.has_vehicle ? "✓" : "—"}</span>
                    </TableCell>
                  )}
                  {visibleColumns.includes("english_level") && (
                    <TableCell className="hidden xl:table-cell py-1">
                      <span className="text-[10px] text-muted-foreground">{e.english_level || "—"}</span>
                    </TableCell>
                  )}
                  {visibleColumns.includes("start_date") && (
                    <TableCell className="hidden xl:table-cell py-1">
                      <span className="text-[10px] text-muted-foreground">{e.start_date || "—"}</span>
                    </TableCell>
                  )}
                  {visibleColumns.includes("status") && (
                    <TableCell className="py-1">
                      <EmpStatusBadge employee={e} invitation={invitations[e.id]} showInvite onInvite={() => { setViewEmployee(e); setInviteOpen(true); }} onCopyLink={copyInviteLink} />
                    </TableCell>
                  )}
                  {visibleColumns.includes("last_login") && (
                    <TableCell className="hidden lg:table-cell py-1">
                      {(() => {
                        if (!e.last_login) return <span className="text-[10px] text-muted-foreground/25">—</span>;
                        const d = parseISO(e.last_login);
                        return isValid(d)
                          ? <span className="text-[10px] text-muted-foreground/60">{formatDistanceToNow(d, { addSuffix: true, locale: enUS })}</span>
                          : <span className="text-[10px] text-muted-foreground/25">—</span>;
                      })()}
                    </TableCell>
                  )}
                  <TableCell className="py-1 pr-3" onClick={ev => ev.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity">
                          <MoreHorizontal className="h-3.5 w-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem onClick={() => navigate(`/app/employees/${e.id}`)} className="text-xs"><Eye className="h-3.5 w-3.5 mr-2" />Open full profile</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openDetailSheet(e)} className="text-xs"><Pencil className="h-3.5 w-3.5 mr-2" />Quick edit</DropdownMenuItem>
                        {(() => {
                          const inviteDecision = canInviteWorker(e, invitations[e.id]);
                          return (
                            <DropdownMenuItem
                              onClick={() => { setViewEmployee(e); setInviteOpen(true); }}
                              className="text-xs"
                              disabled={!inviteDecision.allowed}
                              title={inviteDecision.reason}
                            >
                              <Send className="h-3.5 w-3.5 mr-2" />
                              {e.is_active === false ? "Reactivate to invite" : "Invite"}
                            </DropdownMenuItem>
                          );
                        })()}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => toggleActive(e)} className="text-xs">
                          {e.is_active ? <><Archive className="h-3.5 w-3.5 mr-2" />Archive</> : <><UserCheck className="h-3.5 w-3.5 mr-2" />Activate</>}
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive text-xs" onClick={() => { setDeleteTarget(e); setPasswordOpen(true); }}><Trash2 className="h-3.5 w-3.5 mr-2" />Delete</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
      </OperationalWorkspace>



      {/* ─── Detail Sheet — Premium ─── */}
      <Sheet open={!!viewEmployee} onOpenChange={(v) => { if (!v) { setViewEmployee(null); setIsEditing(false); setProfileActiveTab("info"); } }}>
        <SheetContent className="w-full max-w-full sm:max-w-[440px] md:max-w-[560px] p-0 flex flex-col">
          {/* Header */}
          <div
            className="bg-gradient-to-br from-primary/[0.04] to-transparent border-b px-3 sm:px-5 py-3 sm:py-4"
            style={{ paddingTop: "max(env(safe-area-inset-top, 0px) + 0.75rem, 0.75rem)" }}
          >
            <div className="flex items-start gap-3 pr-8">
              <EmployeeAvatar firstName={viewEmployee?.first_name ?? ""} lastName={viewEmployee?.last_name ?? ""} avatarUrl={viewEmployee?.avatar_url} gender={viewEmployee?.gender} size="xl" className="ring-2 ring-background shadow-lg shrink-0" />
              <div className="flex-1 min-w-0 pt-0.5">
                <SheetTitle className="text-base font-bold leading-tight truncate">{formatPersonName(`${viewEmployee?.first_name} ${viewEmployee?.last_name}`)}</SheetTitle>
                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                  {viewEmployee?.employer_identification && (
                    <Badge variant="outline" className="text-[9px] py-0 font-mono">#{viewEmployee.employer_identification}</Badge>
                  )}
                  {viewEmployee?.employee_role && <Badge variant="secondary" className="text-[10px] py-0 max-w-[140px] truncate">{formatDisplayText(viewEmployee.employee_role, "label")}</Badge>}
                  {viewEmployee && <EmpStatusBadge employee={viewEmployee} invitation={invitations[viewEmployee.id]} />}
                </div>
                <SheetDescription className="mt-1 text-[11px] text-muted-foreground/70 flex items-center gap-x-3 gap-y-0.5 flex-wrap">
                  {viewEmployee?.phone_number && <span className="flex items-center gap-1 min-w-0 max-w-full"><Phone className="h-3 w-3 shrink-0" /><span className="truncate">{viewEmployee.phone_number}</span></span>}
                  {viewEmployee?.email && <span className="flex items-center gap-1 min-w-0 max-w-full"><Mail className="h-3 w-3 shrink-0" /><span className="truncate">{viewEmployee.email}</span></span>}
                </SheetDescription>
              </div>
            </div>
            {/* Actions bar */}
            <div className="flex items-center gap-1.5 mt-3 flex-wrap">
              <Button
                variant="default"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={() => { if (viewEmployee) { const id = viewEmployee.id; setViewEmployee(null); navigate(`/app/employees/${id}`); } }}
              >
                Ver perfil completo →
              </Button>
              {!isEditing ? (
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setIsEditing(true)} disabled={loading}>
                  <Pencil className="h-3 w-3 mr-1" />Edición rápida
                </Button>
              ) : (
                <>
                  <Button variant="default" size="sm" className="h-7 text-xs" onClick={handleSaveFromSheet} disabled={loading}>
                    {loading ? "Guardando…" : "Guardar"}
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => {
                    // Reset form to original employee values on cancel
                    if (viewEmployee) {
                      const f: Record<string, string> = {};
                      CONNECTEAM_FIELDS.forEach(field => { f[field.key] = viewEmployee[field.key] ?? ""; });
                      setForm(f);
                    }
                    setIsEditing(false);
                  }} disabled={loading}>
                    Cancelar
                  </Button>
                  <Badge variant="outline" className="h-6 gap-1 border-warning/40 bg-warning/10 text-warning text-[9px] px-1.5">
                    <Pencil className="h-2.5 w-2.5" /> Editando
                  </Badge>
                </>
              )}
              {(() => {
                const inviteDecision = viewEmployee ? canInviteWorker(viewEmployee, invitations[viewEmployee.id]) : { allowed: false, reason: "Selecciona un trabajador primero." };
                return (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setInviteOpen(true)}
                    disabled={!inviteDecision.allowed}
                    title={inviteDecision.reason}
                  >
                    <Send className="h-3 w-3 mr-1" />
                    {viewEmployee?.is_active === false ? "Reactivar primero" : "Invitar"}
                  </Button>
                );
              })()}
              <div className="ml-auto sm:ml-auto flex items-center gap-0.5">
                {viewEmployee && (isPendingIdentity(viewEmployee as any) || isPlaceholderWorker(viewEmployee as any)) && isPrivileged && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
                    onClick={() => setIdentityResolveOpen(true)}
                  >
                    Resolver identidad
                  </Button>
                )}
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { if (viewEmployee) toggleActive(viewEmployee); }}>
                  {viewEmployee?.is_active ? <><Archive className="h-3 w-3 mr-1" />Archivar</> : <><UserCheck className="h-3 w-3 mr-1" />Activar</>}
                </Button>
                <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive hover:text-destructive" onClick={() => { if (viewEmployee) { setDeleteTarget(viewEmployee); setPasswordOpen(true); setViewEmployee(null); } }}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-3 sm:p-4 space-y-3 pb-28">
              {viewEmployee && (
                <>
                  <WorkerDataQualityReview
                    employee={viewEmployee}
                    companyEmployees={employees}
                    documentSignals={documentSignals}
                    companyName={selectedCompany?.name}
                    onJumpToTab={(tab) => setProfileActiveTab(tab)}
                  />
                  <WorkerDocumentsCompliance employee={viewEmployee} />
                </>
              )}
              <EmployeeProfileTabs employee={viewEmployee!} companyId={selectedCompanyId!} isEditing={isEditing} form={form} setForm={setForm} isPrivileged={isPrivileged} onEmployeeUpdate={(updates) => setViewEmployee(prev => prev ? { ...prev, ...updates } : prev)} companyName={selectedCompany?.name} onInvite={() => setInviteOpen(true)} invitation={viewEmployee ? invitations[viewEmployee.id] ?? null : null} activeTab={profileActiveTab} onTabChange={setProfileActiveTab} />
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>

      {/* Identity Resolution Drawer (Phase 2B) */}
      <IdentityResolutionDrawer
        open={identityResolveOpen}
        onOpenChange={setIdentityResolveOpen}
        employee={viewEmployee as any}
        companyName={selectedCompany?.name}
        companyEmployees={employees as any}
        onResolved={() => fetchEmployees()}
      />


      {/* Invite Dialog */}
      {viewEmployee && <EmployeeInviteDialog open={inviteOpen} onOpenChange={setInviteOpen} employee={viewEmployee} inviteToken={invitations[viewEmployee.id]?.invite_token ?? null} onInviteSent={(channel) => { logInvitation(viewEmployee.id, channel); refetchInvitations(); }} />}

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={(v) => { setEditOpen(v); if (!v) setEditingEmployee(null); }}>
        <DialogContent className="max-w-md"><DialogHeader><DialogTitle>Edit worker</DialogTitle><DialogDescription>Update worker information</DialogDescription></DialogHeader><EmployeeForm fields={CONNECTEAM_FIELDS} form={form} setForm={setForm} loading={loading} onSubmit={handleUpdate} submitLabel="Save changes" /></DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <PasswordConfirmDialog
        open={passwordOpen}
        onOpenChange={(v) => { setPasswordOpen(v); if (!v) setDeleteTarget(null); }}
        title="Delete worker"
        description={`${deleteTarget?.first_name} ${deleteTarget?.last_name} will be permanently deleted.`}
        onConfirm={handleDelete}
      />

      {/* Archive Employee Dialog */}
      {archiveTarget && (
        <ArchiveEmployeeDialog
          open={!!archiveTarget}
          onOpenChange={(v) => { if (!v) setArchiveTarget(null); }}
          employee={{ id: archiveTarget.id, first_name: archiveTarget.first_name ?? "", last_name: archiveTarget.last_name ?? "", company_id: archiveTarget.company_id }}
          onArchived={() => { setArchiveTarget(null); setViewEmployee(null); fetchEmployees(); }}
        />
      )}

      {/* Column Preferences */}
      <ColumnPreferencesDialog
        open={colPrefsOpen}
        onOpenChange={setColPrefsOpen}
        visibleColumns={visibleColumns}
        onSave={savePreferences}
      />

      {/* Campaña de activación */}
      <BulkActivationCampaignDialog
        open={campaignOpen}
        onOpenChange={setCampaignOpen}
        employees={employees}
        onComplete={() => { fetchEmployees(); refetchInvitations(); }}
      />

      {/* Audit */}
      <div className="mt-6">
        <AuditPanel entityType="employee" title="Worker activity" hideViews compact />
      </div>

      {/* Onboarding Settings Sheet */}
      <ModuleSettingsSheet
        open={onboardingSettingsOpen}
        onOpenChange={setOnboardingSettingsOpen}
        title="Onboarding Settings"
        icon={Settings2}
        sections={[
          {
            title: "Employee Creation",
            description: "Requirements when adding new employees",
            fields: [
              { key: "require_email", label: "Require email", type: "toggle", description: "Block employee creation without an email address" },
              { key: "auto_send_invite_on_create", label: "Auto-invite on create", type: "toggle", description: "Automatically open invite dialog after creating an employee" },
            ],
          },
          {
            title: "Invitations",
            description: "How employee invitations behave",
            fields: [
              { key: "invite_expiry_days", label: "Invitation expiry", type: "number", min: 1, max: 90, suffix: "days" },
            ],
          },
          {
            title: "Portal",
            description: "Employee portal experience",
            fields: [
              { key: "welcome_message", label: "Welcome message", type: "text", placeholder: "Shown on first portal login" },
            ],
          },
        ] as SettingsSection[]}
        config={onboardingConfig as any}
        onUpdate={(partial) => updateOnboardingConfig(partial as any)}
        loading={onboardingConfigLoading}
      />
    </div>
  );
}
