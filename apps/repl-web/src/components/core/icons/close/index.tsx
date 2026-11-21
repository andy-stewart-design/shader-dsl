import { Path, Svg, type IconProps } from "../_internal";

export default function IconClose(props: IconProps) {
  return (
    <Svg {...props}>
      <Path d="M2 2 L22 22 M22 2 L2 22" />
    </Svg>
  );
}
