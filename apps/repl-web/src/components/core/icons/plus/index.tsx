import { Path, Svg, type IconProps } from "../_internal";

export default function IconPlus(props: IconProps) {
  return (
    <Svg {...props}>
      <Path d="M12 2 L12 22 M2 12 L22 12" />
    </Svg>
  );
}
