"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import AppShell from "./AppShell";
import CloudSyncProvider from "./CloudSyncProvider";
import ServiceWorkerRegister from "./ServiceWorkerRegister";
import { installerFetchAlbert } from "../lib/albert-settings";

export default function RootShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  useEffect(() => {
    installerFetchAlbert();
  }, []);

  const withoutSidebar = pathname === "/auth";

  return (
    <CloudSyncProvider>
      <ServiceWorkerRegister />
      {withoutSidebar ? children : <AppShell>{children}</AppShell>}
    </CloudSyncProvider>
  );
}
