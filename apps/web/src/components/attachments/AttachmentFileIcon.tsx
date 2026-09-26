import {
  File,
  FileArchive,
  FileCode2,
  FileSpreadsheet,
  FileText,
  ImageIcon,
  Music,
  Presentation,
  Video,
} from "lucide-react";
import { resolveAttachmentKind } from "@edgeever/shared";
import { cn } from "@/lib/utils";

export const AttachmentFileIcon = ({
  mimeType,
  filename,
  className,
}: {
  mimeType?: string | null;
  filename?: string | null;
  className?: string;
}) => {
  const kind = resolveAttachmentKind(mimeType, filename);
  const commonClassName = cn("h-8 w-8 shrink-0", className);

  switch (kind) {
    case "image": return <ImageIcon className={cn("text-emerald-500", commonClassName)} aria-hidden="true" />;
    case "audio": return <Music className={cn("text-sky-500", commonClassName)} aria-hidden="true" />;
    case "video": return <Video className={cn("text-rose-500", commonClassName)} aria-hidden="true" />;
    case "pdf": return <FileText className={cn("text-rose-600", commonClassName)} aria-hidden="true" />;
    case "spreadsheet": return <FileSpreadsheet className={cn("text-green-600", commonClassName)} aria-hidden="true" />;
    case "document": return <FileText className={cn("text-blue-600", commonClassName)} aria-hidden="true" />;
    case "presentation": return <Presentation className={cn("text-orange-500", commonClassName)} aria-hidden="true" />;
    case "archive": return <FileArchive className={cn("text-amber-500", commonClassName)} aria-hidden="true" />;
    case "code": return <FileCode2 className={cn("text-violet-500", commonClassName)} aria-hidden="true" />;
    case "text": return <FileText className={cn("text-slate-500", commonClassName)} aria-hidden="true" />;
    default: return <File className={cn("text-slate-400", commonClassName)} aria-hidden="true" />;
  }
};
