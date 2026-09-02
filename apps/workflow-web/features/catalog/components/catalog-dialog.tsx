"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";

export function CatalogDialog({
  title,
  triggerLabel,
  action,
  children,
}: {
  title: string;
  triggerLabel: string;
  action(formData: FormData): void | Promise<void>;
  children: React.ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <>
      <Button variant="ghost" size="sm" className="w-full justify-start" onClick={() => setOpen(true)}>
        {triggerLabel}
      </Button>
      <dialog
        ref={dialogRef}
        onClose={() => setOpen(false)}
        className="m-auto w-[min(28rem,calc(100%-2rem))] rounded-xl border border-slate-700 bg-slate-900 p-0 text-slate-100 shadow-2xl backdrop:bg-slate-950/75"
      >
        <form action={action} className="space-y-4 p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold">{title}</h2>
            <Button variant="ghost" size="icon" aria-label="Close dialog" onClick={() => setOpen(false)}>
              <X aria-hidden="true" className="size-4" />
            </Button>
          </div>
          {children}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" type="submit">Create</Button>
          </div>
        </form>
      </dialog>
    </>
  );
}
