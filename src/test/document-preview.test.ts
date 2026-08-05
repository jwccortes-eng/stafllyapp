import { describe, expect, it } from "vitest";
import { inferDocumentPreviewKind } from "@/components/documents/DocumentPreview";

describe("document preview type detection", () => {
  const base = { file_path: "tenant/employee/file" };

  it.each([
    ["image/jpeg", "scan.bin", "image"],
    ["image/png", "scan", "image"],
    [null, "license.JPEG", "image"],
    ["application/pdf", "upload.bin", "pdf"],
    [null, "form.PDF?token=temporary", "pdf"],
    ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "form.docx", "other"],
  ])("detects %s / %s as %s", (fileType, fileName, expected) => {
    expect(inferDocumentPreviewKind({ ...base, file_type: fileType, file_name: fileName })).toBe(expected);
  });
});