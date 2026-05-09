"use client";

export function SectionHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-6">
      <h2 className="font-ui text-xl font-semibold text-text-primary">{title}</h2>
      {description && <p className="mt-1 font-ui text-sm text-text-secondary">{description}</p>}
    </div>
  );
}

export function PlaceholderSection({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col gap-6">
      <SectionHeader title={title} description={description} />
      <div className="border-border-dashed rounded-xl border border-dashed bg-surface-sunken px-6 py-10 text-center">
        <p className="font-ui text-sm text-text-tertiary">Coming in a future wave</p>
      </div>
    </div>
  );
}
