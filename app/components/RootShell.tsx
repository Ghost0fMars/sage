"use client";

import { usePathname } from "next/navigation";
import AppShell from "./AppShell";
import CloudSyncProvider from "./CloudSyncProvider";
import ServiceWorkerRegister from "./ServiceWorkerRegister";

export default function RootShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const withoutSidebar = pathname === "/auth";

  return (
    <CloudSyncProvider>
      <ServiceWorkerRegister />
      {withoutSidebar ? children : <AppShell>{children}</AppShell>}
    </CloudSyncProvider>
  );
}
