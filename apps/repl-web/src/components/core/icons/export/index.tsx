import { Path, Svg, type IconProps } from "../_internal";

export default function IconExport(props: IconProps) {
  return (
    <Svg {...props}>
      <Path d="M12 17L12 2M5 9L12 2L19 9M4 22H20" />
    </Svg>
  );
}
