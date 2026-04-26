import type { Meta, StoryObj } from "@storybook/nextjs";
import { EntityLink } from "./entity-link";

const meta: Meta<typeof EntityLink> = { title: "Composed/EntityLink", component: EntityLink };
export default meta;
type Story = StoryObj<typeof EntityLink>;

export const Inline: Story = {
  render: () => (
    <p className="font-ui text-sm text-text-primary">
      Track in <EntityLink kind="project" label="Q4 Launch" /> with the spec at{" "}
      <EntityLink kind="doc" label="Launch Plan" /> and follow-up{" "}
      <EntityLink kind="task" label="Schedule retro" />.
    </p>
  ),
};

export const Kinds: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <EntityLink kind="project" label="Atlas" />
      <EntityLink kind="task" label="Ship Wave 0" />
      <EntityLink kind="note" label="Weekly review" />
      <EntityLink kind="doc" label="Spec" />
      <EntityLink kind="person" label="Alex" />
      <EntityLink kind="tag" label="research" />
    </div>
  ),
};
