import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { DisplayNameGate } from "@/components/DisplayNameGate";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Badminton Tracker",
  description: "Track matches and stats",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <DisplayNameGate>{children}</DisplayNameGate>
      </body>
    </html>
  );
}
