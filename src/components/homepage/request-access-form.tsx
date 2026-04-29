"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";

export function RequestAccessForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; email?: string }>({});

  const submitMutation = trpc.waitlist.submit.useMutation({
    onSuccess: () => {
      setSubmitted(true);
    },
  });

  function validate() {
    const errors: { name?: string; email?: string } = {};
    if (!name.trim()) errors.name = "Please enter your name.";
    if (!email.trim()) {
      errors.email = "Please enter your email address.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.email = "Please enter a valid email address.";
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    submitMutation.mutate({ name: name.trim(), email: email.trim(), message: message.trim() || undefined });
  }

  if (submitted) {
    return (
      <div className="rounded-xl border border-border-subtle bg-surface-raised p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-accent-primary-subtle">
          <svg className="h-6 w-6 text-accent-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-text-primary">You&apos;re on the list</h3>
        <p className="mt-2 text-sm text-text-secondary">
          Thanks for your interest in Atlas. We&apos;ll be in touch when a spot opens up.
        </p>
      </div>
    );
  }

  const serverError =
    submitMutation.error?.data?.code === "CONFLICT"
      ? "This email is already on the waitlist."
      : submitMutation.error
        ? "Something went wrong. Please try again."
        : null;

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <div className="grid gap-4 tablet:grid-cols-2">
        <div>
          <label htmlFor="waitlist-name" className="mb-1.5 block text-sm font-medium text-text-primary">
            Name
          </label>
          <input
            id="waitlist-name"
            type="text"
            autoComplete="name"
            placeholder="Your name"
            maxLength={100}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (fieldErrors.name) setFieldErrors((p) => ({ ...p, name: undefined }));
            }}
            className={[
              "w-full rounded-lg border bg-surface-base px-4 py-2.5 text-sm text-text-primary placeholder:text-text-tertiary",
              "outline-none transition-colors focus:ring-2 focus:ring-accent-primary/30",
              fieldErrors.name ? "border-red-500" : "border-border-default focus:border-accent-primary",
            ].join(" ")}
          />
          {fieldErrors.name && (
            <p className="mt-1 text-xs text-red-500">{fieldErrors.name}</p>
          )}
        </div>
        <div>
          <label htmlFor="waitlist-email" className="mb-1.5 block text-sm font-medium text-text-primary">
            Email
          </label>
          <input
            id="waitlist-email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            maxLength={200}
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (fieldErrors.email) setFieldErrors((p) => ({ ...p, email: undefined }));
            }}
            className={[
              "w-full rounded-lg border bg-surface-base px-4 py-2.5 text-sm text-text-primary placeholder:text-text-tertiary",
              "outline-none transition-colors focus:ring-2 focus:ring-accent-primary/30",
              fieldErrors.email ? "border-red-500" : "border-border-default focus:border-accent-primary",
            ].join(" ")}
          />
          {fieldErrors.email && (
            <p className="mt-1 text-xs text-red-500">{fieldErrors.email}</p>
          )}
        </div>
      </div>

      <div>
        <label htmlFor="waitlist-message" className="mb-1.5 block text-sm font-medium text-text-primary">
          Anything else? <span className="font-normal text-text-tertiary">(optional)</span>
        </label>
        <textarea
          id="waitlist-message"
          rows={3}
          maxLength={500}
          placeholder="How do you currently manage your tasks and notes?"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="w-full resize-none rounded-lg border border-border-default bg-surface-base px-4 py-2.5 text-sm text-text-primary placeholder:text-text-tertiary outline-none transition-colors focus:border-accent-primary focus:ring-2 focus:ring-accent-primary/30"
        />
      </div>

      {serverError && (
        <p className="text-sm text-red-500">{serverError}</p>
      )}

      <button
        type="submit"
        disabled={submitMutation.isPending}
        className="rounded-lg bg-accent-primary px-6 py-2.5 text-sm font-medium text-text-on-accent transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitMutation.isPending ? "Sending…" : "Request access"}
      </button>
    </form>
  );
}
