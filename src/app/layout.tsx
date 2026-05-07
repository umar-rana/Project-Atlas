import type { Metadata, Viewport } from "next";
import { Inter, Source_Serif_4, JetBrains_Mono } from "next/font/google";
import { cookies } from "next/headers";
import { ClerkProvider } from "@clerk/nextjs";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { ThemeCookieSync } from "@/components/providers/theme-cookie-sync";
import { TRPCProvider } from "@/components/providers/trpc-provider";
import { Toaster } from "@/components/ui/toast";
import "./globals.css";

const fontUi = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-ui",
});

const fontReading = Source_Serif_4({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-reading",
});

const fontMono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-mono",
});

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#1c1c22" },
    { media: "(prefers-color-scheme: light)", color: "#fafafc" },
  ],
};

export const metadata: Metadata = {
  title: "Atlas",
  description: "Personal productivity command center.",
  icons: {
    icon: "/icon.png",
    apple: "/apple-icon.png",
  },
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Atlas",
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}): Promise<React.ReactElement> {
  const cookieStore = await cookies();
  const themeCookie = cookieStore.get("atlas_theme")?.value;
  const defaultTheme =
    themeCookie === "light" || themeCookie === "dark" || themeCookie === "system"
      ? themeCookie
      : "dark";

  return (
    <ClerkProvider
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      signInFallbackRedirectUrl="/tasks"
      signUpFallbackRedirectUrl="/tasks"
    >
      <html
        lang="en"
        suppressHydrationWarning
        className={`${fontUi.variable} ${fontReading.variable} ${fontMono.variable}`}
      >
        <body className="bg-surface-base font-ui text-text-primary">
          <a
            href="#main-content"
            className="sr-only focus-visible:not-sr-only focus-visible:absolute focus-visible:left-2 focus-visible:top-2 focus-visible:z-50 focus-visible:rounded-md focus-visible:bg-surface-base focus-visible:px-4 focus-visible:py-2 focus-visible:text-sm focus-visible:font-medium focus-visible:text-text-primary focus-visible:ring-2 focus-visible:ring-border-focus"
          >
            Skip to main content
          </a>
          <ThemeProvider
            attribute="data-theme"
            defaultTheme={defaultTheme}
            enableSystem
            disableTransitionOnChange
          >
            <ThemeCookieSync />
            <TRPCProvider>{children}</TRPCProvider>
            <Toaster />
          </ThemeProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
