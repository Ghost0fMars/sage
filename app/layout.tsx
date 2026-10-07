import type { Metadata, Viewport } from "next";
import RootShell from "./components/RootShell";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sage - Système d'assistance et de gestion éducative",
  description: "Portail enseignant pour préparer, planifier et suivre la classe",
  manifest: "/manifest.webmanifest",
  applicationName: "Sage - Système d'assistance et de gestion éducative",
  appleWebApp: {
    capable: true,
    title: "Sage - Système d'assistance et de gestion éducative",
    statusBarStyle: "default"
  },
  icons: {
    icon: [
      { url: "/sage-logo.png", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" }
    ],
    apple: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }]
  }
};

export const viewport: Viewport = {
  themeColor: "#000091"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body>
        <RootShell>{children}</RootShell>
      </body>
    </html>
  );
}


