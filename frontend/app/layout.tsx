import type { Metadata } from "next";
import "./globals.css";
import { AccountsProvider } from "@/contexts/AccountsContext";

export const metadata: Metadata = {
  title: "Budget Tracker",
  description: "Personal finance tracking with Liquid Glass design",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="cs">
      <body>
        <AccountsProvider>
          {children}
        </AccountsProvider>
      </body>
    </html>
  );
}
