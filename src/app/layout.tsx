import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mcnatt Notes - Outlining & Markdown Writing",
  description: "A cozy, distraction-free markdown editor for writing books, novels, and outlines.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

