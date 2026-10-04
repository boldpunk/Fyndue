import Link from "next/link";
import { cn } from "@/lib/utils/cn";

/** © line with the developer credit; shown on the sign-in pages and the about page. */
export function SiteFooter({ className, tone = "default" }: { className?: string; tone?: "default" | "inverted" }) {
  const year = new Date().getFullYear();
  return (
    <footer className={cn("flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center text-[13px]", tone === "inverted" ? "text-white/60" : "text-muted-foreground", className)}>
      <span>© {year} Fyndue</span>
      <span aria-hidden>·</span>
      <span>
        Разработано в{" "}
        <Link href="/about" className={cn("font-medium underline-offset-4 hover:underline", tone === "inverted" ? "text-white" : "text-foreground")}>
          Bold Studio
        </Link>
      </span>
    </footer>
  );
}
