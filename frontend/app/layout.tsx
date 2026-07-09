import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AccountsProvider } from "@/contexts/AccountsContext";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import Providers from "./providers";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#000000",
};

export const metadata: Metadata = {
  title: "Koruna",
  description: "Osobní správa financí",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Koruna",
  },
  icons: {
    icon: [
      { url: "/icons/icon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="cs" data-mode="dark">
      <body>
        <ServiceWorkerRegister />
        <Providers>
          <AccountsProvider>
            {children}
          </AccountsProvider>
        </Providers>
      </body>
    </html>
  );
}
