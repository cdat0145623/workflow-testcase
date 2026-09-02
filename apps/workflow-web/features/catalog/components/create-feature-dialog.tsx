"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createFeatureAction } from "../actions";
import { CatalogDialog } from "./catalog-dialog";

export function CreateFeatureDialog({ projectId }: { projectId: string }) {
  return (
    <CatalogDialog title="Create feature" triggerLabel="+ New feature" action={createFeatureAction}>
      <input type="hidden" name="projectId" value={projectId} />
      <div className="space-y-1.5">
        <Label htmlFor={`feature-name-${projectId}`}>Feature name</Label>
        <Input id={`feature-name-${projectId}`} name="name" required autoFocus placeholder="Authentication" />
      </div>
    </CatalogDialog>
  );
}
