"use client";
import { Dialog } from "../dialog";
import { Button } from "./button";

/**
 * Asks before a destructive action. The lazy Dialog moves focus inside on open and returns it to
 * the control that opened it on close; the caller closes it once the action succeeds.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={title} description={description}>
      <Button danger onClick={onConfirm}>
        {confirmLabel}
      </Button>
    </Dialog>
  );
}
