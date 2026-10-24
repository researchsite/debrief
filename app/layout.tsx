import type { Metadata } from "next";
import { Suspense } from "react";
import { Geist, Geist_Mono, Pixelify_Sans, VT323 } from "next/font/google";
import { BottomNav } from "@/components/BottomNav";
import { PageFade } from "@/components/pixel/PageFade";
import "./globals.css";
import "./pixel-theme.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const pixelFont = Pixelify_Sans({
  variable: "--font-pixel",
  subsets: ["latin"],
});

const pixelBodyFont = VT323({
  variable: "--font-pixel-body",
  weight: "400",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Debrief",
  description: "Your conference memory",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${pixelFont.variable} ${pixelBodyFont.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[var(--px-paper)] text-foreground">
        <div className="flex flex-col min-h-svh w-full mx-auto relative">
          <main className="flex-1 flex flex-col overflow-y-auto pb-16">
            <PageFade>{children}</PageFade>
          </main>
          <Suspense>
            <BottomNav />
          </Suspense>
        </div>
      </body>
    </html>
  );
}
