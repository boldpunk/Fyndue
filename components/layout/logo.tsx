import { useId } from "react";
import { cn } from "@/lib/utils/cn";

/** The Fyndue mark: an F whose bars step down like a debt going to zero, and a mint "paid" dot (brand kit, 512 grid). */
export function LogoMark({ className }: { className?: string }) {
  const id = useId();
  return (
    <svg viewBox="0 0 512 512" aria-hidden className={cn("size-7", className)}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="512" y2="512" gradientUnits="userSpaceOnUse">
          <stop stopColor="#6B5BFF" />
          <stop offset="1" stopColor="#3A22D9" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="120" fill={`url(#${id})`} />
      <path
        d="M188 120H332A36 36 0 0 1 368 156V156A36 36 0 0 1 332 192H224V220H276A36 36 0 0 1 312 256V256A36 36 0 0 1 276 292H224V356A36 36 0 0 1 188 392V392A36 36 0 0 1 152 356V156A36 36 0 0 1 188 120Z"
        fill="#fff"
      />
      <circle cx="332" cy="356" r="36" fill="#3DDCAB" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark />
      <span className="text-[17px] font-semibold tracking-tight">Fyndue</span>
    </span>
  );
}
