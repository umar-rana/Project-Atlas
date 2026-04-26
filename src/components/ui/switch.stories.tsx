import type { Meta, StoryObj } from "@storybook/nextjs";
import { Switch } from "./switch";
import { Label } from "./label";

const meta: Meta<typeof Switch> = { title: "Primitives/Switch", component: Switch };
export default meta;
type Story = StoryObj<typeof Switch>;

export const States: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Switch id="s1" />
        <Label htmlFor="s1">Off</Label>
      </div>
      <div className="flex items-center gap-2">
        <Switch id="s2" defaultChecked />
        <Label htmlFor="s2">On</Label>
      </div>
      <div className="flex items-center gap-2">
        <Switch id="s3" disabled />
        <Label htmlFor="s3">Disabled</Label>
      </div>
      <div className="flex items-center gap-2">
        <Switch id="s4" size="md" defaultChecked />
        <Label htmlFor="s4">Medium</Label>
      </div>
    </div>
  ),
};
