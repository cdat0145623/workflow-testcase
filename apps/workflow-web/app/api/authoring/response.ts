import { NextResponse } from "next/server";

export function authoringSuccess(data: unknown, status = 200) {
  return NextResponse.json({ data }, { status });
}

export function authoringError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message === "Authoring session not found") return NextResponse.json({ error: { code: "not_found", message } }, { status: 404 });
  if (message.includes("terminal") || message.includes("only begin") || message.includes("only be") || message.includes("not awaiting review") || message.includes("Illegal authoring transition") || message.includes("changed before")) {
    return NextResponse.json({ error: { code: "conflict", message } }, { status: 409 });
  }
  if (message.includes("required") || message.includes("incomplete") || message.includes("blocker") || message.includes("invalid") || message.includes("must") || message.includes("cannot") || message.includes("Zod")) {
    return NextResponse.json({ error: { code: "invalid_request", message } }, { status: 400 });
  }
  return NextResponse.json({ error: { code: "internal_error", message: "Unable to process authoring request" } }, { status: 500 });
}
