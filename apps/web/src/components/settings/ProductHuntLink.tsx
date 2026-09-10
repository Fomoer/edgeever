import { ExternalLink } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

const PRODUCT_HUNT_URL =
  "https://www.producthunt.com/products/edgeever?launch=edgeever&utm_source=edgeever&utm_medium=settings&utm_campaign=product_hunt";

const ProductHuntMark = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
    <path
      fill="#DA552F"
      d="M13.604 8.4h-3.405V12h3.405c.995 0 1.801-.806 1.801-1.801 0-.993-.806-1.799-1.801-1.799zM12 0C5.372 0 0 5.372 0 12s5.372 12 12 12 12-5.372 12-12S18.628 0 12 0zm1.604 14.4h-3.405V18H8.4V6h5.204c2.316 0 4.2 1.882 4.2 4.2 0 2.319-1.884 4.2-4.2 4.2z"
    />
  </svg>
);

export const ProductHuntLink = ({ className }: { className?: string }) => {
  const { t } = useTranslation();

  return (
    <a
      className={cn(
        "flex min-h-16 w-full items-center justify-between gap-3 rounded-xl px-4 py-2.5 text-left text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-200/50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/70",
        className
      )}
      href={PRODUCT_HUNT_URL}
      target="_blank"
      rel="noopener noreferrer"
    >
      <span className="flex min-w-0 items-center gap-3 lg:gap-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 lg:h-4 lg:w-4 lg:rounded-none lg:bg-transparent">
          <ProductHuntMark className="h-4 w-4" />
        </span>
        <span className="min-w-0">
          <span className="block truncate">{t("productHunt.title")}</span>
          <span className="mt-0.5 block truncate text-xs font-normal text-slate-500">{t("productHunt.description")}</span>
        </span>
      </span>
      <ExternalLink className="h-4 w-4 shrink-0 text-slate-400" />
    </a>
  );
};
