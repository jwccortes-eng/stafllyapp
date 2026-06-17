import type { ChangeEvent } from "react";

export const CAMERA_PHOTO_PERMISSION_MESSAGE =
  "Please allow camera/photo access in Settings to upload documents.";

type ToastFn = (input: { title: string; description?: string; variant?: "default" | "destructive" }) => void;

export function selectedFileFromInput(event: ChangeEvent<HTMLInputElement>): File | null {
  try {
    return event.currentTarget.files?.[0] ?? null;
  } catch {
    return null;
  }
}

export function clearFileInput(event: ChangeEvent<HTMLInputElement>) {
  try {
    event.currentTarget.value = "";
  } catch {
    // Native pickers can return in unusual states on iOS; never let cleanup crash the UI.
  }
}

export function openFilePicker(input: HTMLInputElement | null | undefined, toast?: ToastFn) {
  try {
    input?.click();
  } catch {
    toast?.({
      title: "Camera/photo access needed",
      description: CAMERA_PHOTO_PERMISSION_MESSAGE,
      variant: "destructive",
    });
  }
}

export function createPreviewUrl(file: File, toast?: ToastFn): string | null {
  try {
    return URL.createObjectURL(file);
  } catch {
    toast?.({
      title: "Could not open photo",
      description: "Please try another image or PDF.",
      variant: "destructive",
    });
    return null;
  }
}

export function notifyPickerAccessIssue(toast: ToastFn) {
  toast({
    title: "Camera/photo access needed",
    description: CAMERA_PHOTO_PERMISSION_MESSAGE,
    variant: "destructive",
  });
}