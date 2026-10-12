import type { TeamCode } from "@/types/match";

// Simplified CSS flags — Windows doesn't render regional-indicator emoji.
export default function Flag({ team, className = "" }: { team: TeamCode; className?: string }) {
  const base = `inline-block overflow-hidden rounded-sm ring-1 ring-black/20 ${className}`;
  if (team === "IND") {
    return (
      <span className={base} aria-label="India" role="img">
        <span className="flex h-full w-full flex-col">
          <span className="flex-1 bg-[#ff9933]" />
          <span className="relative flex-1 bg-white">
            <span className="absolute left-1/2 top-1/2 h-[55%] w-[55%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#0a3a8f]" />
          </span>
          <span className="flex-1 bg-[#138808]" />
        </span>
      </span>
    );
  }
  return (
    <span className={base} aria-label="Pakistan" role="img">
      <span className="flex h-full w-full">
        <span className="h-full w-1/4 bg-white" />
        <span className="relative h-full w-3/4 bg-[#01411c]">
          <span className="absolute left-1/2 top-1/2 h-[55%] w-[55%] -translate-x-[40%] -translate-y-1/2 rounded-full bg-white" />
          <span className="absolute left-1/2 top-1/2 h-[55%] w-[55%] -translate-x-[22%] -translate-y-1/2 rounded-full bg-[#01411c]" />
        </span>
      </span>
    </span>
  );
}
