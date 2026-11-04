import { useState, type ComponentProps, type CSSProperties } from "react";
import s from "./style.module.css";

type SliderEvent = React.ChangeEvent<HTMLInputElement, HTMLInputElement>;
type BaseProps = Omit<ComponentProps<"input">, "value" | "min" | "max">;
interface Props extends BaseProps {
  value: number;
  min: number;
  max: number;
}

export default function RangeSlider({
  value: _value,
  min,
  max,
  onChange,
  ...props
}: Props) {
  const [value, setValue] = useState(_value);

  // Calculate the percentage position of the thumb
  const percentage = ((value - min) / (max - min)) * 100;

  // Generate a dynamic gradient background
  // The left side is your active gradient, the right side is the unselected gray track
  const sliderStyle = {
    "--progress": `${percentage}%`,
    // background: `linear-gradient(to right, #4f46e5 0%, #ec4899 ${percentage}%, #e2e8f0 ${percentage}%, #e2e8f0 100%)`,
  } as CSSProperties;

  function handleChange(e: SliderEvent) {
    setValue(Number(e.target.value));
    onChange?.(e);
  }

  return (
    <input
      {...props}
      type="range"
      min={min}
      max={max}
      value={value}
      onChange={handleChange}
      className={s.slider}
      style={sliderStyle}
    />
  );
}
