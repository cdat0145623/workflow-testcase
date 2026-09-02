import type { Metadata } from "next";

import { appMetadata } from "./metadata";
import "./globals.css";

export const metadata: Metadata = appMetadata;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
