"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function RunVariablesDialog({
  open,
  onOpenChange,
  onRun,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  onRun(variables: Record<string, string>): void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [assigneeName, setAssigneeName] = useState("");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const close = () => {
    setUsername("");
    setPassword("");
    setTaskTitle("");
    setAssigneeName("");
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
        onSubmit={(event) => {
          event.preventDefault();
          onRun({ username, password, taskTitle, assigneeName });
          close();
        }}
      >
        <div>
          <h2 id="run-variables-title" className="text-base font-semibold">Run workflow</h2>
          <p className="mt-1 text-xs leading-5 text-slate-400">Credentials are sent only to this run and are redacted from stored run history.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="run-username">Username</Label>
          <Input id="run-username" value={username} autoComplete="username" onChange={(event) => setUsername(event.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="run-password">Password</Label>
          <Input id="run-password" type="password" value={password} autoComplete="current-password" onChange={(event) => setPassword(event.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="run-task-title">Task title</Label>
          <Input id="run-task-title" value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="run-assignee-name">Assignee name</Label>
          <Input id="run-assignee-name" value={assigneeName} onChange={(event) => setAssigneeName(event.target.value)} />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" type="button" onClick={close}>Cancel</Button>
          <Button variant="primary" type="submit">Run workflow</Button>
        </div>
      </form>
    </dialog>
  );
}
