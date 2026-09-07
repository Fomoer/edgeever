type MemoTitleInputProps = {
  ariaLabel?: string;
  onValueChange: (value: string) => void;
  placeholder: string;
  readOnly?: boolean;
  value: string;
};

export const MemoTitleInput = ({
  ariaLabel,
  onValueChange,
  placeholder,
  readOnly = false,
  value,
}: MemoTitleInputProps) => (
  <input
    aria-label={ariaLabel ?? placeholder}
    className="block w-full rounded-md border-0 bg-transparent text-xl font-bold leading-snug text-slate-950 outline-none transition placeholder:text-slate-300 focus-visible:bg-muted focus-visible:shadow-[inset_3px_0_0_var(--brand-green)] read-only:text-slate-600 read-only:focus-visible:bg-transparent read-only:focus-visible:shadow-none sm:text-2xl"
    maxLength={160}
    onChange={(event) => onValueChange(event.target.value)}
    placeholder={placeholder}
    readOnly={readOnly}
    value={value}
  />
);
