/**
 * F1.2 — structural anti-queue tests.
 *
 * These tests FAIL the build if anyone tries to turn the observation ledger
 * into a delivery queue: delivery columns, provider SDKs/strings, retry
 * workers/jobs or "pending to send" queries.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

const CI_DIR = "src/lib/change-intelligence";
const FN_DIRS = ["supabase/functions/ci-observe", "supabase/functions/ci-observation-maintenance"];

function collect(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? collect(full) : [full];
  });
}

const files = [...collect(CI_DIR), ...FN_DIRS.flatMap(collect)].filter((f) => /\.(ts|tsx)$/.test(f) && !f.includes("__tests__"));

/** Strip comments and string literals used to *forbid* something. */
function executableLines(source: string): string {
  return source
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      return !t.startsWith("*") && !t.startsWith("//") && !t.startsWith("/*");
    })
    .join("\n");
}

describe("F1.2 — anti-queue structural guarantees", () => {
  it("collected the change-intelligence surface", () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it("no delivery-semantics column is ever written", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const code = executableLines(readFileSync(file, "utf8"));
      for (const column of ["sent_at", "delivered_at", "retry_count", "delivery_status", "recipient_id"]) {
        // Allowed only inside the explicit rejection list of the edge function.
        const matches = [...code.matchAll(new RegExp(column, "g"))];
        if (matches.length === 0) continue;
        const isRejectionList = /deliveryKeys\s*=/.test(code) && file.includes("ci-observe");
        if (!isRejectionList) offenders.push(`${file}:${column}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("no delivery provider is imported or referenced", () => {
    const offenders: string[] = [];
    const providers = ["twilio", "resend", "sendgrid", "firebase-admin", "expo-server-sdk", "apns", "onesignal", "@sendgrid"];
    for (const file of files) {
      const code = executableLines(readFileSync(file, "utf8")).toLowerCase();
      for (const provider of providers) {
        if (code.includes(provider)) offenders.push(`${file}:${provider}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("no worker, job or retry loop exists", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const code = executableLines(readFileSync(file, "utf8"));
      for (const pattern of [/setInterval\s*\(/, /retryCount/, /maxRetries/, /backoff/i, /cron\.schedule/, /new Worker\(/]) {
        if (pattern.test(code)) offenders.push(`${file}:${pattern}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("no query looks for rows pending to be sent", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const code = executableLines(readFileSync(file, "utf8"));
      for (const pattern of [/is\(\s*["']sent_at["']/, /pending_send/, /unsent/, /queue_status/, /\.eq\(\s*["']delivery_status["']/]) {
        if (pattern.test(code)) offenders.push(`${file}:${pattern}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the ingest function forces observation_only and rejects false", () => {
    const source = readFileSync("supabase/functions/ci-observe/index.ts", "utf8");
    expect(source).toContain("observation_only: true as const");
    expect(source).toContain("observation_only_must_be_true");
  });

  it("the durable sink never retries", () => {
    const source = executableLines(
      readFileSync("src/lib/change-intelligence/observation/durable-sink.ts", "utf8"),
    );
    expect(/retry/i.test(source)).toBe(false);
    expect(source).toContain("ci-observe");
  });
});
