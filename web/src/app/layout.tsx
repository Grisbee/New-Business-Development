import type { Metadata, Viewport } from "next";
import { Archivo, Public_Sans } from "next/font/google";
import "./globals.css";

const archivo = Archivo({ subsets: ["latin"], weight: ["600", "700", "800"], variable: "--font-archivo" });
const publicSans = Public_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-public-sans" });

export const metadata: Metadata = {
  title: "SideQuest",
  description: "City events, community threads and university teams for students in Taipei.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icons/sidequest-icon.svg", apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#C93B63",
};

// Picks the theme before first paint (saved choice, else the system's).
const THEME_SCRIPT = `try{var t=localStorage.getItem('sq-theme')||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${archivo.variable} ${publicSans.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
