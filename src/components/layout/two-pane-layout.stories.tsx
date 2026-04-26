import type { Meta, StoryObj } from "@storybook/nextjs";
import { TwoPaneLayout } from "./two-pane-layout";

const meta: Meta = { title: "Layout/TwoPaneLayout" };
export default meta;
type Story = StoryObj;

export const Default: Story = {
  render: () => (
    <div className="h-[420px] overflow-hidden rounded-lg border border-border-subtle">
      <TwoPaneLayout
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
          <div className="p-4">
            <h2 className="m-0 font-ui text-md font-semibold text-text-primary">Detail pane</h2>
            <p className="font-ui text-sm text-text-secondary">Selected item renders here.</p>
          </div>
        }
      />
    </div>
  ),
};
