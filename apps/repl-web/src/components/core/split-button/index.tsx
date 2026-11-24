import { Menu } from "@base-ui/react/menu";
import Button from "#/components/core/button";
import IconChevronDown from "#/components/core/icons/chevron-down";
import s from "./style.module.css";

interface SplitButtonProps {
  primaryLabel: string;
  onPrimaryAction: () => void;
  menuLabel: string;
  secondaryActions: Array<{ label: string; onSelect: () => void }>;
  disabled?: boolean;
}

export default function SplitButton({
  primaryLabel,
  onPrimaryAction,
  menuLabel,
  secondaryActions,
  disabled = false,
}: SplitButtonProps) {
  return (
    <div className={s.splitButton}>
      <Button
        className={s.primary}
        type="button"
        onClick={onPrimaryAction}
        disabled={disabled}
      >
        {primaryLabel}
      </Button>
      <Menu.Root>
        <Menu.Trigger
          className={s.trigger}
          aria-label={menuLabel}
          disabled={disabled}
        >
          <IconChevronDown size={12} aria-hidden="true" />
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner className={s.positioner} sideOffset={4}>
            <Menu.Popup className={s.popup}>
              {secondaryActions.map(({ label, onSelect }) => (
                <Menu.Item className={s.item} key={label} onClick={onSelect}>
                  {label}
                </Menu.Item>
              ))}
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
    </div>
  );
}
