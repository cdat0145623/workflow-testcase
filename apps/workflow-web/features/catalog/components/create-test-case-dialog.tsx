"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createTestCaseAction } from "../actions";
import { CatalogDialog } from "./catalog-dialog";

export function CreateTestCaseDialog({ projectId, featureId }: { projectId: string; featureId: string }) {
  return (
    <CatalogDialog title="Create test case" triggerLabel="+ New test case" action={createTestCaseAction}>
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="featureId" value={featureId} />
      <div className="space-y-1.5">
        <Label htmlFor={`case-name-${featureId}`}>Test case name</Label>
        <Input id={`case-name-${featureId}`} name="name" required autoFocus placeholder="Login happy path" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`base-url-${featureId}`}>Base URL</Label>
        <Input id={`base-url-${featureId}`} name="baseUrl" type="url" required placeholder="https://preview.example.com" />
      </div>
    </CatalogDialog>
  );
}
