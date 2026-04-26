import type { Meta, StoryObj } from "@storybook/nextjs";
import { Bell, Settings } from "lucide-react";
import { TopBar } from "./top-bar";
import { Avatar } from "@/components/ui/avatar";
import { IconButton } from "@/components/ui/icon-button";

const meta: Meta<typeof TopBar> = { title: "Layout/TopBar", component: TopBar };
export default meta;
type Story = StoryObj<typeof TopBar>;

export const Default: Story = {
  render: () => (
    <TopBar
      leading={<span className="font-ui text-sm font-semibold text-text-primary">Atlas / Today</span>}
      onOpenSearch={() => {}}
      trailing={
        <>
          <IconButton aria-label="Notifications"><Bell size={14} /></IconButton>
          <IconButton aria-label="Settings"><Settings size={14} /></IconButton>
          <Avatar size="sm" initials="AT" />
        </>
      }
    />
  ),
};
