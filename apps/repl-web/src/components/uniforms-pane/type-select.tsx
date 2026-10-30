import { Select } from "@base-ui/react/select";
import { useId } from "react";
import type { UniformType } from "./types";
import s from "./style.module.css";

const TYPE_OPTIONS: ReadonlyArray<{ label: string; value: UniformType }> = [
  { label: "Float", value: "float" },
  { label: "Color", value: "color" },
];

interface TypeSelectProps {
  value: UniformType;
  uniformName: string;
  onChange: (value: UniformType) => void;
}

export function TypeSelect({
  value,
  uniformName,
  onChange,
}: TypeSelectProps) {
  const labelPrefix = useId().replaceAll(":", "");
  const typeLabelId = `${labelPrefix}-type-label`;
  const contextLabelId = `${labelPrefix}-type-context`;
  const contextLabel = `Type for ${uniformName || "unnamed uniform"}`;

  return (
    <div className={s.field}>
      <Select.Root<UniformType>
        value={value}
        items={TYPE_OPTIONS}
        onValueChange={(nextValue) => {
          if (nextValue) onChange(nextValue);
        }}
      >
        <span className={s.fieldLabel} id={typeLabelId}>
          Type
        </span>
        <span className={s.srOnly} id={contextLabelId}>
          {contextLabel}
        </span>
        <Select.Trigger
          className={s.selectTrigger}
          aria-labelledby={`${typeLabelId} ${contextLabelId}`}
        >
          <Select.Value />
          <Select.Icon className={s.selectIcon} aria-hidden="true">
            ▾
          </Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Positioner className={s.selectPositioner} sideOffset={4}>
            <Select.Popup className={s.selectPopup}>
              <Select.List>
                {TYPE_OPTIONS.map((option) => (
                  <Select.Item
                    className={s.selectItem}
                    key={option.value}
                    value={option.value}
                    label={option.label}
                  >
                    <Select.ItemText>{option.label}</Select.ItemText>
                    <Select.ItemIndicator
                      className={s.selectIndicator}
                      aria-hidden="true"
                    >
                      ✓
                    </Select.ItemIndicator>
                  </Select.Item>
                ))}
              </Select.List>
            </Select.Popup>
          </Select.Positioner>
        </Select.Portal>
      </Select.Root>
    </div>
  );
}
