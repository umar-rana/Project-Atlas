import * as React from "react";
import type { Preview, Decorator } from "@storybook/react";
import { Inter, Source_Serif_4, JetBrains_Mono } from "next/font/google";
import "../src/app/globals.css";

const fontUi = Inter({ subsets: ["latin"], variable: "--font-ui", display: "swap" });
const fontReading = Source_Serif_4({ subsets: ["latin"], variable: "--font-reading", display: "swap" });
const fontMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

const withTheme: Decorator = (Story, context) => {
  const theme = (context.globals.theme as "dark" | "light") ?? "dark";
  React.useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.classList.add(fontUi.variable, fontReading.variable, fontMono.variable);
  }, [theme]);
  return (
    <div
      className={`${fontUi.variable} ${fontReading.variable} ${fontMono.variable} bg-surface-base text-text-primary font-ui min-h-[100dvh] p-6`}
      data-theme={theme}
    >
      <Story />
    </div>
  );
};

const preview: Preview = {
  parameters: {
    layout: "padded",
    backgrounds: { disable: true },
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
  },
  globalTypes: {
    theme: {
      description: "Atlas theme",
      defaultValue: "dark",
      toolbar: {
        title: "Theme",
        icon: "circlehollow",
        items: [
          { value: "dark", title: "Dark", icon: "moon" },
          { value: "light", title: "Light", icon: "sun" },
        ],
        dynamicTitle: true,
      },
    },
  },
  decorators: [withTheme],
};

export default preview;
