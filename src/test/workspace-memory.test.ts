import { describe, it, expect, beforeEach } from "vitest";
import {
  readWorkspaceMemory,
  rememberCompany,
  rememberRoute,
  isRestorableRoute,
  clearWorkspaceMemory,
  clearAllWorkspaceMemory,
} from "@/lib/session/workspace-memory";
import {
  readSelectedCompanyForTab,
  writeSelectedCompanyForTab,
} from "@/lib/auth-session";

const USER = "user-1";
const QUALITY = "company-quality";
const MYSTAFF = "company-mystaff";

describe("workspace memory (device-scoped)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it("remembers the last company used on this device", () => {
    rememberCompany(USER, QUALITY);
    expect(readWorkspaceMemory(USER).companyId).toBe(QUALITY);
  });

  it("survives a new tab: tab storage empty falls back to device memory", () => {
    writeSelectedCompanyForTab(USER, QUALITY);
    window.sessionStorage.clear(); // new tab / cold app start
    expect(readSelectedCompanyForTab(USER)).toBe(QUALITY);
  });

  it("a manual switch becomes the new remembered company", () => {
    writeSelectedCompanyForTab(USER, QUALITY);
    writeSelectedCompanyForTab(USER, MYSTAFF);
    window.sessionStorage.clear();
    expect(readSelectedCompanyForTab(USER)).toBe(MYSTAFF);
  });

  it("switching company drops the remembered route (tenant-scoped)", () => {
    rememberCompany(USER, QUALITY);
    rememberRoute(USER, "/app/shifts/427");
    expect(readWorkspaceMemory(USER).route).toBe("/app/shifts/427");
    rememberCompany(USER, MYSTAFF);
    expect(readWorkspaceMemory(USER).route).toBeNull();
  });

  it("only remembers safe operational routes", () => {
    expect(isRestorableRoute("/app/shifts/427")).toBe(true);
    expect(isRestorableRoute("/portal/my-shifts")).toBe(true);
    expect(isRestorableRoute("/auth")).toBe(false);
    expect(isRestorableRoute("/")).toBe(false);
    rememberRoute(USER, "/auth");
    expect(readWorkspaceMemory(USER).route).toBeNull();
  });

  it("memory is per user and clearable on security events", () => {
    rememberCompany(USER, QUALITY);
    rememberCompany("user-2", MYSTAFF);
    clearWorkspaceMemory(USER);
    expect(readWorkspaceMemory(USER).companyId).toBeNull();
    expect(readWorkspaceMemory("user-2").companyId).toBe(MYSTAFF);
    clearAllWorkspaceMemory();
    expect(readWorkspaceMemory("user-2").companyId).toBeNull();
  });
});
