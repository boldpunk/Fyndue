import type { Metadata, Viewport } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { ThemeProvider } from "@/components/layout/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const DESCRIPTION = "Ни одного пропущенного платежа. Никакого финансового хаоса. Вся картина денег — в одном месте.";

export const metadata: Metadata = {
  // Absolute URLs for the link preview image (app/opengraph-image.png).
  metadataBase: new URL(process.env.BETTER_AUTH_URL ?? "https://fyndue.uz"),
  title: { default: "Fyndue", template: "%s · Fyndue" },
  description: DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: "Fyndue",
    locale: "ru_RU",
    title: "Fyndue — долги, подписки и деньги под контролем",
    description: DESCRIPTION,
  },
  twitter: { card: "summary_large_image", title: "Fyndue — долги, подписки и деньги под контролем", description: DESCRIPTION },
  applicationName: "Fyndue",
  appleWebApp: { capable: true, title: "Fyndue", statusBarStyle: "default" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfbfc" },
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" suppressHydrationWarning className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="min-h-dvh">
        <ThemeProvider>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
