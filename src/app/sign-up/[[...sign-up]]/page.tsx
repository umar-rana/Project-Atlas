"use client";

import { SignUp } from "@clerk/nextjs";

const darkAppearance = {
  variables: {
    colorBackground: "#16181d",
    colorInputBackground: "#1e2028",
    colorText: "#e2e5ed",
    colorTextSecondary: "#8b92a5",
    colorInputText: "#e2e5ed",
    colorPrimary: "#4f8ef7",
    colorDanger: "#ef4444",
    borderRadius: "0.5rem",
  },
  elements: {
    card: "shadow-xl border border-white/8",
    formButtonPrimary: "bg-accent-primary hover:opacity-90",
  },
};

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-base px-6">
      <div className="flex flex-col items-center gap-8">
        <div className="text-center">
          <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-xl bg-accent-primary shadow-2">
            <span className="text-2xl font-bold text-text-on-accent">A</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-text-primary">
            Create your Atlas account
          </h1>
          <p className="mt-2 text-sm text-text-secondary">
            Your personal productivity command center
          </p>
        </div>
        <SignUp
          appearance={darkAppearance}
          fallbackRedirectUrl="/tasks"
        />
      </div>
    </div>
  );
}
