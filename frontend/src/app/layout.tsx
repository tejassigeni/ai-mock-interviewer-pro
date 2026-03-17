import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Mock Interviewer — Ace Your Interviews with AI",
  description:
    "Practice technical interviews with AI-powered question generation, real-time evaluation, and personalized feedback. Master DSA, System Design, Cybersecurity, and more.",
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
