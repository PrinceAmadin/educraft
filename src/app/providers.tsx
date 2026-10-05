"use client";

import * as React from "react";
import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "next-themes";
import { PwaProvider } from "@/components/pwa/PwaProvider";
import { ConfirmProvider } from "@/components/ui/confirm";

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
        <PwaProvider>
          <ConfirmProvider>{children}</ConfirmProvider>
        </PwaProvider>
      </ThemeProvider>
    </SessionProvider>
  );
}
