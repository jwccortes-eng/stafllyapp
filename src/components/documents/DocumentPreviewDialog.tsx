/**
 * DocumentPreviewDialog — modal wrapper around <DocumentPreview/>.
 *
 * Used by admin DocumentsCenter, employee profile, and worker portal.
 * No DB writes. Footer/banner slots are owned by parents.
 */

import { useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import DocumentPreview, { type DocumentPreviewItem } from "./DocumentPreview";
import { acquireDocDialogLock } from "@/lib/document-dialog-suspend";
import { logMount, logUnmount } from "@/lib/ctx001-forensics";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: DocumentPreviewItem | null;
  /** Footer slot — approve/reject/correct buttons rendered below preview. */
  actions?: React.ReactNode;
  /** Banner slot — mismatch warnings, helper copy, etc. */
  banner?: React.ReactNode;
  /** Right column slot — e.g. AssistedExtractionPanel. Renders side-by-side on >=lg. */
  side?: React.ReactNode;
  title?: string;
}

export default function DocumentPreviewDialog({
  open, onOpenChange, item, actions, banner, side, title,
}: Props) {
  useEffect(() => {
    const id = logMount("DocumentPreviewDialog", { documentId: item?.id ?? null });
    return () => logUnmount("DocumentPreviewDialog", id);
  }, []);

  useEffect(() => {
    if (!open) return;
    return acquireDocDialogLock();
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl w-[95vw] max-h-[95vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="text-sm">{title ?? "Vista previa del documento"}</DialogTitle>
        </DialogHeader>
        {item ? (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
            <DocumentPreview item={item} actions={actions} banner={banner} />
            {side && (
              <div className="lg:border-l lg:pl-4 space-y-3">
                {side}
              </div>
            )}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground py-8 text-center">Sin documento.</div>
        )}
      </DialogContent>
    </Dialog>
  );
}
