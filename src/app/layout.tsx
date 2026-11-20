import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { getSession } from "@/lib/auth";
import { env } from "@/lib/env";
import { Providers } from "@/lib/client/providers";

const inter = Inter({ subsets: ["latin", "cyrillic"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: { default: "9-B Management System", template: "%s · 9-B" },
  description: "9-B sinf boshqaruv platformasi: davomat, navbatchilar, qochib ketganlar tarixi va hisobotlar.",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#B0F2FF" },
    { media: "(prefers-color-scheme: dark)", color: "#0A1628" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  return (
    <html lang="uz" suppressHydrationWarning className={inter.variable}>
      <body className="min-h-dvh font-sans">
        <Providers authenticated={!!session || env.publicAccess}>{children}</Providers>
      </body>
    </html>
  );
}
