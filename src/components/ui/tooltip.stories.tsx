import type { Meta, StoryObj } from "@storybook/nextjs";
import { Tooltip } from "./tooltip";
import { Button } from "./button";

const meta: Meta<typeof Tooltip> = { title: "Primitives/Tooltip", component: Tooltip };
export default meta;
type Story = StoryObj<typeof Tooltip>;

export const Basic: Story = {
  render: () => (
    <Tooltip content="Save the current draft">
      <Button>Save</Button>
    </Tooltip>
  ),
};

export const WithShortcut: Story = {
  render: () => (
    <div className="flex gap-3">
      <Tooltip content="Open command palette" shortcut={["cmd", "K"]}>
        <Button variant="secondary">Command</Button>
      </Tooltip>
      <Tooltip content="Delete project" shortcut={["backspace"]} side="bottom">
        <Button variant="ghost">Delete</Button>
      </Tooltip>
    </div>
  ),
};
