import type { ComponentProps } from "react";

export interface IconProps extends ComponentProps<"svg"> {
  size?: number;
}

export function Svg({ size = 24, ...props }: IconProps) {
  return (
    <svg
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      {...props}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
}

export function Path(props: ComponentProps<"path">) {
  return <path {...props} vectorEffect="non-scaling-stroke" />;
}
