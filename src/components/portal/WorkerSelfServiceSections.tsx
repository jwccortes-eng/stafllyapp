/**
 * WorkerSelfServiceSections — Phase 1 worker self-service profile editor.
 *
 * Renders editable cards inside /portal/update-center for non-sensitive fields:
 *   - Contacto (phone)
 *   - Dirección (residencial)
 *   - Contacto de emergencia (name + phone)
 *   - Foto profesional (reuses existing upload flow)
 *
 * Constraints honored:
 *   - Worker can only update their OWN effective employee record (RLS policy
 *     "Employees can update own profile" already enforces user_id = auth.uid()).
 *   - No payroll, SSN/EIN, role, employer_id, compensation or permission fields.
 *   - Reuses existing premium inputs (SmartPhoneInput, PremiumAddressField).
 *   - No new RLS, no migrations, no notifications.
 *   - TODO(audit): once an `identity_change_log` table exists, wire writes here.
 */
import { useEffect, useState } from "react";
import { Phone, HeartPulse, Home, Camera, Loader2, CheckCircle2, Pencil, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { SmartPhoneInput } from "@/components/ui/smart-phone-input";
import { PremiumAddressField, AddressPreviewCard } from "@/components/address";
import {
  normalizeFromLegacyColumns,
  recomputeDerived,
  type StructuredAddress,
} from "@/lib/address";
import { ProfilePhotoUpload } from "@/components/employee/ProfilePhotoUpload";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { formatPhoneUS, tenDigitUS } from "@/lib/phone-format";
import { cn } from "@/lib/utils";

interface Props {
  employeeId: string;
  onUpdated?: () => void;
}

type EmployeeRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone_number: string | null;
  avatar_url: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  address: string | null;
  address_line: string | null;
  address_city: string | null;
  address_state: string | null;
  address_zip: string | null;
  address_structured: StructuredAddress | null;
  county?: string | null;
  approx_latitude?: number | null;
  approx_longitude?: number | null;
};

export function WorkerSelfServiceSections({ employeeId, onUpdated }: Props) {
  const { toast } = useToast();
  const [employee, setEmployee] = useState<EmployeeRow | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("employees")
      .select(
        "id, first_name, last_name, phone_number, avatar_url, emergency_contact_name, emergency_contact_phone, address, address_line, address_city, address_state, address_zip, address_structured, county, approx_latitude, approx_longitude",
      )
      .eq("id", employeeId)
      .maybeSingle();
    setEmployee((data as unknown) as EmployeeRow | null);
    setLoading(false);
  };

  useEffect(() => {
    if (employeeId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId]);

  if (loading || !employee) {
    return (
      <div className="rounded-2xl border border-border/40 bg-card/60 p-5 text-center text-[12px] text-muted-foreground">
        Cargando tu información…
      </div>
    );
  }

  const handlePatched = (patch: Partial<EmployeeRow>) => {
    setEmployee((prev) => (prev ? { ...prev, ...patch } : prev));
    onUpdated?.();
  };

  return (
    <div className="space-y-3">
      <div className="px-1">
        <h2 className="text-[10.5px] font-bold uppercase tracking-widest text-muted-foreground/55">
          Actualiza tu información
        </h2>
        <p className="text-[11.5px] text-muted-foreground/75 mt-1 leading-snug">
          Mantén tu perfil listo para recibir turnos y cobrar sin problemas.
        </p>
      </div>

      <PhotoCard
        employeeId={employee.id}
        avatarUrl={employee.avatar_url}
        firstName={employee.first_name ?? ""}
        lastName={employee.last_name ?? ""}
        onUploaded={(url) => handlePatched({ avatar_url: url })}
      />

      <PhoneCard
        employeeId={employee.id}
        value={employee.phone_number}
        onSaved={(v) => handlePatched({ phone_number: v })}
        toast={toast}
      />

      <AddressCard
        employee={employee}
        onSaved={(patch) => handlePatched(patch)}
        toast={toast}
      />

      <EmergencyCard
        employeeId={employee.id}
        name={employee.emergency_contact_name}
        phone={employee.emergency_contact_phone}
        onSaved={(n, p) =>
          handlePatched({
            emergency_contact_name: n,
            emergency_contact_phone: p,
          })
        }
        toast={toast}
      />
    </div>
  );
}

/* ─────────────────── Photo card ─────────────────── */

function PhotoCard({
  employeeId,
  avatarUrl,
  firstName,
  lastName,
  onUploaded,
}: {
  employeeId: string;
  avatarUrl: string | null;
  firstName: string;
  lastName: string;
  onUploaded: (url: string) => void;
}) {
  return (
    <SectionShell
      icon={<Camera className="h-3.5 w-3.5" />}
      title="Foto profesional"
      complete={!!avatarUrl}
    >
      <div className="flex items-center gap-3">
        <EmployeeAvatar
          firstName={firstName}
          lastName={lastName}
          avatarUrl={avatarUrl}
          size="lg"
          className="shrink-0"
        />
        <div className="flex-1 min-w-0">
          <p className="text-[12px] text-muted-foreground/80 leading-snug">
            Rostro claro, fondo limpio, buena iluminación. Sin paisajes,
            logos ni avatares.
          </p>
        </div>
      </div>
      <div className="mt-3">
        <ProfilePhotoUpload
          employeeId={employeeId}
          currentAvatarUrl={avatarUrl}
          firstName={firstName}
          lastName={lastName}
          onUploaded={onUploaded}
        />
      </div>
    </SectionShell>
  );
}

/* ─────────────────── Phone card ─────────────────── */

function PhoneCard({
  employeeId,
  value,
  onSaved,
  toast,
}: {
  employeeId: string;
  value: string | null;
  onSaved: (v: string) => void;
  toast: ReturnType<typeof useToast>["toast"];
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => setDraft(value ?? ""), [value]);

  const digits = tenDigitUS(draft);
  const dirty = digits !== tenDigitUS(value ?? "");
  const valid = digits.length === 10;

  const save = async () => {
    if (!valid) {
      toast({
        title: "Teléfono inválido",
        description: "Ingresa un número de 10 dígitos.",
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("employees")
      .update({ phone_number: digits })
      .eq("id", employeeId);
    setSaving(false);
    if (error) {
      toast({ title: "No se pudo guardar", description: error.message, variant: "destructive" });
      return;
    }
    onSaved(digits);
    setEditing(false);
    toast({ title: "Teléfono actualizado ✅" });
  };

  return (
    <SectionShell
      icon={<Phone className="h-3.5 w-3.5" />}
      title="Teléfono"
      complete={!!value}
      action={
        !editing ? (
          <EditButton onClick={() => setEditing(true)} />
        ) : (
          <CancelButton
            onClick={() => {
              setDraft(value ?? "");
              setEditing(false);
            }}
          />
        )
      }
    >
      {!editing ? (
        <p className="text-[13px] font-medium text-foreground">
          {value ? formatPhoneUS(value) : <span className="text-muted-foreground/60">Sin teléfono registrado</span>}
        </p>
      ) : (
        <div className="space-y-2">
          <Label className="text-[11px]">Número de teléfono</Label>
          <SmartPhoneInput
            value={draft}
            onChange={(d) => setDraft(d)}
            showValidation
            className="h-10"
          />
          <Button
            size="sm"
            className="w-full h-10"
            onClick={save}
            disabled={!dirty || !valid || saving}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar teléfono"}
          </Button>
        </div>
      )}
    </SectionShell>
  );
}

/* ─────────────────── Address card ─────────────────── */

function AddressCard({
  employee,
  onSaved,
  toast,
}: {
  employee: EmployeeRow;
  onSaved: (patch: Partial<EmployeeRow>) => void;
  toast: ReturnType<typeof useToast>["toast"];
}) {
  const hydrate = (): StructuredAddress | null => {
    const stored = employee.address_structured;
    if (stored && typeof stored === "object" && (stored as any).formatted_address) {
      return recomputeDerived(stored);
    }
    return normalizeFromLegacyColumns({
      address_line: employee.address_line ?? null,
      address_city: employee.address_city ?? null,
      address_state: employee.address_state ?? null,
      address_zip: employee.address_zip ?? null,
      address: employee.address ?? null,
      county: employee.county ?? null,
      latitude: employee.approx_latitude ?? null,
      longitude: employee.approx_longitude ?? null,
    });
  };

  const [value, setValue] = useState<StructuredAddress | null>(hydrate);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setValue(hydrate());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employee.id, employee.address_structured, employee.address]);

  const persist = async (next: StructuredAddress | null) => {
    setSaving(true);
    const patch: Record<string, any> = {
      address_structured: next,
      address: next?.formatted_address ?? null,
      address_line: next?.address_line1 ?? null,
      address_city: next?.city ?? null,
      address_state: next?.state ?? null,
      address_zip: next?.postal_code ?? null,
      county: next?.county ?? employee.county ?? null,
      approx_latitude: next?.latitude ?? employee.approx_latitude ?? null,
      approx_longitude: next?.longitude ?? employee.approx_longitude ?? null,
    };
    const { error } = await (supabase as any)
      .from("employees")
      .update(patch)
      .eq("id", employee.id);
    setSaving(false);
    if (error) {
      toast({ title: "No se pudo guardar la dirección", description: error.message, variant: "destructive" });
      return;
    }
    onSaved(patch as Partial<EmployeeRow>);
    toast({ title: "Dirección actualizada ✅" });
  };

  return (
    <SectionShell
      icon={<Home className="h-3.5 w-3.5" />}
      title="Dirección residencial"
      complete={!!value?.formatted_address}
      action={
        !editing ? (
          <EditButton onClick={() => setEditing(true)} />
        ) : (
          <CancelButton onClick={() => setEditing(false)} />
        )
      }
    >
      {!editing ? (
        value?.formatted_address ? (
          <AddressPreviewCard address={value} />
        ) : (
          <p className="text-[12px] text-muted-foreground/60">Sin dirección registrada</p>
        )
      ) : (
        <>
          <PremiumAddressField
            value={value}
            onChange={(next) => {
              setValue(next);
              void persist(next);
            }}
            label="Dirección"
            helper="La usamos para asignarte trabajos cercanos."
            country="US"
          />
          {saving && (
            <p className="mt-2 text-[10.5px] text-muted-foreground/60">Guardando…</p>
          )}
        </>
      )}
    </SectionShell>
  );
}

/* ─────────────────── Emergency contact card ─────────────────── */

function EmergencyCard({
  employeeId,
  name,
  phone,
  onSaved,
  toast,
}: {
  employeeId: string;
  name: string | null;
  phone: string | null;
  onSaved: (n: string | null, p: string | null) => void;
  toast: ReturnType<typeof useToast>["toast"];
}) {
  const [editing, setEditing] = useState(false);
  const [nDraft, setNDraft] = useState(name ?? "");
  const [pDraft, setPDraft] = useState(phone ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setNDraft(name ?? "");
    setPDraft(phone ?? "");
  }, [name, phone]);

  const digits = tenDigitUS(pDraft);
  const trimmedName = nDraft.trim();
  const phoneValid = digits.length === 0 || digits.length === 10;
  const dirty = trimmedName !== (name ?? "").trim() || digits !== tenDigitUS(phone ?? "");

  const save = async () => {
    if (trimmedName.length > 0 && digits.length !== 10) {
      toast({
        title: "Teléfono inválido",
        description: "Ingresa un número de 10 dígitos.",
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("employees")
      .update({
        emergency_contact_name: trimmedName || null,
        emergency_contact_phone: digits || null,
      })
      .eq("id", employeeId);
    setSaving(false);
    if (error) {
      toast({ title: "No se pudo guardar", description: error.message, variant: "destructive" });
      return;
    }
    onSaved(trimmedName || null, digits || null);
    setEditing(false);
    toast({ title: "Contacto de emergencia actualizado ✅" });
  };

  return (
    <SectionShell
      icon={<HeartPulse className="h-3.5 w-3.5" />}
      title="Contacto de emergencia"
      complete={!!(name && phone)}
      action={
        !editing ? (
          <EditButton onClick={() => setEditing(true)} />
        ) : (
          <CancelButton
            onClick={() => {
              setNDraft(name ?? "");
              setPDraft(phone ?? "");
              setEditing(false);
            }}
          />
        )
      }
    >
      {!editing ? (
        name || phone ? (
          <div className="space-y-0.5">
            <p className="text-[13px] font-medium text-foreground">
              {name || <span className="text-muted-foreground/60">Sin nombre</span>}
            </p>
            <p className="text-[12px] text-muted-foreground">
              {phone ? formatPhoneUS(phone) : "Sin teléfono"}
            </p>
          </div>
        ) : (
          <p className="text-[12px] text-muted-foreground/60">Sin contacto registrado</p>
        )
      ) : (
        <div className="space-y-2.5">
          <div className="space-y-1.5">
            <Label className="text-[11px]">Nombre completo</Label>
            <Input
              value={nDraft}
              onChange={(e) => setNDraft(e.target.value.slice(0, 100))}
              placeholder="Ej. María Pérez"
              className="h-10"
              maxLength={100}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px]">Teléfono</Label>
            <SmartPhoneInput
              value={pDraft}
              onChange={(d) => setPDraft(d)}
              showValidation
              className="h-10"
            />
          </div>
          <Button
            size="sm"
            className="w-full h-10"
            onClick={save}
            disabled={!dirty || !phoneValid || saving}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar contacto"}
          </Button>
        </div>
      )}
    </SectionShell>
  );
}

/* ─────────────────── Shared shell ─────────────────── */

function SectionShell({
  icon,
  title,
  complete,
  action,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  complete?: boolean;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border/60 bg-card p-3.5 shadow-sm">
      <header className="flex items-center gap-2 mb-2.5">
        <div
          className={cn(
            "h-7 w-7 rounded-lg flex items-center justify-center shrink-0",
            complete ? "bg-earning/10 text-earning" : "bg-primary/10 text-primary",
          )}
        >
          {complete ? <CheckCircle2 className="h-3.5 w-3.5" /> : icon}
        </div>
        <h3 className="flex-1 text-[12.5px] font-semibold text-foreground">{title}</h3>
        {action}
      </header>
      <div>{children}</div>
    </section>
  );
}

function EditButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:opacity-80"
    >
      <Pencil className="h-3 w-3" /> Editar
    </button>
  );
}

function CancelButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground"
    >
      <X className="h-3 w-3" /> Cancelar
    </button>
  );
}
