// English (app mode) dictionary. Keys are dot-namespaced.
// Add keys here as we convert UI surfaces. Keep values short and operator-grade.
const en_app = {
  // ── Common actions ───────────────────────────────────────────────
  "common.save": "Save",
  "common.cancel": "Cancel",
  "common.confirm": "Confirm",
  "common.edit": "Edit",
  "common.delete": "Delete",
  "common.back": "Back",
  "common.next": "Next",
  "common.close": "Close",
  "common.loading": "Loading…",
  "common.search": "Search",
  "common.retry": "Retry",
  "common.yes": "Yes",
  "common.no": "No",

  // ── Generic toasts ───────────────────────────────────────────────
  "toast.saved": "Changes saved",
  "toast.error": "Something went wrong",
  "toast.copied": "Copied to clipboard",

  // ── Generic empty states ─────────────────────────────────────────
  "empty.title": "Nothing here yet",
  "empty.subtitle": "There's no data to show.",

  // ── Admin sidebar — section groups ───────────────────────────────
  "sidebar.section.daily_operations": "Daily Operations",
  "sidebar.section.team": "Team",
  "sidebar.section.clients_locations": "Clients & Locations",
  "sidebar.section.payroll_finance": "Payroll & Finance",
  "sidebar.section.reports": "Reports",
  "sidebar.section.communication": "Communication",
  "sidebar.section.configuration": "Configuration",

  // ── Portal bottom nav ────────────────────────────────────────────
  "portal.nav.home": "Home",
  "portal.nav.shifts": "Shifts",
  "portal.nav.clock": "Clock",
  "portal.nav.more": "More",
  "portal.nav.more_aria": "More options",

  // ── Settings / Language ──────────────────────────────────────────
  "settings.language.title": "Language",
  "settings.language.description": "Choose the language for the app interface. Operator data is not translated.",
  "settings.language.english": "English",
  "settings.language.spanish": "Spanish",
};

export default en_app;
export type AppDictKey = keyof typeof en_app;
