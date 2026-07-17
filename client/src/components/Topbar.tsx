import { useState } from "react";
import { Download, LayoutGrid, LogOut, Moon, PenLine, Repeat, Sun } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAppData } from "@/hooks/useAppData";
import { cn } from "@/lib/utils";

const THEME_KEY = "free-adhd-memo:theme";

export function Topbar({
  onOpenMemo,
  onOpenInstall,
  onOpenRoutines,
  onResetLayout,
}: {
  onOpenMemo: () => void;
  onOpenInstall: () => void;
  onOpenRoutines: () => void;
  onResetLayout?: () => void;
}) {
  const { email, logout, sync } = useAppData();
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));

  const toggleTheme = () => {
    setDark((current) => {
      const next = !current;
      document.documentElement.classList.toggle("dark", next);
      localStorage.setItem(THEME_KEY, next ? "dark" : "light");
      return next;
    });
  };

  return (
    <header className="mb-4 flex shrink-0 items-center justify-between gap-4">
      <span className="truncate text-sm font-semibold text-muted-foreground">{email}</span>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" className="lg:hidden" onClick={onOpenMemo}>
          <PenLine className="size-4" />
          메모
        </Button>
        <Button variant="ghost" size="sm" onClick={onOpenRoutines} title="요일별 반복 할 일">
          <Repeat className="size-4" />
          <span className="hidden sm:inline">루틴</span>
        </Button>
        <Button variant="ghost" size="sm" onClick={onOpenInstall} title="앱·터미널 설치 안내">
          <Download className="size-4" />
          <span className="hidden sm:inline">설치</span>
        </Button>
        {onResetLayout && (
          <Button variant="ghost" size="sm" onClick={onResetLayout} title="패널 배치를 기본값으로 되돌리기">
            <LayoutGrid className="size-4" />
            <span className="hidden sm:inline">배치 초기화</span>
          </Button>
        )}
        <Button variant="ghost" size="icon" className="size-8" onClick={toggleTheme} title={dark ? "라이트 모드" : "다크 모드"}>
          {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </Button>
        <Button variant="ghost" size="sm" onClick={logout} title="로그아웃">
          <LogOut className="size-4" />
          <span className="hidden sm:inline">Logout</span>
        </Button>
        <Badge
          variant="secondary"
          className={cn(
            "font-bold",
            sync.tone === "ok" && "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
            sync.tone === "warn" && "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
          )}
        >
          {sync.label}
        </Badge>
      </div>
    </header>
  );
}
