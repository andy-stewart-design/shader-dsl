import type { ComponentProps } from "react";
import s from "./style.module.css";
import IconClose from "../icons/close";

interface Props extends ComponentProps<"dialog"> {
  type?: "modal" | "drawer";
  align?: "start" | "end";
}

export default function Dialog({
  type = "modal",
  align = "start",
  className,
  ...props
}: Props) {
  return (
    <dialog
      {...props}
      className={cn(s.dialog, className)}
      data-type={type}
      data-align={align}
    />
  );
}

function Header({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className={s.header}>
      <div className={s.title}>{title}</div>
      <button className={s.close} onClick={onClose} aria-label="Close dialog">
        <IconClose size={12} />
      </button>
    </div>
  );
}

function Content({ className, ...props }: ComponentProps<"div">) {
  return <div {...props} className={cn(s.content, className)} />;
}

function Footer({ className, ...props }: ComponentProps<"div">) {
  return <div {...props} className={cn(s.footer, className)} />;
}

const Dia = {
  Root: Dialog,
  Header,
  Content,
  Footer,
};

export { Dia as Dialog };

function cn(...classes: (string | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}
