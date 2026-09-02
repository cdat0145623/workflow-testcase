"use client";

import { useState } from "react";

export function ArtifactViewer({ runId, stepId }: { runId: string; stepId: string }) {
  const base = `/api/artifacts/${encodeURIComponent(runId)}/steps/${encodeURIComponent(stepId)}`;
  const [selected, setSelected] = useState<"before" | "after" | null>(null);
  const selectedAlt = selected ? `${stepId} ${selected} screenshot` : "";

  return (
    <>
      <div className="grid grid-cols-2 gap-2 p-3">
        {(["before", "after"] as const).map((moment) => {
          const alt = `${stepId} ${moment} screenshot`;
          return (
            <figure key={moment} className="overflow-hidden rounded-lg border border-slate-800 bg-slate-950">
              <button type="button" aria-label={`Open ${alt}`} onClick={() => setSelected(moment)} className="block w-full cursor-zoom-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`${base}-${moment}.png`} alt={alt} className="aspect-video w-full object-contain" />
              </button>
              <figcaption className="border-t border-slate-800 px-2 py-1.5 text-[10px] uppercase tracking-wider text-slate-500">{moment}</figcaption>
            </figure>
          );
        })}
      </div>

      {selected && (
        <div role="dialog" aria-modal="true" aria-label={selectedAlt} className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 p-4" onClick={() => setSelected(null)}>
          <div className="relative max-h-full max-w-full" onClick={(event) => event.stopPropagation()}>
            <button type="button" aria-label="Close evidence preview" onClick={() => setSelected(null)} className="absolute right-2 top-2 z-10 rounded bg-slate-950/85 px-3 py-2 text-xs font-semibold text-white shadow hover:bg-slate-800">
              Close
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`${base}-${selected}.png`} alt={`${selectedAlt} full size`} className="max-h-[calc(100vh-2rem)] max-w-[calc(100vw-2rem)] rounded-lg object-contain shadow-2xl" />
          </div>
        </div>
      )}
    </>
  );
}
