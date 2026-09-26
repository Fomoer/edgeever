import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/utils";

type MemoTitleInputProps = {
  ariaLabel?: string;
  className?: string;
  onValueChange: (value: string) => void;
  placeholder: string;
  readOnly?: boolean;
  value: string;
} & Omit<ComponentPropsWithoutRef<"input">, "onChange" | "value">;

export const MemoTitleInput = ({
  ariaLabel,
  className,
  onValueChange,
  placeholder,
  readOnly = false,
  value,
  ...props
}: MemoTitleInputProps) => (
  <input
    {...props}
    aria-label={ariaLabel ?? placeholder}
    className={cn(
      "block w-full rounded-md border-0 bg-transparent px-2 py-1 text-sm font-semibold leading-tight text-slate-900 outline-none transition placeholder:text-slate-300 hover:bg-slate-100/60 focus-visible:bg-muted focus-visible:shadow-[inset_3px_0_0_var(--brand-green)] read-only:text-slate-600 read-only:hover:bg-transparent read-only:focus-visible:bg-transparent read-only:focus-visible:shadow-none sm:text-base",
      className
    )}
    maxLength={160}
    onChange={(event) => onValueChange(event.target.value)}
    placeholder={placeholder}
    readOnly={readOnly}
    value={value}
  />
);
