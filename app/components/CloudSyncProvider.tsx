"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase, supabaseConfigured } from "../lib/supabase-client";
import {
  ensureLocalUser,
  SYNCED_DATA_KEYS,
  userStorageKeyForUser
} from "../lib/user-storage";

export default function CloudSyncProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(!supabaseConfigured);

  useEffect(() => {
    if (!supabase) {
      setReady(true);
      return;
    }

    const client = supabase;
    let mounted = true;

    async function verifierAcces(user: { id: string; email?: string; user_metadata?: { name?: string } }) {
      const { data: acces } = await client
        .from("user_access")
        .select("status")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!acces) {
        await client.from("user_access").insert({
          user_id: user.id,
          email: user.email ?? "email inconnu",
          name: user.user_metadata?.name ?? user.email ?? "Utilisateur",
          status: "pending"
        });
        return "pending";
      }

      return acces.status as "pending" | "approved" | "rejected";
    }

    async function synchroniser() {
      setReady(false);

      const { data: sessionData } = await client.auth.getSession();
      const user = sessionData.session?.user;

      if (!user) {
        // Accès sans compte : l'app fonctionne en local (utilisateur par défaut).
        if (mounted) {
          setReady(true);
        }
        return;
      }

      const statutAcces = await verifierAcces(user);

      if (statutAcces !== "approved") {
        // Compte non validé : pas de synchronisation cloud, mais l'app reste utilisable en local.
        if (mounted) {
          setReady(true);
        }
        return;
      }

      if (pathname === "/auth") {
        router.replace("/");
      }

      ensureLocalUser({
        id: user.id,
        name: user.user_metadata?.name ?? user.email ?? "Utilisateur"
      });

      const { data: lignes } = await client
        .from("app_data")
        .select("key,value")
        .eq("user_id", user.id);

      if (lignes && lignes.length > 0) {
        lignes.forEach((ligne) => {
          localStorage.setItem(userStorageKeyForUser(user.id, ligne.key), JSON.stringify(ligne.value));
        });
      } else {
        SYNCED_DATA_KEYS.forEach((key) => {
          localStorage.removeItem(userStorageKeyForUser(user.id, key));
        });
      }

      if (mounted) {
        setReady(true);
      }
    }

    synchroniser();

    const { data: listener } = client.auth.onAuthStateChange(() => {
      synchroniser();
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, [pathname, router]);

  if (!ready) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-50 px-4">
        <div className="rounded-lg border border-slate-200 bg-white p-6 text-center shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">
            Synchronisation
          </p>
          <p className="mt-2 text-slate-700">Chargement des données de votre espace...</p>
        </div>
      </main>
    );
  }

  return <>{children}</>;
}
