import type { Meta, StoryObj } from "@storybook/nextjs";
import * as React from "react";
import { InspectorPanel } from "./inspector-panel";
import { StatusPill } from "@/components/ui/status-pill";
import { Tag } from "@/components/ui/tag";

const meta: Meta = { title: "Composed/InspectorPanel" };
export default meta;
type Story = StoryObj;

export const Default: Story = {
  render: () => {
    const [pinned, setPinned] = React.useState(false);
    return (
      <div className="h-[460px] w-80 overflow-hidden rounded-lg border border-border-subtle">
        <InspectorPanel
          title="Q4 Launch plan"
          subtitle="Project · 12 tasks"
          pinned={pinned}
          onTogglePin={() => setPinned((v) => !v)}
          onClose={() => {}}
          sections={[
            {
              id: "status",
              title: "Status",
              children: (
                <div className="flex flex-col gap-2">
                  <StatusPill status="active" />
                  <p className="font-ui text-xs text-text-secondary">Owned by Alex.</p>
                </div>
              ),
            },
            {
              id: "tags",
              title: "Tags",
              children: (
                <div className="flex flex-wrap gap-1">
                  <Tag family="purpose" hue={1}>
                    marketing
                  </Tag>
                  <Tag family="purpose" hue={3}>
                    q4
                  </Tag>
                </div>
              ),
            },
            {
              id: "notes",
              title: "Notes",
              defaultOpen: false,
              children: (
                <p className="font-ui text-xs text-text-secondary">Plan retro for Friday.</p>
              ),
            },
          ]}
        />
      </div>
    );
  },
};
