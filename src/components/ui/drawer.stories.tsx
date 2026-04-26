import type { Meta, StoryObj } from "@storybook/nextjs";
import * as React from "react";
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
  DrawerClose,
} from "./drawer";
import { Button } from "./button";

const meta: Meta = { title: "Primitives/Drawer" };
export default meta;
type Story = StoryObj;

export const RightSide: Story = {
  render: () => {
    const [pinned, setPinned] = React.useState(false);
    return (
      <Drawer>
        <DrawerTrigger asChild>
          <Button variant="secondary">Open drawer</Button>
        </DrawerTrigger>
        <DrawerContent>
          <DrawerHeader pinned={pinned} onTogglePin={() => setPinned((v) => !v)}>
            <DrawerTitle>Project details</DrawerTitle>
          </DrawerHeader>
          <DrawerBody>
            <p className="text-sm text-text-secondary">
              Drawer is pinnable. Pin keeps it open across navigation.
            </p>
          </DrawerBody>
          <DrawerFooter>
            <DrawerClose asChild>
              <Button variant="ghost">Close</Button>
            </DrawerClose>
            <Button>Apply</Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    );
  },
};

export const LeftSide: Story = {
  render: () => (
    <Drawer>
      <DrawerTrigger asChild>
        <Button variant="secondary">Open left drawer</Button>
      </DrawerTrigger>
      <DrawerContent side="left">
        <DrawerHeader>
          <DrawerTitle>Navigation</DrawerTitle>
        </DrawerHeader>
        <DrawerBody>Navigation tree goes here.</DrawerBody>
      </DrawerContent>
    </Drawer>
  ),
};
