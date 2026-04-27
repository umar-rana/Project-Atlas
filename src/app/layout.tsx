import type { Metadata } from "next";
import { Inter, Source_Serif_4, JetBrains_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/providers/theme-provider";
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
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${fontUi.variable} ${fontReading.variable} ${fontMono.variable}`}
    >
      <body className="bg-surface-base text-text-primary font-ui">
        <ThemeProvider
          attribute="data-theme"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          <TRPCProvider>
            {children}
          </TRPCProvider>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
