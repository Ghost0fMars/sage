"use client";

import { useEffect } from "react";
import AppShell from "./AppShell";
import ServiceWorkerRegister from "./ServiceWorkerRegister";
import { installerFetchAlbert } from "../lib/albert-settings";

export default function RootShell({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    installerFetchAlbert();
  }, []);

  return (
    <>
      <ServiceWorkerRegister />
      <AppShell>{children}</AppShell>
    </>
  );
}
