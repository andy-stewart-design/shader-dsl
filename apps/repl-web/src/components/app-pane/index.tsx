import { Tabs } from "@base-ui/react/tabs";
import type { ReactNode } from "react";
import s from "./style.module.css";

interface AppPaneProps {
  as?: "tabs" | "div";
  background?: "primary" | "secondary";
  children: ReactNode;
}

export function AppPane({
  as = "div",
  background = "primary",
  children,
}: AppPaneProps) {
  if (as === "tabs") {
    return (
      <Tabs.Root
        className={s.pane}
        data-background={background}
        defaultValue="main"
      >
        {children}
      </Tabs.Root>
    );
  }

  return (
    <div className={s.pane} data-background={background}>
      {children}
    </div>
  );
}
