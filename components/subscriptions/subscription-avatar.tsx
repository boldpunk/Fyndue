import { subscriptionAvatar } from "@/lib/constants/subscriptions";
import { cn } from "@/lib/utils/cn";

/** Coloured initials for a subscription (no third-party logos). */
export function SubscriptionAvatar({ name, className }: { name: string; className?: string }) {
  const { color, initials } = subscriptionAvatar(name);
  return (
    <span
      aria-hidden
      className={cn("grid size-10 shrink-0 place-items-center rounded-xl text-[13px] font-semibold tracking-tight text-white", className)}
      style={{ backgroundColor: color }}
    >
      {initials}
    </span>
  );
}
