import { describe, it, expect } from "vitest";
import {
  buildPortalModuleOverrides,
  resolvePortalModuleEnabled,
  resolveEnabledPortalModules,
} from "@/lib/portal/portal-modules";

describe("portal module canonical resolution", () => {
  it("sin filas → defaults canónicos", () => {
    const o = buildPortalModuleOverrides([]);
    expect(resolvePortalModuleEnabled("my_shifts", o)).toBe(true);
    expect(resolvePortalModuleEnabled("my_clock", o)).toBe(true);
    expect(resolvePortalModuleEnabled("my_chat", o)).toBe(false);
  });

  it("config parcial no deshabilita módulos ausentes (caso Carlos)", () => {
    const o = buildPortalModuleOverrides([
      { module: "my_announcements", enabled: true },
      { module: "my_chat", enabled: true },
      { module: "my_profile", enabled: false },
    ]);
    expect(resolvePortalModuleEnabled("my_shifts", o)).toBe(true);
    expect(resolvePortalModuleEnabled("my_clock", o)).toBe(true);
    expect(resolvePortalModuleEnabled("my_announcements", o)).toBe(true);
    expect(resolvePortalModuleEnabled("my_profile", o)).toBe(false);
  });

  it("override explícito false bloquea; quitarlo vuelve al default", () => {
    const blocked = buildPortalModuleOverrides([{ module: "my_clock", enabled: false }]);
    expect(resolvePortalModuleEnabled("my_clock", blocked)).toBe(false);
    expect(resolvePortalModuleEnabled("my_clock", buildPortalModuleOverrides([]))).toBe(true);
  });

  it("home/profile siempre visibles", () => {
    const o = buildPortalModuleOverrides([{ module: "home", enabled: false }]);
    expect(resolvePortalModuleEnabled("home", o)).toBe(true);
  });

  it("config completa con overrides es determinista", () => {
    const o = buildPortalModuleOverrides([
      { module: "my_shifts", enabled: true },
      { module: "my_clock", enabled: false },
      { module: "my_payments", enabled: true },
    ]);
    const set = resolveEnabledPortalModules(o);
    expect(set.has("my_shifts")).toBe(true);
    expect(set.has("my_clock")).toBe(false);
    expect(set.has("my_payments")).toBe(true);
  });
});
