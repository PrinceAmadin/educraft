"use client";

import * as React from "react";
import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "next-themes";
import { PwaProvider } from "@/components/pwa/PwaProvider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ThemeProvider
        attribute="class"
        defaultTheme="light"
        enableSystem={false}
        disableTransitionOnChange
        storageKey="educraft:theme"
      >
        <PwaProvider>{children}</PwaProvider>
      </ThemeProvider>
    </SessionProvider>
  );
}
