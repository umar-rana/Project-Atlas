"use client";

import dynamic from "next/dynamic";

const TemplatesSettingsSection = dynamic(
  () =>
    import("@/components/task-templates/templates-settings-section").then(
      (m) => m.TemplatesSettingsSection,
    ),
  { ssr: false },
);

export function TemplatesSection() {
  return (
    <div className="flex flex-col gap-6">
      <TemplatesSettingsSection />
    </div>
  );
}
