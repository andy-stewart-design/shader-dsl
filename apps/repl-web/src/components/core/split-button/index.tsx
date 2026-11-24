import { Menu } from "@base-ui/react/menu";
import Button from "#/components/core/button";
import IconChevronDown from "#/components/core/icons/chevron-down";
import s from "./style.module.css";
import type { ComponentProps, ReactNode } from "react";

function Root({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={[s.splitButton, className].filter(Boolean).join(" ")}
      {...props}
    />
  );
}

function Primary({ className, ...props }: ComponentProps<typeof Button>) {
  return (
    <Button
      {...props}
      className={[className, s.primary].filter(Boolean).join(" ")}
    />
  );
}

interface PopoverProps {
  children: ReactNode;
  "aria-label"?: string;
  disabled?: boolean;
}

function Popover({
  children,
  "aria-label": ariaLable,
  disabled,
}: PopoverProps) {
  return (
    <Menu.Root>
      <Menu.Trigger
        className={s.trigger}
        aria-label={ariaLable}
        disabled={disabled}
      >
        <IconChevronDown size={12} aria-hidden="true" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner className={s.positioner} sideOffset={4}>
          <Menu.Popup className={s.popup}>{children}</Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

function PopoverItem({
  children,
  className,
  ...props
}: ComponentProps<typeof Menu.Item>) {
  return (
    <Menu.Item
      className={[s.item, className].filter(Boolean).join(" ")}
      {...props}
    >
      {children}
    </Menu.Item>
  );
}

const Component = {
  Root,
  Primary,
  Popover,
  PopoverItem,
};

export default Component;
export { Component as SplitButton };
