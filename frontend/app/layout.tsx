import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AccountsProvider } from "@/contexts/AccountsContext";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#1a1a2e",
};

export const metadata: Metadata = {
  title: "Budget Tracker",
  description: "Osobní správa financí s moderním designem",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Budget Tracker",
  },
  icons: {
    icon: "/icons/icon-192x192.png",
    apple: "/icons/icon-192x192.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="cs">
      <body>
        <ServiceWorkerRegister />
        <AccountsProvider>
          {children}
        </AccountsProvider>
      </body>
    </html>
  );
}
