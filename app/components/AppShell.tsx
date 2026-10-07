"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { supabase, supabaseConfigured } from "../lib/supabase-client";
import AssistantChat from "./AssistantChat";

const iconProps = {
  width: 18,
  height: 18,
  viewBox: "0 0 20 20",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const
};

const icons = {
  dashboard: (
    <svg {...iconProps}>
      <rect x="2" y="2" width="7" height="7" rx="1.5" />
      <rect x="11" y="2" width="7" height="7" rx="1.5" />
      <rect x="2" y="11" width="7" height="7" rx="1.5" />
      <rect x="11" y="11" width="7" height="7" rx="1.5" />
    </svg>
  ),
  pencil: (
    <svg {...iconProps}>
      <path d="M14 3l3 3L6 17H3v-3L14 3z" />
      <path d="M12 5l3 3" />
    </svg>
  ),
  calendar: (
    <svg {...iconProps}>
      <rect x="2" y="3.5" width="16" height="14.5" rx="2" />
      <path d="M2 8.5h16M6.5 2v3M13.5 2v3" />
    </svg>
  ),
  books: (
    <svg {...iconProps}>
      <rect x="2" y="3" width="4" height="14" rx="1" />
      <rect x="8" y="5" width="4" height="12" rx="1" />
      <rect x="14" y="2" width="4" height="16" rx="1" />
    </svg>
  ),
  chart: (
    <svg {...iconProps}>
      <path d="M2 18h16" />
      <rect x="3" y="12" width="3.5" height="6" rx="0.75" />
      <rect x="8.25" y="8" width="3.5" height="10" rx="0.75" />
      <rect x="13.5" y="4" width="3.5" height="14" rx="0.75" />
    </svg>
  ),
  person: (
    <svg {...iconProps}>
      <circle cx="10" cy="6" r="3.5" />
      <path d="M3 19c0-4 3.1-7 7-7s7 3 7 7" />
    </svg>
  ),
  map: (
    <svg {...iconProps}>
      <circle cx="10" cy="10" r="2.5" />
      <circle cx="4" cy="4" r="1.5" />
      <circle cx="16" cy="5" r="1.5" />
      <circle cx="15" cy="16" r="1.5" />
      <path d="M8.2 8.2L5.1 5.1M12.2 8.9l2.5-2.8M11.7 11.9l2.3 3" />
    </svg>
  ),
  sliders: (
    <svg {...iconProps}>
      <path d="M2 5h16M2 10h16M2 15h16" />
      <circle cx="6" cy="5" r="2" />
      <circle cx="14" cy="10" r="2" />
      <circle cx="8" cy="15" r="2" />
    </svg>
  ),
  login: (
    <svg {...iconProps}>
      <path d="M8 4H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h3" />
      <path d="M12 6l4 4-4 4" />
      <path d="M7 10h9" />
    </svg>
  ),
  logout: (
    <svg {...iconProps}>
      <path d="M12 4h3a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-3" />
      <path d="M8 6L4 10l4 4" />
      <path d="M13 10H4" />
    </svg>
  ),
};

const navigation: { href: string; label: string; icon: React.ReactNode }[] = [
  { href: "/", label: "Tableau de bord", icon: icons.dashboard },
  { href: "/preparation", label: "Préparer", icon: icons.pencil },
  { href: "/planning", label: "Planning", icon: icons.calendar },
  { href: "/bibliotheque", label: "Bibliothèque", icon: icons.books },
  { href: "/progression", label: "Progression", icon: icons.chart },
  { href: "/eleves", label: "Élèves & suivi", icon: icons.person },
  { href: "/carte", label: "Carte des guides", icon: icons.map },
  { href: "/parametres", label: "Paramètres", icon: icons.sliders }
];

type Profile = { firstName: string; lastName: string; school: string };

const PROFILE_KEY = "sage-profile";

function readProfile(): Profile {
  try {
    const stored = localStorage.getItem(PROFILE_KEY);
    if (stored) return JSON.parse(stored) as Profile;
  } catch { /* ignore */ }
  return { firstName: "", lastName: "", school: "" };
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [cloudEmail, setCloudEmail] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile>({ firstName: "", lastName: "", school: "" });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    setMobileMenuOpen(false);
    setProfile(readProfile());
  }, [pathname]);

  useEffect(() => {
    if (!supabase) {
      return;
    }

    supabase.auth.getUser().then(({ data }) => {
      setCloudEmail(data.user?.email ?? null);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setCloudEmail(session?.user.email ?? null);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  async function deconnecter() {
    if (!supabase) {
      return;
    }

    await supabase.auth.signOut();
    setCloudEmail(null);
    window.location.href = "/auth";
  }

  const sidebar = (
    <>
      <div className="px-2">
        <p className="flex items-center gap-2 text-xl font-bold text-slate-950">
          <span aria-hidden="true" className="h-5 w-1.5 rounded-full bg-menthe" />
          Sage
        </p>
        <p className="mt-0.5 text-xs text-slate-500">Portail enseignant</p>
      </div>

      <nav className="mt-6 grid gap-1">
        {navigation.map((item) => {
          const active = pathname === item.href;

          return (
            <a
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-11 items-center gap-3 rounded-md px-3 py-3 text-sm font-semibold transition ${
                active
                  ? "rounded-l-none bg-bleu-france-mist text-bleu-france shadow-[inset_3px_0_0_#000091]"
                  : "text-slate-700 hover:bg-slate-50 hover:text-slate-950"
              }`}
            >
              <span className="flex w-5 items-center justify-center">{item.icon}</span>
              {item.label}
            </a>
          );
        })}

        {supabaseConfigured && !cloudEmail && (
          <a
            href="/auth"
            className={`flex min-h-11 items-center gap-3 rounded-md px-3 py-3 text-sm font-semibold transition ${
              pathname === "/auth"
                ? "rounded-l-none bg-bleu-france-mist text-bleu-france shadow-[inset_3px_0_0_#000091]"
                : "text-slate-700 hover:bg-slate-50 hover:text-slate-950"
            }`}
          >
            <span className="flex w-5 items-center justify-center">{icons.login}</span>
            Connexion
          </a>
        )}
      </nav>

      <div className="mt-auto grid gap-4 pt-8">
        <div className="grid gap-2 border-t border-slate-200 pt-5 text-xs font-semibold text-slate-500">
          <a
            href="https://alacle.org"
            target="_blank"
            rel="noreferrer"
            className="rounded-md px-3 py-2 transition hover:bg-slate-50 hover:text-slate-950"
          >
            alacle.org
          </a>
          <a
            href="/politique-confidentialite"
            className="rounded-md px-3 py-2 transition hover:bg-slate-50 hover:text-slate-950"
          >
            Politique de confidentialité
          </a>
        </div>

        <div className="w-full max-w-full rounded-md bg-slate-50 p-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-menthe-mist font-bold text-menthe-profond">
              {(profile.firstName || profile.lastName || "E")[0].toUpperCase()}
            </div>
            <div className="min-w-0 flex-1 overflow-hidden">
              <p className="whitespace-normal break-words text-sm font-semibold leading-5 text-slate-950 [overflow-wrap:anywhere]">
                {[profile.firstName, profile.lastName].filter(Boolean).join(" ") || "Enseignant"}
              </p>
              <p className="mt-0.5 whitespace-normal break-words text-xs leading-4 text-slate-500 [overflow-wrap:anywhere]" title={cloudEmail ?? undefined}>
                {profile.school || cloudEmail || "Données locales"}
              </p>
            </div>
            {supabaseConfigured && cloudEmail && (
              <button
                type="button"
                onClick={deconnecter}
                title="Se déconnecter"
                className="shrink-0 grid h-8 w-8 place-items-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-950"
              >
                {icons.logout}
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950 lg:grid lg:grid-cols-[260px_minmax(0,1fr)]">
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-slate-200 bg-slate-50/95 px-4 py-3 backdrop-blur lg:hidden">
        <div>
          <p className="font-bold text-slate-950">Sage</p>
          <p className="text-xs text-slate-500">Portail enseignant</p>
        </div>
        <button
          type="button"
          onClick={() => setMobileMenuOpen(true)}
          aria-label="Ouvrir le menu"
          className="grid h-11 w-11 place-items-center rounded-md border border-slate-200 bg-white text-slate-950 shadow-sm transition hover:bg-slate-50"
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path d="M4 7h16" />
            <path d="M4 12h16" />
            <path d="M4 17h16" />
          </svg>
        </button>
      </header>

      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Fermer le menu"
            className="absolute inset-0 bg-slate-950/60"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative flex h-full w-[min(82vw,320px)] flex-col bg-white px-4 py-5 shadow-2xl">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              aria-label="Fermer le menu"
              className="absolute right-4 top-5 z-10 grid h-10 w-10 place-items-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-950"
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <path d="M6 6l12 12" />
                <path d="M18 6L6 18" />
              </svg>
            </button>
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto pr-1">{sidebar}</div>
          </aside>
        </div>
      )}

      <aside className="hidden h-screen min-h-screen flex-col overflow-y-auto border-r border-slate-200 bg-white px-4 py-5 lg:sticky lg:top-0 lg:flex">
        {sidebar}
      </aside>

      <div className="min-w-0">{children}</div>
      <AssistantChat />
    </div>
  );
}