import type { Meta, StoryObj } from "@storybook/nextjs";
import { ThreePaneLayout } from "./three-pane-layout";

const meta: Meta = { title: "Layout/ThreePaneLayout" };
export default meta;
type Story = StoryObj;

const Pane = ({ label }: { label: string }) => (
  <div className="p-3 font-ui text-2xs font-semibold uppercase tracking-caps text-text-tertiary">
    {label}
  </div>
);

export const WithInspector: Story = {
  render: () => (
    <div className="h-[460px] overflow-hidden rounded-lg border border-border-subtle">
      <ThreePaneLayout
        nav={<Pane label="Nav" />}
        list={<Pane label="List" />}
        detail={
          <div className="p-4">
            <h2 className="m-0 font-ui text-md font-semibold text-text-primary">Detail</h2>
            <p className="font-ui text-sm text-text-secondary">Selected entity renders here.</p>
          </div>
        }
        inspector={<Pane label="Inspector" />}
      />
    </div>
  ),
};

export const WithoutInspector: Story = {
  render: () => (
    <div className="h-[460px] overflow-hidden rounded-lg border border-border-subtle">
      <ThreePaneLayout
        nav={<Pane label="Nav" />}
        list={<Pane label="List" />}
        detail={<Pane label="Detail" />}
      />
    </div>
  ),
};
