import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SmartWorkCard } from "@/components/shifts/smart/SmartWorkCard";
import {
  buildSmartWorkCardViewModel,
  type SmartWorkCardInput,
} from "@/lib/shifts/smart-work-card";

const baseInput: SmartWorkCardInput = {
  shift: {
    id: "s1",
    title: "#0250 TURNO",
    shift_code: "0250",
    date: "2026-06-02",
    start_time: "08:00",
    end_time: "16:00",
    category: "Mesero",
    status: "scheduled",
    publication_status: "published",
    job_site_address: "150 Kent Ave",
  },
  client: { name: "JKitchen" },
  compensation: { pay_type: "hourly", hourly_rate: 22 },
  myAssignment: { status: "pending", has_clock_in: false, has_clock_out: false },
};

describe("<SmartWorkCard />", () => {
  it("worker standard: shows timing, action 'Aceptar', estimated pay label, Trabajo # secondary", () => {
    const vm = buildSmartWorkCardViewModel(baseInput, {
      audience: "worker",
      density: "standard",
    });
    render(<SmartWorkCard vm={vm} />);
    expect(screen.getByText("8:00 AM")).toBeInTheDocument();
    expect(screen.getByText(/Termina aprox/)).toBeInTheDocument();
    expect(screen.getByText("Aceptar")).toBeInTheDocument();
    expect(screen.getByText(/Trabajo.*0250/)).toBeInTheDocument();
    // Pay block only in standard/full per ViewModel
    expect(screen.getByText("Estimado")).toBeInTheDocument();
  });

  it("admin compact: shows only identity/timing/status/action, no pay block", () => {
    const vm = buildSmartWorkCardViewModel(
      { ...baseInput, coverage: { required: 2, confirmed: 1, pending: 1 } },
      { audience: "admin", density: "compact" },
    );
    render(<SmartWorkCard vm={vm} />);
    expect(screen.queryByText("Estimado")).not.toBeInTheDocument();
    expect(screen.queryByText(/Cómo llegar/)).not.toBeInTheDocument();
    // Either "Operar turno" o "Asignar workers" según riesgo
    expect(
      screen.queryByText("Operar turno") || screen.queryByText("Asignar workers"),
    ).toBeTruthy();
  });

  it("missing clock-out shows 'Pago final pendiente' instead of an amount", () => {
    const vm = buildSmartWorkCardViewModel(
      {
        ...baseInput,
        myAssignment: { status: "confirmed", has_clock_in: true, has_clock_out: false },
      },
      { audience: "worker", density: "full" },
    );
    render(<SmartWorkCard vm={vm} />);
    expect(screen.getByText("Pago final pendiente")).toBeInTheDocument();
  });
});
