/**
 * ELDM Fase 1C — Worker Recommendation Layer.
 * Punto único de entrada:
 *
 *   import { getWorkerRecommendations } from "@/lib/eldm-recommendation";
 */
export * from "./types";
export * from "./eligibility";
export * from "./engine";
export * from "./feedback";
export { loadSignalsByPerson } from "./load";
