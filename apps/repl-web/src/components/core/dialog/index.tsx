import { useRef, type ComponentProps, type ReactNode } from "react";
import s from "./style.module.css";
import IconClose from "../icons/close";

interface Props extends ComponentProps<"dialog"> {
  type?: "modal" | "drawer";
  align?: "start" | "end";
}

function Root({
  type = "modal",
  align = "start",
  className,
  onClick,
  onPointerDown,
  onPointerCancel,
  ...props
}: Props) {
  const pointerStartedOutside = useRef(false);

  return (
    <dialog
      {...props}
      onPointerDown={(event) => {
        onPointerDown?.(event);
        const dialog = event.currentTarget;
        const bounds = dialog.getBoundingClientRect();
        pointerStartedOutside.current =
          event.target === dialog &&
          (event.clientX < bounds.left ||
            event.clientX > bounds.right ||
            event.clientY < bounds.top ||
            event.clientY > bounds.bottom);
      }}
      onPointerCancel={(event) => {
        pointerStartedOutside.current = false;
        onPointerCancel?.(event);
      }}
      onClick={(event) => {
        onClick?.(event);
        const dialog = event.currentTarget;
        const bounds = dialog.getBoundingClientRect();
        const outside =
          event.target === dialog &&
          (event.clientX < bounds.left ||
            event.clientX > bounds.right ||
            event.clientY < bounds.top ||
            event.clientY > bounds.bottom);
        if (outside && pointerStartedOutside.current && dialog.open) {
          if (typeof dialog.requestClose === "function") {
            dialog.requestClose();
          } else {
            const cancel = new Event("cancel", { cancelable: true });
            if (dialog.dispatchEvent(cancel)) dialog.close();
          }
        }
        pointerStartedOutside.current = false;
      }}
      className={cn(s.dialog, className)}
      data-type={type}
      data-align={align}
    />
  );
}

function Header({
  title,
  children,
  onClose,
}: {
  children?: ReactNode;
  title?: string;
  onClose: () => void;
}) {
  return (
    <div className={s.header}>
      <div className={s.title}>{title || children}</div>
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

const Dialog = {
  Root,
  Header,
  Content,
  Footer,
};

export default Dialog;
export { Dialog };

function cn(...classes: (string | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}
