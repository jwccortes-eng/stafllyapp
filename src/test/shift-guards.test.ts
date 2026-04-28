import { describe, it, expect } from "vitest";
import {
  isDraftShift,
  isPublishedShift,
  isCancelledOrArchivedShift,
  isDraftReservation,
  isActiveAssignment,
  canNotifyShift,
  isVisibleToWorkerPortal,
} from "@/lib/shifts/shift-guards";

const draft = { publication_status: "draft" as const, status: "open" };
const published = { publication_status: "published" as const, status: "open" };
const cancelled = { publication_status: "cancelled" as const, status: "cancelled" };
const archived = { publication_status: "archived" as const, status: "open" };
const softDeleted = { publication_status: "published" as const, status: "open", deleted_at: "2026-01-01" };
const legacy = { status: "open" }; // missing publication_status → published

const activeAssignment = { status: "assigned", response_status: "accepted", is_draft_reservation: false };
const draftReservation = { status: "assigned", response_status: "pending", is_draft_reservation: true };
const rejectedAssignment = { status: "assigned", response_status: "rejected" };
const removedAssignment = { status: "removed" };

describe("shift-guards: lifecycle predicates", () => {
  it("isDraftShift detects draft", () => {
    expect(isDraftShift(draft)).toBe(true);
    expect(isDraftShift(published)).toBe(false);
    expect(isDraftShift(legacy)).toBe(false);
  });

  it("isPublishedShift treats missing column as published", () => {
    expect(isPublishedShift(published)).toBe(true);
    expect(isPublishedShift(legacy)).toBe(true);
    expect(isPublishedShift(draft)).toBe(false);
  });

  it("isCancelledOrArchivedShift covers cancel/archive/soft-delete", () => {
    expect(isCancelledOrArchivedShift(cancelled)).toBe(true);
    expect(isCancelledOrArchivedShift(archived)).toBe(true);
    expect(isCancelledOrArchivedShift(softDeleted)).toBe(true);
    expect(isCancelledOrArchivedShift(published)).toBe(false);
  });
});

describe("shift-guards: assignments", () => {
  it("isDraftReservation flags reservations only", () => {
    expect(isDraftReservation(draftReservation)).toBe(true);
    expect(isDraftReservation(activeAssignment)).toBe(false);
    expect(isDraftReservation(null)).toBe(false);
  });

  it("isActiveAssignment excludes drafts/rejected/removed", () => {
    expect(isActiveAssignment(activeAssignment)).toBe(true);
    expect(isActiveAssignment(draftReservation)).toBe(false);
    expect(isActiveAssignment(rejectedAssignment)).toBe(false);
    expect(isActiveAssignment(removedAssignment)).toBe(false);
    expect(isActiveAssignment(null)).toBe(false);
  });
});

describe("shift-guards: notifications & portal", () => {
  it("canNotifyShift only allows published, healthy shifts", () => {
    expect(canNotifyShift(published)).toBe(true);
    expect(canNotifyShift(legacy)).toBe(true);
    expect(canNotifyShift(draft)).toBe(false);
    expect(canNotifyShift(cancelled)).toBe(false);
    expect(canNotifyShift(archived)).toBe(false);
    expect(canNotifyShift(softDeleted)).toBe(false);
  });

  it("isVisibleToWorkerPortal requires published shift + active assignment", () => {
    expect(isVisibleToWorkerPortal(published, activeAssignment)).toBe(true);
    // draft shift hides everything
    expect(isVisibleToWorkerPortal(draft, activeAssignment)).toBe(false);
    // draft reservation is invisible even on a published shift
    expect(isVisibleToWorkerPortal(published, draftReservation)).toBe(false);
    // cancelled / archived / soft-deleted hidden
    expect(isVisibleToWorkerPortal(cancelled, activeAssignment)).toBe(false);
    expect(isVisibleToWorkerPortal(archived, activeAssignment)).toBe(false);
    expect(isVisibleToWorkerPortal(softDeleted, activeAssignment)).toBe(false);
    // rejected/removed assignments hidden
    expect(isVisibleToWorkerPortal(published, rejectedAssignment)).toBe(false);
    expect(isVisibleToWorkerPortal(published, removedAssignment)).toBe(false);
    // missing assignment hidden
    expect(isVisibleToWorkerPortal(published, null)).toBe(false);
  });
});
