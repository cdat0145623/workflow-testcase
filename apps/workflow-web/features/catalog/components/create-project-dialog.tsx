"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createProjectAction } from "../actions";
import { CatalogDialog } from "./catalog-dialog";

export function CreateProjectDialog() {
  return (
    <CatalogDialog title="Create project" triggerLabel="+ New project" action={createProjectAction}>
      <div className="space-y-1.5">
        <Label htmlFor="project-name">Project name</Label>
        <Input id="project-name" name="name" required autoFocus placeholder="Customer portal" />
      </div>
    </CatalogDialog>
  );
}
