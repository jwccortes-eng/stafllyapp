/**
 * Parse Connecteam HTML-table-based "XLS" exports.
 * These files are actually HTML with a <table> wrapped in Office XML.
 */

export interface ConnecteamParsedRecord {
  first_name: string;
  last_name: string;
  email: string;
  phone_number: string;
  country_code: string;
  gender: string;
  birthday: string;
  address: string;
  county: string;
  start_date: string;
  end_date: string;
  english_level: string;
  employee_role: string;
  qualify: string;
  recommended_by: string;
  direct_manager: string;
  has_car: string;
  driver_licence: string;
  kiosk_code: string;
  date_added: string;
  last_login: string;
  connecteam_employee_id: string;
  onboarding_status: string;
  added_via: string;
  added_by: string;
  groups: string;
  tags: string;
  // Archived-specific
  archived_at: string;
  archived_by: string;
  // Admin-specific
  access_level: string;
  managed_groups: string;
  permissions: string;
  admin_tab: string;
  accepted: string;
  // Raw metadata
  _raw: Record<string, string>;
}

export const HEADER_MAP: Record<string, keyof ConnecteamParsedRecord> = {
  "first name": "first_name",
  "last name": "last_name",
  "email": "email",
  "mobile phone": "phone_number",
  "phone": "phone_number",
  "country code": "country_code",
  "gender": "gender",
  "birthday": "birthday",
  "address (street, apt).": "address",
  "address (street, apt.)": "address",
  "condado": "county",
  "start date": "start_date",
  "end date": "end_date",
  "english level": "english_level",
  "role": "employee_role",
  "qualify": "qualify",
  "recommended by?": "recommended_by",
  "direct manager": "direct_manager",
  "you have car?": "has_car",
  "driver licence": "driver_licence",
  "kiosk code": "kiosk_code",
  "date added": "date_added",
  "last login": "last_login",
  "connecteam user id": "connecteam_employee_id",
  "onboarding status": "onboarding_status",
  "added via": "added_via",
  "added by": "added_by",
  "groups": "groups",
  "tags": "tags",
  "archived at": "archived_at",
  "archived by": "archived_by",
  // Admin fields
  "access level": "access_level",
  "managed groups": "managed_groups",
  "permissions": "permissions",
  "admin tab": "admin_tab",
  "accepted": "accepted",
};

function normalizeHeaderKey(h: string): string {
  return h.toLowerCase().replace(/[_\s-]+/g, " ").replace(/[^\w\s().?]/g, "").trim();
}

/**
 * Parse an HTML-table XLS file into structured records.
 */
export function parseConnecteamHtmlXls(htmlContent: string): ConnecteamParsedRecord[] {
  // Extract headers from <th> tags
  const headerRegex = /<th[^>]*>(.*?)<\/th>/gi;
  const headers: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = headerRegex.exec(htmlContent)) !== null) {
    headers.push(stripHtml(m[1]).trim());
  }

  if (headers.length === 0) return [];

  // Map header indices to field keys
  const headerKeys: (keyof ConnecteamParsedRecord | null)[] = headers.map(h => {
    const norm = normalizeHeaderKey(h);
    return HEADER_MAP[norm] ?? null;
  });

  // Extract rows from <tbody>
  const tbodyMatch = htmlContent.match(/<tbody>([\s\S]*?)<\/tbody>/i);
  const rowsHtml = tbodyMatch ? tbodyMatch[1] : htmlContent;

  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const results: ConnecteamParsedRecord[] = [];
  let skipFirst = !tbodyMatch; // Skip first row if no thead/tbody separation

  while ((m = rowRegex.exec(rowsHtml)) !== null) {
    if (skipFirst) { skipFirst = false; continue; }

    const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    const cells: string[] = [];
    let cm: RegExpExecArray | null;
    while ((cm = cellRegex.exec(m[1])) !== null) {
      cells.push(stripHtml(cm[1]).trim());
    }

    if (cells.length < 2) continue;

    const raw: Record<string, string> = {};
    headers.forEach((h, i) => { raw[h] = cells[i] ?? ""; });

    const record = createEmptyRecord();
    record._raw = raw;

    headerKeys.forEach((key, i) => {
      if (key && key !== "_raw") {
        const val = (cells[i] ?? "").trim();
        if (val && !/^[\s,]*$/.test(val)) {
          (record as any)[key] = val;
        }
      }
    });

    // Clean groups/tags — remove empty placeholders like ", , ,"
    record.groups = cleanList(record.groups);
    record.tags = cleanList(record.tags);

    // Normalize email
    if (record.email) record.email = record.email.toLowerCase().trim();

    // Normalize names
    record.first_name = titleCase(record.first_name);
    record.last_name = titleCase(record.last_name);

    if (!record.first_name && !record.last_name) continue;

    results.push(record);
  }

  return results;
}

function createEmptyRecord(): ConnecteamParsedRecord {
  return {
    first_name: "", last_name: "", email: "", phone_number: "",
    country_code: "", gender: "", birthday: "", address: "",
    county: "", start_date: "", end_date: "", english_level: "",
    employee_role: "", qualify: "", recommended_by: "", direct_manager: "",
    has_car: "", driver_licence: "", kiosk_code: "", date_added: "",
    last_login: "", connecteam_employee_id: "", onboarding_status: "",
    added_via: "", added_by: "", groups: "", tags: "",
    archived_at: "", archived_by: "",
    access_level: "", managed_groups: "", permissions: "",
    admin_tab: "", accepted: "",
    _raw: {},
  };
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

function cleanList(s: string): string {
  if (!s) return "";
  return s.split(",").map(x => x.trim()).filter(Boolean).join(", ");
}

function titleCase(s: string): string {
  if (!s) return "";
  return s.trim().split(/\s+/).map(w =>
    w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
  ).join(" ");
}

/**
 * Normalize a phone number to 10-digit US format.
 */
export function normalizePhone(phone: string, countryCode?: string): string {
  if (!phone) return "";
  const digits = phone.replace(/[^\d]/g, "");
  // If starts with country code 1 and has 11 digits
  const d = digits.startsWith("1") && digits.length === 11 ? digits.slice(1) : digits;
  return d.length >= 7 ? d.slice(-10) : "";
}

/**
 * Detect file type from content: 'active', 'archived', or 'admin'
 */
export function detectFileType(htmlContent: string): "active" | "archived" | "admin" | "unknown" {
  const lower = htmlContent.toLowerCase();
  if (lower.includes("access level") || lower.includes("managed groups") || lower.includes("permissions")) {
    return "admin";
  }
  if (lower.includes("archived at") || lower.includes("archived by")) {
    return "archived";
  }
  return "active";
}
