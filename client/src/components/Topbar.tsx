import { LogOut, PenLine } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAppData } from "@/hooks/useAppData";
import { cn } from "@/lib/utils";

export function Topbar({ onOpenMemo }: { onOpenMemo: () => void }) {
  const { email, logout, sync } = useAppData();

  return (
    <header className="mb-4 flex shrink-0 items-center justify-between gap-4">
      <span className="truncate text-sm font-semibold text-muted-foreground">{email}</span>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" className="lg:hidden" onClick={onOpenMemo}>
          <PenLine className="size-4" />
          메모
        </Button>
        <Button variant="ghost" size="sm" onClick={logout} title="로그아웃">
          <LogOut className="size-4" />
          <span className="hidden sm:inline">Logout</span>
        </Button>
        <Badge
          variant="secondary"
          className={cn(
            "font-bold",
            sync.tone === "ok" && "bg-emerald-100 text-emerald-800",
            sync.tone === "warn" && "bg-amber-100 text-amber-800",
          )}
        >
          {sync.label}
        </Badge>
      </div>
    </header>
  );
}
