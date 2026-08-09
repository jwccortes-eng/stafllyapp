/**
 * Smart Service Intake — carril canónico.
 *
 * import_batches → raw_schedule_import_rows → normalized_schedule_rows
 *   → bandeja de revisión → scheduled_shifts (publication_status='draft')
 *
 * No hay modelo paralelo de jobs, ni segundo importador, ni segundo
 * draft engine.
 */

export * from "./candidate";
export * from "./entity-resolution";
export * from "./duplicate";
export * from "./extraction-contract";
export * from "./batch";
export * from "./create-draft-service";
export * from "./schedule-adapter";
export * from "./text-parser";
export * from "./text-intake";
export * from "./visual-extraction";
export * from "./visual-intake";
export * from "./audio-extraction";
export * from "./audio-intake";
export * from "./recovery";

export * from "./telemetry";
export * from "./dictionary";
export * from "./dictionary-store";
export * from "./entity-linking";
export * from "./assisted-creation";
export * from "./entity-metrics";

