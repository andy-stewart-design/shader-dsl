import { Tabs } from "@base-ui/react/tabs";
import Button from "#/components/core/button";
import { SplitButton } from "#/components/core/split-button";
import s from "./style.module.css";

interface EditorHeaderProps {
  onApply: () => void;
  onSave: () => void;
  onSaveCopy: () => void;
  onLibrary: () => void;
  saving: boolean;
}

export default function EditorHeader({
  onApply,
  onSave,
  onSaveCopy,
  onLibrary,
  saving,
}: EditorHeaderProps) {
  return (
    <div className={s.header}>
      <Tabs.List className={s.tabList} activateOnFocus>
        <Tabs.Tab className={s.tab} value="main">
          main
        </Tabs.Tab>
        <Tabs.Tab className={s.tab} value="utils">
          utils
        </Tabs.Tab>
        <Tabs.Tab className={s.tab} value="uniforms">
          uniforms
        </Tabs.Tab>
      </Tabs.List>
      <div className={s.actions}>
        <Button onClick={onApply}>Run</Button>
        <SplitButton.Root>
          <SplitButton.Primary onClick={onSave}>Save</SplitButton.Primary>
          <SplitButton.Popover aria-label="More save options" disabled={saving}>
            <SplitButton.PopoverItem onClick={onSaveCopy}>
              Save as copy
            </SplitButton.PopoverItem>
          </SplitButton.Popover>
        </SplitButton.Root>
        <Button onClick={onLibrary}>Library</Button>
      </div>
    </div>
  );
}
