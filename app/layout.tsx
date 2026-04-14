import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import AppProvider from "./components/AppProvider";
import BottomNav from "./components/BottomNav";
import CallSimulator from "./components/CallSimulator";
import NetworkBanner from "./components/NetworkBanner";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Bizaflow Telecom — Communication Digitale",
    template: "%s · Bizaflow Telecom",
  },
  description:
    "Plateforme de télécommunication digitale moderne. Appels gratuits entre utilisateurs, crédit télécom, packs et numéros Bizaflow uniques.",
  keywords: ["telecom", "bizaflow", "appels", "communication", "VoIP"],
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Bizaflow Telecom",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: "/logo_bizaflow.png",
    shortcut: "/logo_bizaflow.png",
    apple: "/logo_bizaflow.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#060b18",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className={`${inter.variable} dark`}>
      <body>
        <NetworkBanner />
        <AppProvider>
          {children}
          <CallSimulator />
          <BottomNav />
        </AppProvider>
      </body>
    </html>
  );
}
