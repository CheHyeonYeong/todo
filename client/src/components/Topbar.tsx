import { useState } from "react";
import { DatabaseBackup, Download, LayoutGrid, LogOut, Moon, PenLine, Repeat, Share2, Sun } from "lucide-react";
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
  const { data, email, logout, sync } = useAppData();
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));

  const toggleTheme = () => {
    setDark((current) => {
      const next = !current;
      document.documentElement.classList.toggle("dark", next);
      localStorage.setItem(THEME_KEY, next ? "dark" : "light");
      return next;
    });
  };

  const download = (name: string, content: string, type: string) => {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const backupData = () => {
    const stamp = new Date().toISOString().slice(0, 10);
    download(`todo-backup-${stamp}.json`, JSON.stringify({ exportedAt: new Date().toISOString(), ...data }, null, 2), "application/json");
  };

  const exportMemos = async () => {
    const text = data.memos
      .map((memo) => [memo.title && `# ${memo.title}`, memo.body].filter(Boolean).join("\n"))
      .filter(Boolean)
      .join("\n\n---\n\n");
    const file = new File([text], "todo-memos.txt", { type: "text/plain" });
    if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
      try {
        await navigator.share({ title: "Todo 메모", files: [file] });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        download("todo-memos.txt", text, "text/plain");
      }
      return;
    }
    download("todo-memos.txt", text, "text/plain");
  };

  return (
    <header className="mb-4 flex shrink-0 items-center justify-between gap-4">
      <span className="truncate text-sm font-semibold text-muted-foreground">{email}</span>
      <div className="-my-1 flex min-w-0 items-center gap-2 overflow-x-auto py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
        <Button variant="ghost" size="sm" onClick={backupData} title="할 일·메모·타임테이블 전체 백업">
          <DatabaseBackup className="size-4" />
          <span className="hidden sm:inline">백업</span>
        </Button>
        <Button variant="ghost" size="icon" className="size-8" onClick={() => void exportMemos()} title="메모를 휴대폰 앱으로 공유">
          <Share2 className="size-4" />
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
          title={sync.label}
          aria-label={sync.label}
          className={cn(
            "size-2.5 border-0 p-0 font-bold sm:size-auto sm:border sm:px-2 sm:py-0.5",
            sync.tone === "ok" && "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
            sync.tone === "warn" && "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
          )}
        >
          <span className="hidden sm:inline">{sync.label}</span>
        </Badge>
      </div>
    </header>
  );
}
