import type { Meta, StoryObj } from "@storybook/nextjs";
import { Label } from "./label";
import { Input } from "./input";

const meta: Meta<typeof Label> = { title: "Primitives/Label", component: Label };
export default meta;
type Story = StoryObj<typeof Label>;

export const WithInput: Story = {
  render: () => (
    <div className="flex w-80 flex-col gap-1">
      <Label htmlFor="project-name" required>
        Project name
      </Label>
      <Input id="project-name" placeholder="Atlas" />
    </div>
  ),
};
