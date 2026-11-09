import type { ReactNode } from "react";
import s from "./style.module.css";

export interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  return <main className={s.main}>{children}</main>;
}
