/**
 * SmartWorkCardSandbox — Dev preview route for <SmartWorkCard />.
 *
 * Route: /app/smart-work-card-sandbox
 *
 * 100% read-only. Renders fixtures through `buildSmartWorkCardViewModel`
 * for every (audience × density) combination. No queries, no Supabase,
 * no writes. Safe to remove or hide behind a flag at any time.
 */

import { useMemo } from "react";
import {
  buildSmartWorkCardViewModel,
  type SmartWorkCardInput,
  type SmartCardAudience,
  type SmartCardDensity,
} from "@/lib/shifts/smart-work-card";
import { SmartWorkCard } from "@/components/shifts/smart/SmartWorkCard";

// ── Fixtures ────────────────────────────────────────────────────────────

const fixtureWorkerConfirmed: SmartWorkCardInput = {
  shift: {
    id: "fx-1",
    title: "#0250 TURNO",
    shift_code: "0250",
    date: "2026-06-02",
    start_time: "08:00",
    end_time: "16:00",
    category: "Mesero",
    status: "scheduled",
    publication_status: "published",
    job_site_address: "150 Kent Ave, Brooklyn, NY",
    meeting_point: "Entrada de servicio",
    meeting_time: "07:45",
  },
  client: { name: "JKitchen" },
  location: {
    name: "JKitchen Williamsburg",
    address: "150 Kent Ave, Brooklyn, NY",
    city: "Brooklyn",
    state: "NY",
  },
  myAssignment: { status: "confirmed", has_clock_in: false, has_clock_out: false },
  compensation: { pay_type: "hourly", hourly_rate: 22 },
  uniform: {
    instructions: "Camisa blanca, pantalón negro, zapatos cerrados.",
    photo_url: null,
    source: "client",
  },
};

const fixtureWorkerPending: SmartWorkCardInput = {
  ...fixtureWorkerConfirmed,
  shift: { ...fixtureWorkerConfirmed.shift, id: "fx-2", title: "Evento Sábado" },
  myAssignment: { status: "pending", has_clock_in: false, has_clock_out: false },
};

const fixtureWorkerInProgress: SmartWorkCardInput = {
  ...fixtureWorkerConfirmed,
  shift: { ...fixtureWorkerConfirmed.shift, id: "fx-3" },
  myAssignment: { status: "confirmed", has_clock_in: true, has_clock_out: false },
};

const fixtureAdminGap: SmartWorkCardInput = {
  shift: {
    id: "fx-4",
    title: "#0258 Cocina nocturna",
    shift_code: "0258",
    date: "2026-06-02",
    start_time: "18:00",
    end_time: "23:30",
    category: "Cocina",
    status: "scheduled",
    publication_status: "published",
    job_site_address: null,
    meeting_point: "Lobby principal",
  },
  client: { name: "Hamaspik" },
  location: null,
  coverage: { required: 3, confirmed: 1, pending: 2 },
  compensation: { pay_type: "daily", daily_rate: 180 },
  uniform: { instructions: null, photo_url: null, source: null },
};

const fixtureAdminDraft: SmartWorkCardInput = {
  ...fixtureAdminGap,
  shift: {
    ...fixtureAdminGap.shift,
    id: "fx-5",
    title: "Turno borrador",
    publication_status: "draft",
  },
  coverage: { required: 4, confirmed: 0, pending: 0 },
};

// ── Helpers ─────────────────────────────────────────────────────────────

const DENSITIES: SmartCardDensity[] = ["compact", "standard", "full"];

function Column({
  title,
  subtitle,
  audience,
  input,
}: {
  title: string;
  subtitle: string;
  audience: SmartCardAudience;
  input: SmartWorkCardInput;
}) {
  const vms = useMemo(
    () =>
      DENSITIES.map((d) =>
        buildSmartWorkCardViewModel(input, { audience, density: d }),
      ),
    [audience, input],
  );

  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        <p className="text-[11px] text-muted-foreground">{subtitle}</p>
      </header>
      {vms.map((vm, i) => (
        <div key={DENSITIES[i]} className="space-y-1.5">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {DENSITIES[i]}
          </p>
          <SmartWorkCard vm={vm} />
        </div>
      ))}
    </section>
  );
}

export default function SmartWorkCardSandbox() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold text-foreground">
          Smart Work Card · Sandbox
        </h1>
        <p className="text-[12px] text-muted-foreground">
          Vista de previsualización. Read-only, sin queries ni writes. No
          reemplaza calendario, Shift Operations ni Worker Portal.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Column
          title="Worker · Confirmado"
          subtitle="Aceptado, falta marcar entrada."
          audience="worker"
          input={fixtureWorkerConfirmed}
        />
        <Column
          title="Worker · Por aceptar"
          subtitle="Publicado, esperando confirmación."
          audience="worker"
          input={fixtureWorkerPending}
        />
        <Column
          title="Worker · En curso"
          subtitle="Marcó entrada, falta salida."
          audience="worker"
          input={fixtureWorkerInProgress}
        />
        <Column
          title="Admin · Falta personal"
          subtitle="Coverage gap, dirección manual."
          audience="admin"
          input={fixtureAdminGap}
        />
        <Column
          title="Admin · Borrador"
          subtitle="Sin asignaciones, pendiente publicar."
          audience="admin"
          input={fixtureAdminDraft}
        />
      </div>
    </div>
  );
}
