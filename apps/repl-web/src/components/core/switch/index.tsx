import type { ComponentProps } from "react";
import s from "./style.module.css";

interface Props extends ComponentProps<"input"> {
  onSwitch?: (checked: boolean) => void;
}

export default function Switch({ onSwitch, ...props }: Props) {
  return (
    <input
      onChange={(e) => onSwitch?.(e.target.checked)}
      {...props}
      type="checkbox"
      className={s.switch}
    />
  );
}
