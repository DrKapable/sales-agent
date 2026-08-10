import Image from "next/image";

export function BrandLogo({ priority = false, compact = false }: { priority?: boolean; compact?: boolean }) {
  return <Image
    className={compact ? "brandLogoImage compact" : "brandLogoImage"}
    src="/medminds-logo.png"
    alt="MedMinds Learning Centre"
    width={614}
    height={260}
    sizes={compact ? "150px" : "190px"}
    priority={priority}
  />;
}
