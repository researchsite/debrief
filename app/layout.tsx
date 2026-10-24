import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { Calendar, CalendarDays, Upload, Wallet, FileText } from "lucide-react";
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
  title: "Debrief",
  description: "Your conference memory",
};

const navItems = [
  { href: "/today", label: "Today", icon: Calendar },
  { href: "/event", label: "Event", icon: CalendarDays },
  { href: "/import", label: "Import", icon: Upload },
  { href: "/wallet", label: "Wallet", icon: Wallet },
  { href: "/recap", label: "Recap", icon: FileText },
];

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <div className="flex flex-col min-h-svh w-full max-w-[420px] mx-auto relative">
          <main className="flex-1 overflow-y-auto pb-16">{children}</main>

          {/* Bottom Navigation */}
          <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[420px] border-t border-border bg-background/95 backdrop-blur-sm z-50">
            <ul className="flex items-center justify-around h-16 px-2">
              {navItems.map(({ href, label, icon: Icon }) => (
                <li key={href} className="flex-1">
                  <Link
                    href={href}
                    className="flex flex-col items-center justify-center gap-1 py-2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Icon size={20} strokeWidth={1.5} />
                    <span className="text-[10px] font-medium leading-none">
                      {label}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </body>
    </html>
  );
}
