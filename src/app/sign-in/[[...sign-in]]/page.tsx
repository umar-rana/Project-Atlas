"use client";

import { SignIn } from "@clerk/nextjs";

const darkAppearance = {
  variables: {
    colorBackground: "var(--surface-raised)",
    colorInputBackground: "var(--surface-sunken)",
    colorText: "var(--text-primary)",
    colorTextSecondary: "var(--text-secondary)",
    colorInputText: "var(--text-primary)",
    colorPrimary: "var(--accent-primary)",
    colorDanger: "var(--accent-danger)",
    borderRadius: "var(--radius-lg)",
    fontFamily: "var(--font-ui)",
  },
  elements: {
    card: "shadow-3 border border-border-subtle",
    formButtonPrimary: "bg-accent-primary hover:opacity-90",
  },
};

export default function SignInPage() {
  return (
    <div className="font-ui flex min-h-screen items-center justify-center bg-surface-base px-6">
      <div className="flex flex-col items-center gap-8">
        <div className="text-center">
          <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-xl bg-accent-primary shadow-2">
            <span className="text-2xl font-bold text-text-on-accent">A</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-text-primary">
            Welcome to Atlas
          </h1>
          <p className="mt-2 text-sm text-text-secondary">
            Your personal productivity command center
          </p>
        </div>
        <SignIn
          appearance={darkAppearance}
          fallbackRedirectUrl="/tasks"
        />
      </div>
    </div>
  );
}
