import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Trade-Assist — AI Trading Tutor",
  description: "Learn to trade by doing, with a live AI coach. Educational use only.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
