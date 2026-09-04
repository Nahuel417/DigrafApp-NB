import Image from "next/image";

import { cn } from "@/lib/utils";

export function BrandLockup({
  className,
  compact = false,
  tagline = "Operaciones internas",
  textClassName,
}: {
  className?: string;
  compact?: boolean;
  tagline?: string | null;
  textClassName?: string;
}) {
  const imageSize = compact ? 36 : 40;

  return (
    <div className={cn("flex min-w-0 items-center gap-3", className)}>
      <Image
        aria-hidden="true"
        alt=""
        className="shrink-0"
        height={imageSize}
        src="/brand/digraf-logo.png"
        width={imageSize}
      />
      <div className={cn("min-w-0", textClassName)}>
        <p className={cn("truncate font-semibold tracking-tight", compact ? "text-sm" : "text-[0.9375rem]")}>Digraf</p>
        {tagline ? <p className="truncate text-[11px] text-muted-foreground">{tagline}</p> : null}
      </div>
    </div>
  );
}
