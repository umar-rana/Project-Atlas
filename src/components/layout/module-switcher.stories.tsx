import type { Meta, StoryObj } from "@storybook/nextjs";
import * as React from "react";
import { Calendar, Inbox, Layers, ListTodo, StickyNote, Users } from "lucide-react";
import { ModuleSwitcher } from "./module-switcher";
import { Avatar } from "@/components/ui/avatar";

const meta: Meta = { title: "Layout/ModuleSwitcher" };
export default meta;
type Story = StoryObj;

export const Default: Story = {
  render: () => {
    const [active, setActive] = React.useState("today");
    return (
      <div className="h-[420px]">
        <ModuleSwitcher
          active={active}
          onChange={setActive}
          brand={<Layers size={18} className="text-accent-primary" aria-hidden />}
          footer={<Avatar size="sm" initials="AT" />}
          items={[
            { id: "today", label: "Today", icon: Calendar, shortcut: ["g", "t"] },
            { id: "inbox", label: "Inbox", icon: Inbox, shortcut: ["g", "i"], badgeCount: 5 },
            { id: "tasks", label: "Tasks", icon: ListTodo, shortcut: ["g", "k"] },
            { id: "notes", label: "Notes", icon: StickyNote, shortcut: ["g", "n"] },
            { id: "people", label: "People", icon: Users, shortcut: ["g", "p"] },
          ]}
        />
      </div>
    );
  },
};
