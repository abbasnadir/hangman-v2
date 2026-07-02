// Check if all the environment variables are set
import '@/lib/env';

import type { Metadata } from "next";
import { Fredoka, Quicksand } from "next/font/google";
import "./globals.css";

const fredoka = Fredoka({
  variable: "--font-fredoka",
  subsets: ["latin"],
});

const quicksand = Quicksand({
  variable: "--font-quicksand",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Hangman v2",
  description:
    "A robust multiplayer hangman game with authentication and leaderboards",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${fredoka.variable} ${quicksand.variable} antialiased bg-[#171124] text-zinc-100 font-quicksand`}
      >
        {children}
      </body>
    </html>
  );
}
