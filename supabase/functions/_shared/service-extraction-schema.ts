/**
 * Contrato ÚNICO de extracción de Servicios del Smart Service Intake.
 *
 * Lo comparten todas las fuentes no tabulares (imagen, PDF, audio). No existe
 * un segundo contrato: si una fuente necesita un campo nuevo, se agrega aquí.
 *
 * SUGGESTION-ONLY: nada de lo que devuelve este esquema es un hecho. Todo
 * pasa por la bandeja compartida y por revisión humana antes de crear drafts.
 */

export const SERVICE_EXTRACTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    page_count: { type: ["integer", "null"] },
    notes: { type: ["string", "null"] },
    services: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          service_date: {
            type: ["string", "null"],
            description:
              "Date exactly as stated ('2026-10-13', 'Oct 13', 'mañana', 'el martes'). Null if absent.",
          },
          start_time: { type: ["string", "null"] },
          end_time: { type: ["string", "null"] },
          service_type: { type: ["string", "null"] },
          client_name: { type: ["string", "null"] },
          venue_name: { type: ["string", "null"] },
          location_text: { type: ["string", "null"] },
          requested_workers: { type: ["integer", "null"] },
          roles: { type: ["array", "null"], items: { type: "string" } },
          notes: { type: ["string", "null"] },
          source_excerpt: { type: ["string", "null"] },
          page_number: { type: ["integer", "null"] },
          region_label: {
            type: ["string", "null"],
            description:
              "Where it was found: layout region for visual sources, spoken segment for audio.",
          },
          color_group: {
            type: ["string", "null"],
            description: "Colour of the block, if any. Never a source of identity. Null for audio.",
          },
          extraction_notes: { type: ["string", "null"] },
          confidence: {
            type: "object",
            additionalProperties: false,
            properties: {
              date: { type: ["number", "null"] },
              venue: { type: ["number", "null"] },
              service_type: { type: ["number", "null"] },
              start_time: { type: ["number", "null"] },
              end_time: { type: ["number", "null"] },
              client: { type: ["number", "null"] },
              workers: { type: ["number", "null"] },
              location: { type: ["number", "null"] },
            },
            required: [
              "date",
              "venue",
              "service_type",
              "start_time",
              "end_time",
              "client",
              "workers",
              "location",
            ],
          },
        },
        required: [
          "service_date",
          "start_time",
          "end_time",
          "service_type",
          "client_name",
          "venue_name",
          "location_text",
          "requested_workers",
          "roles",
          "notes",
          "source_excerpt",
          "page_number",
          "region_label",
          "color_group",
          "extraction_notes",
          "confidence",
        ],
      },
    },
    unresolved: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          detected_text: { type: ["string", "null"] },
          reason: { type: ["string", "null"] },
          suggestion: { type: ["string", "null"] },
          page_number: { type: ["integer", "null"] },
          region_label: { type: ["string", "null"] },
        },
        required: ["detected_text", "reason", "suggestion", "page_number", "region_label"],
      },
    },
  },
  required: ["page_count", "notes", "services", "unresolved"],
} as const;
