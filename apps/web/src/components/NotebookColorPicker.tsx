import { useEffect, useState } from "react";
import { isNotebookColor } from "@edgeever/shared";
import { cn } from "@/lib/utils";

const PALETTE_KEY = "edgeever.notebook-color-palette";
const DEFAULT_PALETTE = ["#2563eb", "#16a34a", "#ca8a04", "#dc2626", "#7c3aed"];

const readPalette = (): string[] => {
  try {
    const saved: unknown = JSON.parse(
      localStorage.getItem(PALETTE_KEY) ?? "null",
    );
    if (
      Array.isArray(saved) &&
      saved.length === 5 &&
      saved.every(isNotebookColor)
    )
      return saved;
  } catch {
    /* Use defaults if local preferences are unavailable. */
  }
  return [...DEFAULT_PALETTE];
};

export const NotebookColorPicker = ({
  label,
  value,
  fallback,
  onChange,
}: {
  label: string;
  value: string;
  fallback: string;
  onChange: (color: string) => void;
}) => {
  const [palette, setPalette] = useState(readPalette);
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);

  useEffect(() => {
    const refresh = (event: Event) => {
      const next: unknown = event instanceof CustomEvent ? event.detail : null;
      setPalette(
        Array.isArray(next) && next.length === 5 && next.every(isNotebookColor)
          ? next
          : readPalette(),
      );
    };
    window.addEventListener("notebook-palette-change", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("notebook-palette-change", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const updateColor = (color: string) => {
    onChange(color);
    if (selectedSlot === null) return;
    const next = [...palette];
    next[selectedSlot] = color;
    setPalette(next);
    try {
      localStorage.setItem(PALETTE_KEY, JSON.stringify(next));
    } catch {
      /* Color selection still works when storage is unavailable. */
    }
    window.dispatchEvent(
      new CustomEvent("notebook-palette-change", { detail: next }),
    );
  };

  return (
    <div
      data-notebook-color-picker={label}
      className="flex shrink-0 items-center gap-2"
    >
      {palette.map((color, index) => (
        <button
          key={index}
          type="button"
          aria-label={`${label} ${index + 1}: ${color}`}
          aria-pressed={value.toLowerCase() === color.toLowerCase()}
          onClick={() => {
            setSelectedSlot(index);
            onChange(color);
          }}
          className={cn(
            "h-5 w-5 shrink-0 rounded-full border border-black/10 transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-2",
            value.toLowerCase() === color.toLowerCase() &&
              "ring-2 ring-slate-400 ring-offset-2 ring-offset-card",
          )}
          style={{ backgroundColor: color }}
        />
      ))}
      <input
        type="color"
        aria-label={label}
        value={isNotebookColor(value) ? value : fallback}
        onChange={(event) => updateColor(event.target.value)}
        className="ml-1 h-8 w-10 cursor-pointer overflow-hidden rounded-md border border-slate-200 bg-card p-1 [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-sm [&::-webkit-color-swatch]:border-0"
      />
    </div>
  );
};
