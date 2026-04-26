import type { Meta, StoryObj } from "@storybook/nextjs";
import { Badge } from "./badge";

const meta: Meta<typeof Badge> = { title: "Primitives/Badge", component: Badge };
export default meta;
type Story = StoryObj<typeof Badge>;

export const Counts: Story = {
  render: () => (
    <div className="flex items-center gap-3">
      <Badge count={3} />
      <Badge count={42} />
      <Badge count={250} />
      <Badge variant="neutral" count={8} />
      <Badge variant="danger" count={2} />
      <Badge variant="success" count={7} />
    </div>
  ),
};

export const Dots: Story = {
  render: () => (
    <div className="flex items-center gap-3">
      <Badge shape="dot" />
      <Badge shape="dot" variant="success" />
      <Badge shape="dot" variant="warning" />
      <Badge shape="dot" variant="danger" />
    </div>
  ),
};
