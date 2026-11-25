import { Fragment } from "react";
import type { ComponentProps, ElementType, ReactNode } from "react";
import s from "./style.module.css";

type ButtonOwnProps<T extends ElementType = "button"> = {
  as?: T;
  variant?: "primary" | "secondary" | "tertiary";
  children: ReactNode;
  shorcutKeys?: string[];
  iconOnly?: boolean;
};

type ButtonProps<T extends ElementType = "button"> = ButtonOwnProps<T> &
  Omit<ComponentProps<T>, keyof ButtonOwnProps<T>>;

export default function Button<T extends ElementType = "button">({
  as,
  variant = "secondary",
  className = "",
  children,
  shorcutKeys,
  iconOnly = false,
  ...props
}: ButtonProps<T>) {
  const Component = as || "button";

  return (
    <Component
      {...props}
      className={[s.button, className].filter(Boolean).join(" ")}
      data-variant={variant}
      data-icon-only={iconOnly}
    >
      {children}
      {shorcutKeys && (
        <span className={s.shortcut} aria-hidden="true">
          {shorcutKeys.map((key, i) => (
            <Fragment key={key}>
              <kbd>{key}</kbd>
              {i < shorcutKeys.length - 1 && " + "}
            </Fragment>
          ))}
        </span>
      )}
    </Component>
  );
}
