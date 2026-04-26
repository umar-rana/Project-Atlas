import type { Meta, StoryObj } from "@storybook/nextjs";
import { Card, CardBody, CardFooter, CardHeader, CardSubtitle, CardTitle } from "./card";
import { Button } from "./button";

const meta: Meta<typeof Card> = { title: "Primitives/Card", component: Card };
export default meta;
type Story = StoryObj<typeof Card>;

export const Default: Story = {
  render: () => (
    <Card className="w-80">
      <CardHeader>
        <div>
          <CardTitle>Q4 launch plan</CardTitle>
          <CardSubtitle>Updated 2 hours ago</CardSubtitle>
        </div>
      </CardHeader>
      <CardBody>
        Outline the launch motion across product, marketing, and support; assign owners by Friday.
      </CardBody>
      <CardFooter>
        <span className="text-xs text-text-tertiary">3 collaborators</span>
        <Button size="sm" variant="ghost">Open</Button>
      </CardFooter>
    </Card>
  ),
};

export const Interactive: Story = {
  render: () => (
    <div className="flex gap-3">
      <Card interactive className="w-60"><CardTitle>Hoverable</CardTitle></Card>
      <Card selected className="w-60"><CardTitle>Selected</CardTitle></Card>
    </div>
  ),
};
