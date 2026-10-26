import type { ComponentType, CSSProperties } from "react";
import { DynamicIcon, iconNames, type IconName } from "lucide-react/dynamic";
import type { LucideProps } from "lucide-react";
import {
  Notebook,
  BookOpen,
  Folder,
  Archive,
  Inbox,
  Star,
  Bookmark,
  Lightbulb,
  Briefcase,
  Building2,
  ClipboardList,
  Calendar,
  Target,
  GraduationCap,
  FileText,
  Presentation,
  Network,
  Server,
  Monitor,
  Wifi,
  Smartphone,
  Code,
  Database,
  Cpu,
  Shield,
  Bot,
  House,
  Heart,
  Users,
  Gift,
  Baby,
  PawPrint,
  Utensils,
  Wrench,
  Car,
  Activity,
  Wallet,
  Landmark,
  ChartLine,
  Bitcoin,
  Receipt,
  PiggyBank,
  Plane,
  Map,
  Camera,
  Music,
  Gamepad2,
  Bike,
  Dumbbell,
  Newspaper,
  Globe,
  Coffee,
} from "lucide-react";
import {
  isNotebookColor,
  readableNotebookColor,
  type NotebookAppearance,
} from "@edgeever/shared";
import { cn } from "@/lib/utils";

export const notebookIconComponents = {
  notebook: Notebook,
  "book-open": BookOpen,
  folder: Folder,
  archive: Archive,
  inbox: Inbox,
  star: Star,
  bookmark: Bookmark,
  lightbulb: Lightbulb,
  briefcase: Briefcase,
  "building-2": Building2,
  "clipboard-list": ClipboardList,
  calendar: Calendar,
  target: Target,
  "graduation-cap": GraduationCap,
  "file-text": FileText,
  presentation: Presentation,
  network: Network,
  server: Server,
  monitor: Monitor,
  wifi: Wifi,
  smartphone: Smartphone,
  code: Code,
  database: Database,
  cpu: Cpu,
  shield: Shield,
  bot: Bot,
  house: House,
  heart: Heart,
  users: Users,
  gift: Gift,
  baby: Baby,
  "paw-print": PawPrint,
  utensils: Utensils,
  wrench: Wrench,
  car: Car,
  activity: Activity,
  wallet: Wallet,
  landmark: Landmark,
  "chart-line": ChartLine,
  bitcoin: Bitcoin,
  receipt: Receipt,
  "piggy-bank": PiggyBank,
  plane: Plane,
  map: Map,
  camera: Camera,
  music: Music,
  "gamepad-2": Gamepad2,
  bike: Bike,
  dumbbell: Dumbbell,
  newspaper: Newspaper,
  globe: Globe,
  coffee: Coffee,
};

const availableIconNames = new Set<string>(iconNames);
const dynamicComponents = new globalThis.Map<
  string,
  ComponentType<LucideProps>
>();

export const getNotebookIcon = (
  name: string | null,
): ComponentType<LucideProps> => {
  const builtIn =
    name && Object.hasOwn(notebookIconComponents, name)
      ? notebookIconComponents[name as keyof typeof notebookIconComponents]
      : undefined;
  if (builtIn) return builtIn;
  if (!name || !availableIconNames.has(name)) return Notebook;
  let component = dynamicComponents.get(name);
  if (!component) {
    const iconName = name as IconName;
    component = (props: LucideProps) => (
      <DynamicIcon
        {...props}
        name={iconName}
        fallback={() => <Notebook {...props} />}
      />
    );
    dynamicComponents.set(name, component);
  }
  return component;
};

export const notebookRowStyle = (
  notebook: NotebookAppearance,
): CSSProperties | undefined =>
  notebook.rowInverted
    ? {
        backgroundColor: readableNotebookColor(
          notebook.color ?? "#64748b",
          false,
        ),
        color: "#fff",
      }
    : undefined;

export const NotebookAppearanceContent = ({
  notebook,
  selected = false,
}: {
  notebook: NotebookAppearance & { name: string };
  selected?: boolean;
}) => {
  const Icon = getNotebookIcon(notebook.icon);
  const iconInverted = notebook.iconInverted && !notebook.rowInverted;
  const iconColored = !notebook.rowInverted && isNotebookColor(notebook.color);
  const textColored =
    !notebook.rowInverted && isNotebookColor(notebook.textColor);
  const iconStyle =
    iconColored || iconInverted
      ? ({
          "--notebook-color-light": readableNotebookColor(
            notebook.color ?? "#64748b",
            false,
          ),
          "--notebook-color-dark": readableNotebookColor(
            notebook.color ?? "#64748b",
            true,
          ),
        } as CSSProperties)
      : undefined;
  const textStyle = textColored
    ? ({
        "--notebook-color-light": readableNotebookColor(
          notebook.textColor!,
          false,
        ),
        "--notebook-color-dark": readableNotebookColor(
          notebook.textColor!,
          true,
        ),
      } as CSSProperties)
    : undefined;
  return (
    <>
      <span
        className="flex h-6 w-6 shrink-0 items-center justify-center"
        aria-hidden="true"
      >
        <Icon
          data-notebook-icon={notebook.icon ?? "notebook"}
          aria-hidden="true"
          strokeWidth={2.35}
          style={iconStyle}
          className={cn(
            "shrink-0 transition-colors duration-200",
            iconInverted ? "h-6 w-6" : "h-4 w-4",
            notebook.rowInverted
              ? "!text-white"
              : iconInverted
                ? "notebook-inverted-icon"
                : iconColored
                  ? "notebook-custom-color"
                  : selected
                    ? "text-slate-950"
                    : "text-slate-500",
          )}
          data-notebook-icon-inverted={iconInverted || undefined}
        />
      </span>
      <span
        data-notebook-name
        style={textStyle}
        className={cn(
          "truncate transition-colors duration-200",
          notebook.isBold ? "font-bold" : "font-normal",
          notebook.rowInverted
            ? "!text-white"
            : textColored
              ? "notebook-custom-color"
              : selected
                ? "text-black dark:text-slate-950"
                : "text-slate-800 group-hover:text-slate-950",
        )}
      >
        {notebook.name}
      </span>
    </>
  );
};
