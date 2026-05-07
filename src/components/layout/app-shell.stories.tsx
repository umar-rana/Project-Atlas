import type { Meta, StoryObj } from "@storybook/nextjs";
import * as React from "react";
import { Bell, Calendar, Inbox, Layers, ListTodo, Settings, StickyNote, Users } from "lucide-react";
import { AppShell } from "./app-shell";
import { ModuleSwitcher } from "./module-switcher";
import { TopBar } from "./top-bar";
import { ThreePaneLayout } from "./three-pane-layout";
import { PageHeader } from "./page-header";
import { Avatar } from "@/components/ui/avatar";
import { IconButton } from "@/components/ui/icon-button";
import { Button } from "@/components/ui/button";
import { InspectorPanel } from "@/components/composed/inspector-panel";

const meta: Meta = { title: "Layout/AppShell", parameters: { layout: "fullscreen" } };
export default meta;
type Story = StoryObj;

export const Default: Story = {
  render: () => {
    const [active, setActive] = React.useState("today");
    return (
      <div className="h-[680px] overflow-hidden">
        <AppShell
          rail={
            <ModuleSwitcher
              active={active}
              onChange={setActive}
              brand={<Layers size={18} className="text-accent-primary" aria-hidden />}
              footer={<Avatar size="sm" initials="AT" />}
              items={[
                { id: "today", label: "Today", icon: Calendar },
                { id: "inbox", label: "Inbox", icon: Inbox, badgeCount: 5 },
                { id: "tasks", label: "Tasks", icon: ListTodo },
                { id: "notes", label: "Notes", icon: StickyNote },
                { id: "people", label: "People", icon: Users },
              ]}
            />
          }
          topBar={
            <TopBar
              leading={<span className="font-ui text-sm font-semibold">Atlas / Today</span>}
              onOpenSearch={() => {}}
              trailing={
                <>
                  <IconButton aria-label="Notifications">
                    <Bell size={14} />
                  </IconButton>
                  <IconButton aria-label="Settings">
                    <Settings size={14} />
                  </IconButton>
                  <Avatar size="sm" initials="AT" />
                </>
              }
            />
          }
        >
          <ThreePaneLayout
            nav={
              <div className="p-3">
                <p className="m-0 font-ui text-2xs font-semibold uppercase tracking-caps text-text-tertiary">
                  Workspaces
                </p>
              </div>
            }
            list={
              <ul className="flex flex-col">
                {["Inbox", "Today", "This week", "Archive"].map((label) => (
                  <li
                    key={label}
                    className="flex h-8 cursor-pointer items-center gap-2 border-b border-border-subtle px-3 text-sm text-text-primary hover:bg-surface-hover"
                  >
                    {label}
                  </li>
                ))}
              </ul>
            }
            detail={
              <div>
                <PageHeader
                  title="Today"
                  description="Wave 0 ships only the design system. Modules light up in Wave 1+."
                  actions={<Button>New task</Button>}
                />
              </div>
            }
            inspector={<InspectorPanel title="Details" subtitle="Nothing selected" />}
          />
        </AppShell>
      </div>
    );
  },
};
