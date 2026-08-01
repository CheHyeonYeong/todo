import { useState } from "react";
import {
  CheckSquare2,
  Clock3,
  Download,
  LogOut,
  Moon,
  NotebookPen,
  Repeat,
  Sun,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppData } from "@/hooks/useAppData";

const THEME_KEY = "free-adhd-memo:theme";
export type WorkspacePanel = "todo" | "memo" | "time";

export function Topbar({
  onOpenInstall,
  onOpenRoutines,
  activePanel,
  onSelectPanel,
}: {
  onOpenInstall: () => void;
  onOpenRoutines: () => void;
  activePanel: WorkspacePanel;
  onSelectPanel: (panel: WorkspacePanel) => void;
}) {
  const { email, logout } = useAppData();
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
    <>
      <aside className="flex shrink-0 items-center justify-between border-b bg-card/85 px-4 py-3 backdrop-blur lg:w-56 lg:flex-col lg:items-stretch lg:border-r lg:border-b-0 lg:px-4 lg:py-5">
        <div className="flex min-w-0 items-center gap-3 lg:block">
          <div className="grid size-10 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
            <CheckSquare2 className="size-5" />
          </div>
          <div className="min-w-0 lg:mt-3">
            <h1 className="text-lg font-black tracking-tight">Todo</h1>
            <span className="block truncate text-xs text-muted-foreground">{email}</span>
          </div>
        </div>

        <nav className="mt-7 hidden flex-col gap-1.5 lg:flex">
          <button className={activePanel === "todo" ? "flex items-center gap-3 rounded-xl bg-accent px-3 py-2.5 text-left text-sm font-bold text-accent-foreground" : "flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"} onClick={() => onSelectPanel("todo")}>
            <CheckSquare2 className="size-4" /> 할 일
          </button>
          <button className={activePanel === "memo" ? "flex items-center gap-3 rounded-xl bg-accent px-3 py-2.5 text-left text-sm font-bold text-accent-foreground" : "flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"} onClick={() => onSelectPanel("memo")}>
            <NotebookPen className="size-4" /> 메모
          </button>
          <button className={activePanel === "time" ? "flex items-center gap-3 rounded-xl bg-accent px-3 py-2.5 text-left text-sm font-bold text-accent-foreground" : "flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"} onClick={() => onSelectPanel("time")}>
            <Clock3 className="size-4" /> 시간
          </button>
        </nav>

        <div className="flex items-center gap-1.5 lg:mt-auto lg:flex-col lg:items-stretch">
          <Button variant="ghost" size="sm" className="lg:justify-start" onClick={onOpenRoutines} title="요일별 반복 할 일">
            <Repeat className="size-4" />
            <span className="hidden sm:inline">루틴</span>
          </Button>
          <Button variant="ghost" size="sm" className="lg:justify-start" onClick={onOpenInstall} title="앱·터미널 설치 안내">
            <Download className="size-4" />
            <span className="hidden sm:inline">설치</span>
          </Button>
          <Button variant="ghost" size="sm" className="lg:justify-start" onClick={toggleTheme} title={dark ? "라이트 모드" : "다크 모드"}>
            {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
            <span className="hidden lg:inline">{dark ? "라이트 모드" : "다크 모드"}</span>
          </Button>
          <Button variant="ghost" size="sm" className="lg:justify-start" onClick={logout} title="로그아웃">
            <LogOut className="size-4" />
            <span className="hidden sm:inline">로그아웃</span>
          </Button>
        </div>
      </aside>

      {/* aside는 backdrop-filter를 쓰기 때문에 fixed 자손의 기준 상자(containing block)가 된다.
          하단 탭바를 aside 안에 두면 뷰포트가 아니라 aside 높이(65px)에 갇혀 상단에 겹친다.
          그래서 aside 바깥 형제로 둔다. */}
      <nav className="fixed inset-x-3 bottom-3 z-40 flex rounded-2xl border bg-card/95 p-1.5 shadow-xl backdrop-blur lg:hidden">
        <button className={activePanel === "todo" ? "flex flex-1 flex-col items-center gap-1 rounded-xl bg-accent px-2 py-2 text-xs font-bold text-accent-foreground" : "flex flex-1 flex-col items-center gap-1 rounded-xl px-2 py-2 text-xs font-semibold text-muted-foreground"} onClick={() => onSelectPanel("todo")}>
          <CheckSquare2 className="size-4" /> 할 일
        </button>
        <button className={activePanel === "memo" ? "flex flex-1 flex-col items-center gap-1 rounded-xl bg-accent px-2 py-2 text-xs font-bold text-accent-foreground" : "flex flex-1 flex-col items-center gap-1 rounded-xl px-2 py-2 text-xs font-semibold text-muted-foreground"} onClick={() => onSelectPanel("memo")}>
          <NotebookPen className="size-4" /> 메모
        </button>
        <button className={activePanel === "time" ? "flex flex-1 flex-col items-center gap-1 rounded-xl bg-accent px-2 py-2 text-xs font-bold text-accent-foreground" : "flex flex-1 flex-col items-center gap-1 rounded-xl px-2 py-2 text-xs font-semibold text-muted-foreground"} onClick={() => onSelectPanel("time")}>
          <Clock3 className="size-4" /> 시간
        </button>
      </nav>
    </>
  );
}
