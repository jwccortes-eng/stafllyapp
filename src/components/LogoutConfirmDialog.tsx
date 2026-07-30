import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2 } from "lucide-react";
import { ReactNode, cloneElement, isValidElement, useCallback, useEffect, useState, useSyncExternalStore } from "react";

/**
 * Global sign-out confirmation.
 *
 * Root cause of the mobile bug: the AlertDialog used to be rendered *inside*
 * DropdownMenuContent / Sheet / Drawer bodies. Tapping the trigger closes those
 * containers, which unmounts the AlertDialog together with them, so the modal
 * flashed and disappeared before the user could answer.
 *
 * Fix: the dialog now lives once at the app root (<SignOutConfirmRoot />) and is
 * driven by a tiny external store. Triggers only *request* the confirmation, so
 * they can be unmounted freely without affecting the dialog.
 */

type PendingConfirm = (() => void | Promise<void>) | null;

let pending: PendingConfirm = null;
let openState = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return openState;
}

/** Opens the global sign-out confirmation with the given confirm handler. */
export function requestSignOutConfirmation(onConfirm: () => void | Promise<void>) {
  pending = onConfirm;
  openState = true;
  emit();
}

function closeConfirmation() {
  openState = false;
  pending = null;
  emit();
}

interface LogoutConfirmDialogProps {
  onConfirm: () => void | Promise<void>;
  children: ReactNode;
}

/**
 * Wrapper kept for API compatibility: renders the child as-is and hijacks its
 * onClick to open the globally-rendered confirmation dialog.
 */
export function LogoutConfirmDialog({ onConfirm, children }: LogoutConfirmDialogProps) {
  const handleClick = useCallback(
    (event: React.MouseEvent) => {
      // Prevent the tap from bubbling into menu/sheet handlers and from
      // triggering any default (Radix item select, link navigation, ...).
      event.preventDefault();
      event.stopPropagation();
      requestSignOutConfirmation(onConfirm);
    },
    [onConfirm]
  );

  if (isValidElement(children)) {
    const child = children as React.ReactElement<Record<string, unknown>>;
    return cloneElement(child, {
      onClick: (event: React.MouseEvent) => {
        (child.props.onClick as ((e: React.MouseEvent) => void) | undefined)?.(event);
        handleClick(event);
      },
      // Radix menu items: don't let "select" close the menu with a side effect.
      onSelect: (event: Event) => {
        event.preventDefault();
      },
    });
  }

  return (
    <span onClick={handleClick} role="presentation">
      {children}
    </span>
  );
}

/** Mount once, at the app root. */
export function SignOutConfirmRoot() {
  const open = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) setBusy(false);
  }, [open]);

  const handleConfirm = async () => {
    if (busy) return; // guard against double-tap
    const fn = pending;
    setBusy(true);
    try {
      await fn?.();
    } finally {
      closeConfirmation();
    }
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        // Only explicit actions may close it; never auto-close while signing out.
        if (!next && !busy) closeConfirmation();
      }}
    >
      <AlertDialogContent
        onEscapeKeyDown={(e) => busy && e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>¿Cerrar sesión?</AlertDialogTitle>
          <AlertDialogDescription>
            Se cerrará tu sesión actual y tendrás que iniciar sesión nuevamente para acceder.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              void handleConfirm();
            }}
            disabled={busy}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {busy ? "Cerrando sesión…" : "Cerrar sesión"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
