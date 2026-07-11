import type { Metadata, Viewport } from "next";
import "./globals.css";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";

export const metadata: Metadata = {
  applicationName: "McNotes",
  title: "McNotes - Outlining & Markdown Writing",
  description: "A cozy, distraction-free markdown editor for writing books, novels, and outlines.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "McNotes",
  },
  icons: {
    icon: "/branding/logos/mcnotes-app-badge.svg",
    shortcut: "/branding/logos/mcnotes-app-badge.svg",
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4edd8" },
    { media: "(prefers-color-scheme: dark)", color: "#151513" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}

