import { useEffect, useRef, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Upload, FileText, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { acquireDocDialogLock } from "@/lib/document-dialog-suspend";
import { clearFileInput, openFilePicker, selectedFileFromInput } from "@/lib/mobile-file-picker";
import { useToast } from "@/hooks/use-toast";

const CATEGORY_OPTIONS = [
  { value: "id", label: "ID document" },
  { value: "driver_license", label: "Driver's license" },
  { value: "vehicle_registration", label: "Vehicle registration" },
  { value: "work_authorization", label: "Work authorization" },
  { value: "tax_form", label: "Tax form (W-9 / W-4)" },
  { value: "agreement", label: "Signed agreement" },
  { value: "training", label: "Training certificate" },
  { value: "medical", label: "Medical / health" },
  { value: "other", label: "Other" },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (input: { file: File; category: string; approveOnUpload: boolean }) => Promise<void>;
}

/** Premium admin-upload dialog with category + "approve on upload" choice. */
export function DocumentUploadDialog({ open, onOpenChange, onConfirm }: Props) {
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [category, setCategory] = useState<string>("other");
  const [approveOnUpload, setApproveOnUpload] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Suppress visual realtime refreshes in the parent profile while open,
  // so any focused control inside the dialog keeps its focus.
  useEffect(() => {
    if (!open) return;
    const release = acquireDocDialogLock();
    return release;
  }, [open]);

  const reset = () => {
    setFile(null);
    setCategory("other");
    setApproveOnUpload(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleConfirm = async () => {
    if (!file) return;
    setSubmitting(true);
    try {
      await onConfirm({ file, category, approveOnUpload });
      reset();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (submitting) return;
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl flex items-center justify-center bg-primary/10 text-primary">
              <Upload className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle>Upload document</DialogTitle>
              <DialogDescription className="text-xs mt-0.5">
                Stored privately. Worker portal only sees status changes.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          {/* File picker */}
          <div className="space-y-2">
            <Label className="text-xs font-medium">File</Label>
            <button
              type="button"
              onClick={() => openFilePicker(fileRef.current, toast)}
              className={cn(
                "w-full flex items-center gap-3 rounded-xl border border-dashed border-border/60 px-4 py-3 text-left transition hover:border-primary/40 hover:bg-primary/[0.03]",
                file && "border-primary/40 bg-primary/[0.03]",
              )}
            >
              <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
              <div className="min-w-0 flex-1">
                {file ? (
                  <>
                    <p className="text-sm font-medium truncate">{file.name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {(file.size / 1024).toFixed(0)} KB · {file.type || "unknown"}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-medium">Select a file</p>
                    <p className="text-[10px] text-muted-foreground">
                      PDF, JPG, PNG, DOC up to 10MB
                    </p>
                  </>
                )}
              </div>
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
              className="hidden"
              onChange={(e) => {
                setFile(selectedFileFromInput(e));
                clearFileInput(e);
              }}
            />
          </div>

          {/* Category */}
          <div className="space-y-2">
            <Label htmlFor="category" className="text-xs font-medium">Category</Label>
            <Select value={category} onValueChange={setCategory} disabled={submitting}>
              <SelectTrigger id="category"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORY_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Approve on upload */}
          <div className="flex items-center justify-between rounded-xl border border-border/60 px-3 py-2.5">
            <div className="min-w-0">
              <p className="text-sm font-medium">Mark as approved</p>
              <p className="text-[10px] text-muted-foreground">
                Skip review. Use only for documents you trust.
              </p>
            </div>
            <Switch
              checked={approveOnUpload}
              onCheckedChange={setApproveOnUpload}
              disabled={submitting}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!file || submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Upload className="h-4 w-4 mr-1.5" />}
            {approveOnUpload ? "Upload & approve" : "Upload as pending"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
