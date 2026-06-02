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
    meeting_point: "Entrada de servicio",
    meeting_time: "07:45",
  },
  client: { name: "JKitchen" },
  compensation: { pay_type: "hourly", hourly_rate: 22 },
  myAssignment: { status: "pending", has_clock_in: false, has_clock_out: false },
};

describe("<SmartWorkCard /> — base behavior", () => {
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

describe("<SmartWorkCard /> — UX polish (A–F)", () => {
  // A. Subtítulo duplicado
  it("A. no renderiza subtítulo cuando coincide con el título", () => {
    // Sin title manual real → buildShiftCardTitle cae a "JKitchen · Mesero",
    // que es idéntico al subtitleCandidate → subtitleLine === null.
    const vm = buildSmartWorkCardViewModel(
      {
        ...baseInput,
        shift: { ...baseInput.shift, title: "#0250 TURNO" },
      },
      { audience: "worker", density: "standard" },
    );
    expect(vm.identity.title).toBe("JKitchen · Mesero");
    expect(vm.identity.subtitleLine).toBeNull();
    const { container } = render(<SmartWorkCard vm={vm} />);
    // Solo debe haber UNA aparición del texto "JKitchen · Mesero" (el título).
    const matches = container.querySelectorAll(
      "h3, p",
    );
    const occurrences = Array.from(matches).filter((n) =>
      (n.textContent ?? "").trim() === "JKitchen · Mesero",
    );
    expect(occurrences.length).toBe(1);
  });

  it("A.bis: cuando el título manual difiere, sí muestra subtítulo cliente · categoría", () => {
    const vm = buildSmartWorkCardViewModel(
      {
        ...baseInput,
        shift: { ...baseInput.shift, title: "Evento de gala sábado" },
      },
      { audience: "worker", density: "standard" },
    );
    expect(vm.identity.subtitleLine).toBe("JKitchen · Mesero");
    render(<SmartWorkCard vm={vm} />);
    expect(screen.getByText("Evento de gala sábado")).toBeInTheDocument();
    expect(screen.getByText("JKitchen · Mesero")).toBeInTheDocument();
  });

  // B. Pay block sin duplicación
  it("B. pay block: una sola etiqueta + amount sin sufijo 'estimado'", () => {
    const vm = buildSmartWorkCardViewModel(baseInput, {
      audience: "worker",
      density: "standard",
    });
    expect(vm.pay.amountLabel).toBe("$176.00");
    expect(vm.pay.amountLabel).not.toMatch(/estimado/i);
    render(<SmartWorkCard vm={vm} />);
    const payBlock = screen.getByTestId("pay-block");
    // No debe duplicarse: el formato viejo era "$176.00 estimado" + chip ESTIMADO.
    expect(payBlock.textContent).not.toMatch(/\$176\.00\s+estimado/i);
    expect(payBlock.textContent).toContain("$176.00");
    expect(payBlock.textContent).toContain("Estimado");
  });

  // C. Compact sin duración
  it("C. compact no muestra '8 h estimadas'", () => {
    const vm = buildSmartWorkCardViewModel(baseInput, {
      audience: "worker",
      density: "compact",
    });
    render(<SmartWorkCard vm={vm} />);
    expect(screen.queryByText(/h estimadas/)).not.toBeInTheDocument();
  });

  it("C.bis: standard sí muestra la duración", () => {
    const vm = buildSmartWorkCardViewModel(baseInput, {
      audience: "worker",
      density: "standard",
    });
    render(<SmartWorkCard vm={vm} />);
    expect(screen.getByText(/h estimadas/)).toBeInTheDocument();
  });

  // D. Coverage
  it("D. admin compact muestra mini-chip 1/3 cuando falta personal", () => {
    const vm = buildSmartWorkCardViewModel(
      { ...baseInput, coverage: { required: 3, confirmed: 1, pending: 2 } },
      { audience: "admin", density: "compact" },
    );
    expect(vm.coverage?.shortLabel).toBe("1/3");
    expect(vm.coverage?.label).toBe("1 / 3 confirmados");
    render(<SmartWorkCard vm={vm} />);
    expect(screen.getByTestId("coverage-chip")).toHaveTextContent("1/3");
  });

  it("D.bis: admin standard muestra la línea completa de cobertura", () => {
    const vm = buildSmartWorkCardViewModel(
      { ...baseInput, coverage: { required: 3, confirmed: 1, pending: 2 } },
      { audience: "admin", density: "standard" },
    );
    render(<SmartWorkCard vm={vm} />);
    expect(screen.getByTestId("coverage-line")).toHaveTextContent(
      "1 / 3 confirmados",
    );
  });

  it("D.ter: worker card no incluye coverage", () => {
    const vm = buildSmartWorkCardViewModel(
      { ...baseInput, coverage: { required: 3, confirmed: 1, pending: 2 } },
      { audience: "worker", density: "standard" },
    );
    expect(vm.coverage).toBeNull();
  });

  // E. Meeting fusion
  it("E. meetingLabel fusiona meeting_time + meeting_point", () => {
    const vm = buildSmartWorkCardViewModel(baseInput, {
      audience: "worker",
      density: "full",
    });
    expect(vm.timing.meetingLabel).toBe("Encuentro 7:45 AM · Entrada de servicio");
    // Y location.meetingPoint se limpia para no duplicar info.
    expect(vm.location.meetingPoint).toBeNull();
  });

  it("E.bis: si solo hay meeting_point, se muestra como 'Encuentro: ...'", () => {
    const vm = buildSmartWorkCardViewModel(
      {
        ...baseInput,
        shift: { ...baseInput.shift, meeting_time: undefined },
      },
      { audience: "worker", density: "full" },
    );
    expect(vm.timing.meetingLabel).toBe("Encuentro: Entrada de servicio");
  });

  // F. Pending accept visual
  it("F. pending accept aplica borde ámbar (border-warning/40)", () => {
    const vm = buildSmartWorkCardViewModel(baseInput, {
      audience: "worker",
      density: "standard",
    });
    expect(vm.status.tone).toBe("warn");
    expect(vm.nextAction.kind).toBe("accept");
    const { container } = render(<SmartWorkCard vm={vm} />);
    const article = container.querySelector("article");
    expect(article?.getAttribute("data-pending-accept")).toBe("true");
    expect(article?.className).toMatch(/border-warning\/40/);
  });

  it("F.bis: estado confirmado NO aplica borde ámbar", () => {
    const vm = buildSmartWorkCardViewModel(
      {
        ...baseInput,
        myAssignment: { status: "confirmed", has_clock_in: false, has_clock_out: false },
      },
      { audience: "worker", density: "standard" },
    );
    const { container } = render(<SmartWorkCard vm={vm} />);
    const article = container.querySelector("article");
    expect(article?.getAttribute("data-pending-accept")).toBeNull();
  });
});
