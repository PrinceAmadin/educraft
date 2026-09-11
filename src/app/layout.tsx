import type { Metadata, Viewport } from "next";
import { Inter, Instrument_Serif, Inter_Tight, JetBrains_Mono } from "next/font/google";
import { Providers } from "@/app/providers";
import { APP_NAME, BRAND_NAME } from "@/lib/constants";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  weight: ["500", "600"],
  display: "swap",
});

/* Editorial accent — italic only, used on single emphasised words */
const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  variable: "--font-instrument-serif",
  weight: "400",
  style: ["normal", "italic"],
  display: "swap",
});

/* Display face. Set at the two weights the type scale actually uses —
   500 for the quiet headline variant, 600 for statement type. A tight
   grotesk survives the -0.045em tracking the display scale applies. */
const interTight = Inter_Tight({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  // Resolves relative asset URLs (the OG/Twitter image, if one's added later)
  // to an absolute one. Without this Next.js warns at build time and falls
  // back to localhost, which is never reachable by a link-preview crawler.
  // Override with NEXT_PUBLIC_SITE_URL once a custom domain is attached.
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://educraft-hq.vercel.app"),
  title: {
    default: `${BRAND_NAME} — Academic work, done properly`,
    template: `%s · ${APP_NAME}`,
  },
  description:
    "Final year projects, seminar reports, defence decks and CVs — researched, written and quality-checked by specialists, for university students across Nigeria.",
  icons: {
    icon: "/images/logo/transparent_dark_logo.png",
    apple: "/images/logo/transparent_dark_logo.png",
  },
  openGraph: {
    title: BRAND_NAME,
    description: "Academic work, done properly.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FFFFFF" },
    { media: "(prefers-color-scheme: dark)", color: "#0B1120" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // `dark` here matches next-themes' defaultTheme so the server HTML already
    // carries it — the theme script corrects it before paint for light-mode users.
    <html
      lang="en"
      suppressHydrationWarning
      className={`dark ${inter.variable} ${jetbrainsMono.variable} ${interTight.variable} ${instrumentSerif.variable}`}
    >
      <body className="min-h-screen bg-background font-sans text-foreground">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
