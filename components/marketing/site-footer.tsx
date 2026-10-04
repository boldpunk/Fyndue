import { ArrowUpRight } from "lucide-react";

const STUDIO_URL = "https://boldstudio.uz";

/**
 * © line with the studio signature, the same on every Bold Studio site:
 * "© 2026 Fyndue" on the left, the "Дизайн и разработка — @boldpunk" pill on the right.
 * The pill is always dark so the lime handle stays readable in both themes.
 */
export function SiteFooter({ className }: { className?: string }) {
  const year = new Date().getFullYear();
  return (
    <footer className={className}>
      <div className="flex flex-col items-center gap-4 border-t pt-6 text-[13px] sm:flex-row sm:justify-between">
        <span className="text-muted-foreground">© {year} Fyndue</span>
        <a
          href={STUDIO_URL}
          target="_blank"
          rel="noopener"
          className="group inline-flex items-center gap-2.5 rounded-full whitespace-nowrap border border-white/10 bg-[#0E0B24] px-4 py-2 text-[13px] text-white/85 transition-colors hover:border-white/25"
        >
          <span>
            Дизайн и разработка — <span className="font-semibold text-[#C8F135]">@boldpunk</span>
          </span>
          <span className="hidden font-mono text-xs text-white/45 min-[420px]:inline">boldstudio.uz</span>
          <ArrowUpRight className="size-3.5 text-white/60 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden />
        </a>
      </div>
    </footer>
  );
}
