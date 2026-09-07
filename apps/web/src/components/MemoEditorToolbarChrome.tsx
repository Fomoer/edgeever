import { forwardRef, type ComponentPropsWithoutRef } from "react";
import { MEMO_EDITOR_TOOLBAR_PADDING_CLASS_NAME } from "@/components/MemoEditorChromeDensity";
import { cn } from "@/lib/utils";

export const MemoEditorToolbarRow = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<"div">
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "flex min-w-0 max-w-full flex-wrap items-center gap-1",
      MEMO_EDITOR_TOOLBAR_PADDING_CLASS_NAME,
      className,
    )}
    {...props}
  />
));

MemoEditorToolbarRow.displayName = "MemoEditorToolbarRow";

export const MemoEditorToolbarDivider = ({ className }: { className?: string }) => (
  <span aria-hidden="true" className={cn("h-5 w-px shrink-0 bg-slate-200", className)} />
);
