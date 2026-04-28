import type { Metadata } from "next";
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

export const metadata: Metadata = {
  title: "Atlas",
  description: "Personal productivity command center.",
  icons: {
    icon: "/icon.png",
    apple: "/apple-icon.png",
  },
  manifest: "/manifest.json",
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
        signInFallbackRedirectUrl="/tasks"
        signUpFallbackRedirectUrl="/tasks"
      >
      <html
        lang="en"
        suppressHydrationWarning
        className={`${fontUi.variable} ${fontReading.variable} ${fontMono.variable}`}
      >
        <body className="bg-surface-base text-text-primary font-ui">
          <ThemeProvider
            attribute="data-theme"
            defaultTheme={defaultTheme}
            enableSystem
            disableTransitionOnChange
          >
            <ThemeCookieSync />
            <TRPCProvider>
              {children}
            </TRPCProvider>
            <Toaster />
          </ThemeProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
