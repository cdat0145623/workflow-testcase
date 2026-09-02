"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { RuntimeFieldDefinition } from "../runtime-values/types";

const emptyValues: Record<string, string> = {};

export function RunVariablesDialog({
  open,
  onOpenChange,
  onRun, fields, initialValues = emptyValues, isLoading = false, loadError,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  onRun(variables: Record<string, string>): Promise<void>;
  fields: RuntimeFieldDefinition[];
  initialValues?: Record<string, string>;
  isLoading?: boolean;
  loadError?: string | null;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [values, setValues] = useState<Record<string, string>>(initialValues);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => { if (open) { setValues(initialValues); setFieldErrors({}); } }, [initialValues, open]);

  const close = () => {
    onOpenChange(false);
  };

  return (
    <dialog
      ref={dialogRef}
      onClose={close}
      aria-labelledby="run-variables-title"
      className="m-auto w-[min(28rem,calc(100%-2rem))] rounded-xl border border-slate-700 bg-slate-900 p-0 text-slate-100 shadow-2xl backdrop:bg-slate-950/75"
    >
      <form
        className="space-y-4 p-5"
        onSubmit={async (event) => {
          event.preventDefault();
          setIsSubmitting(true);
          setFieldErrors({});
          try {
            await onRun(values);
            close();
          } catch (error) {
            const errors = error && typeof error === "object" && "fieldErrors" in error ? error.fieldErrors : {};
            setFieldErrors(errors as Record<string, string>);
            const firstInvalid = fields.find((field) => (errors as Record<string, string>)[field.key]);
            if (firstInvalid) document.getElementById(`run-${firstInvalid.key}`)?.focus();
          } finally {
            setIsSubmitting(false);
          }
        }}
      >
        <div>
          <h2 id="run-variables-title" className="text-base font-semibold">Run workflow</h2>
          <p className="mt-1 text-xs leading-5 text-slate-400">Values are saved as this test case's current preset. Password is encrypted before it reaches PostgreSQL; run history stays redacted.</p>
        </div>
        {loadError && <p role="alert" className="rounded border border-red-900 bg-red-950/30 p-2 text-xs text-red-200">{loadError}</p>}
        {fields.map((field) => <div key={field.key} className="space-y-1.5"><Label htmlFor={`run-${field.key}`}>{field.label}</Label><Input id={`run-${field.key}`} type="text" value={values[field.key] ?? ""} aria-invalid={Boolean(fieldErrors[field.key])} onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))} />{fieldErrors[field.key] && <p role="alert" className="text-xs text-red-300">{fieldErrors[field.key]}</p>}</div>)}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" type="button" onClick={close} disabled={isSubmitting}>Cancel</Button>
          <Button variant="primary" type="submit" disabled={isLoading || isSubmitting}>{isLoading ? "Loading preset…" : isSubmitting ? "Starting…" : "Run workflow"}</Button>
        </div>
      </form>
    </dialog>
  );
}
