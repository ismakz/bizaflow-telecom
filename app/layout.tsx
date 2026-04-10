import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import AppProvider from "./components/AppProvider";
import BottomNav from "./components/BottomNav";
import CallSimulator from "./components/CallSimulator";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Bizaflow Telecom — Communication Digitale",
  description:
    "Plateforme de télécommunication digitale moderne. Appels gratuits entre utilisateurs, crédit télécom, packs et numéros Bizaflow uniques.",
  keywords: ["telecom", "bizaflow", "appels", "communication", "VoIP"],
  icons: {
    icon: "/logo_bizaflow.png",
    shortcut: "/logo_bizaflow.png",
    apple: "/logo_bizaflow.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className={`${inter.variable} dark`}>
      <body>
        <AppProvider>
          {children}
          <CallSimulator />
          <BottomNav />
        </AppProvider>
      </body>
    </html>
  );
}
