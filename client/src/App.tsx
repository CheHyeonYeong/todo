import { useCallback, useEffect, useRef, useState } from "react";
import { GripHorizontal } from "lucide-react";
import { Card } from "@/components/ui/card";
import { InstallSheet } from "@/components/InstallSheet";
import { LoginScreen } from "@/components/LoginScreen";
import { MemoSheet, MemoWorkspace } from "@/components/MemoWorkspace";
import { PomodoroPanel } from "@/components/PomodoroPanel";
import { RoutineSheet } from "@/components/RoutineSheet";
import { TimetablePanel } from "@/components/TimetablePanel";
import { TodoPanel } from "@/components/TodoPanel";
import { Topbar, type WorkspacePanel } from "@/components/Topbar";
import { AppDataProvider, useAppData } from "@/hooks/useAppData";
import { cn } from "@/lib/utils";

const DASHBOARD_WIDTH_KEY = "free-adhd-memo:dashboard-width";
const MEMO_DOCK_HEIGHT_KEY = "free-adhd-memo:memo-dock-height";
const LAYOUT_KEY = "free-adhd-memo:panel-layout";
const PANEL_MIME = "text/panel-key";

/* 배치는 슬롯 순서(왼쪽 위, 왼쪽 아래 독, 오른쪽 3칸)에 어떤 패널이 오는지로 저장한다. */
type PanelKey = "todo" | "memo" | "pomodoro" | "timetable";
const DEFAULT_LAYOUT: PanelKey[] = ["todo", "memo", "pomodoro", "timetable"];
const panelTitles: Record<PanelKey, string> = {
  todo: "할 일",
  memo: "메모",
  pomodoro: "타이머",
  timetable: "타임테이블",
};
// 세로로 늘어나는 패널. 오른쪽 칸에 놓일 때 최소 높이를 확보해준다.
const growingPanels: PanelKey[] = ["todo", "memo"];

function renderPanel(key: PanelKey) {
  switch (key) {
    case "todo":
      return <TodoPanel />;
    case "memo":
      return (
        <Card className="flex h-full min-h-0 flex-col gap-0 overflow-hidden p-4">
          <MemoWorkspace />
        </Card>
      );
    case "pomodoro":
      return <PomodoroPanel />;
    case "timetable":
      return <TimetablePanel />;
  }
}

function loadLayout(): PanelKey[] {
  try {
    const saved = JSON.parse(localStorage.getItem(LAYOUT_KEY) || "null");
    const valid =
      Array.isArray(saved) &&
      saved.length === DEFAULT_LAYOUT.length &&
      DEFAULT_LAYOUT.every((key) => saved.includes(key));
    if (valid) return saved as PanelKey[];
  } catch {
    // 저장값이 깨졌으면 기본 배치로 돌아간다.
  }
  return DEFAULT_LAYOUT;
}

function useStoredPx(key: string) {
  const [value, setValue] = useState<number | null>(() => {
    const saved = Number(localStorage.getItem(key));
    return saved > 0 ? saved : null;
  });
  const save = useCallback(
    (next: number) => {
      setValue(next);
      localStorage.setItem(key, String(Math.round(next)));
    },
    [key],
  );
  return [value, save] as const;
}

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const onChange = () => setMatches(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

function DragHandle({
  direction,
  onDrag,
  onEnd,
}: {
  direction: "col" | "row";
  onDrag: (delta: number) => void;
  onEnd: () => void;
}) {
  const dragging = useRef(false);
  const start = useRef(0);

  return (
    <div
      className={
        direction === "col"
          ? "hidden w-3 shrink-0 cursor-col-resize items-stretch justify-center lg:flex [&:hover>div]:bg-emerald-600/50"
          : "hidden h-3 shrink-0 cursor-row-resize items-center lg:flex [&:hover>div]:bg-emerald-600/50"
      }
      onPointerDown={(event) => {
        dragging.current = true;
        start.current = direction === "col" ? event.clientX : event.clientY;
        (event.target as HTMLElement).setPointerCapture(event.pointerId);
        event.preventDefault();
      }}
      onPointerMove={(event) => {
        if (!dragging.current) return;
        const current = direction === "col" ? event.clientX : event.clientY;
        onDrag(current - start.current);
      }}
      onPointerUp={() => {
        dragging.current = false;
        onEnd();
      }}
    >
      <div
        className={
          direction === "col"
            ? "w-[3px] rounded-full bg-muted-foreground/25 transition-colors"
            : "h-[3px] w-full rounded-full bg-muted-foreground/25 transition-colors"
        }
      />
    </div>
  );
}

function usePanelLayout() {
  const [layout, setLayout] = useState<PanelKey[]>(loadLayout);
  const [dragging, setDragging] = useState<PanelKey | null>(null);

  const save = useCallback((next: PanelKey[]) => {
    setLayout(next);
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(next));
  }, []);

  const swap = useCallback(
    (a: PanelKey, b: PanelKey) => {
      if (a === b) return;
      save(layout.map((key) => (key === a ? b : key === b ? a : key)));
    },
    [layout, save],
  );

  const reset = useCallback(() => {
    setLayout(DEFAULT_LAYOUT);
    localStorage.removeItem(LAYOUT_KEY);
  }, []);

  const customized = layout.some((key, index) => key !== DEFAULT_LAYOUT[index]);
  return { layout, dragging, setDragging, swap, reset, customized };
}

type PanelLayout = ReturnType<typeof usePanelLayout>;

/* 데스크톱에서 패널을 드래그해 자리를 맞바꾼다. 헤더의 손잡이를 눌러야 드래그가 켜진다. */
function PanelSlot({
  panel,
  layout,
  className,
  style,
  draggableRef,
}: {
  panel: PanelKey;
  layout: PanelLayout;
  className?: string;
  style?: React.CSSProperties;
  draggableRef?: React.Ref<HTMLDivElement>;
}) {
  const [armed, setArmed] = useState(false);
  const [over, setOver] = useState(false);
  const { dragging, setDragging, swap } = layout;

  return (
    <div
      id={`panel-${panel}`}
      ref={draggableRef}
      className={cn("group/panel relative", className, over && "rounded-xl ring-2 ring-emerald-500")}
      style={style}
      draggable={armed}
      onDragStart={(event) => {
        event.dataTransfer.setData(PANEL_MIME, panel);
        event.dataTransfer.effectAllowed = "move";
        setDragging(panel);
      }}
      onDragEnd={() => {
        setArmed(false);
        setDragging(null);
      }}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes(PANEL_MIME) || dragging === panel) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        if (!event.dataTransfer.types.includes(PANEL_MIME)) return;
        event.preventDefault();
        setOver(false);
        const source = event.dataTransfer.getData(PANEL_MIME) as PanelKey;
        if (source) swap(source, panel);
      }}
    >
      {renderPanel(panel)}
    </div>
  );
}

/* 삭제 직후 6초 동안 뜨는 되돌리기 토스트 */
function UndoToastBar() {
  const { undoToast, dismissUndo } = useAppData();
  if (!undoToast) return null;
  return (
    <div className="fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-lg bg-foreground px-4 py-2.5 text-sm text-background shadow-lg">
      <span className="max-w-64 truncate font-medium">{undoToast.label}</span>
      <button
        type="button"
        className="shrink-0 font-bold text-emerald-400 hover:underline"
        onClick={() => dismissUndo(true)}
      >
        되돌리기
      </button>
      <button
        type="button"
        aria-label="닫기"
        className="shrink-0 text-background/60 hover:text-background"
        onClick={() => dismissUndo()}
      >
        ✕
      </button>
    </div>
  );
}

function Shell() {
  const { auth } = useAppData();
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const [memoOpen, setMemoOpen] = useState(false);
  const [installOpen, setInstallOpen] = useState(false);
  const [routinesOpen, setRoutinesOpen] = useState(false);
  const fixedLayout = usePanelLayout();
  const [activePanel, setActivePanel] = useState<WorkspacePanel>("todo");

  const showLogin = auth !== "ready";

  return (
    <>
      {showLogin && <LoginScreen checking={auth === "checking"} />}
      <div className="flex h-dvh w-full flex-col overflow-hidden bg-background lg:flex-row">
        <Topbar
          onOpenMemo={() => setMemoOpen(true)}
          onOpenInstall={() => setInstallOpen(true)}
          onOpenRoutines={() => setRoutinesOpen(true)}
          activePanel={activePanel}
          onSelectPanel={setActivePanel}
        />
        <main className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4 lg:p-5">
          <div className="mb-4 hidden items-end justify-between lg:flex">
            <div>
              <p className="text-xs font-bold tracking-[0.18em] text-muted-foreground uppercase">Workspace</p>
              <h2 className="mt-1 text-2xl font-black tracking-tight">
                {activePanel === "todo" && "캘린더"}
                {activePanel === "memo" && "메모"}
                {activePanel === "pomodoro" && "타이머"}
                {activePanel === "timetable" && "타임테이블"}
              </h2>
            </div>
            <p className="text-sm text-muted-foreground">필요한 화면 하나에만 집중하세요.</p>
          </div>
          <div className="min-h-[calc(100dvh-6rem)] lg:h-[calc(100%_-_4rem)] lg:min-h-0">
            <PanelSlot panel={activePanel} layout={fixedLayout} className="flex h-full min-h-[620px] flex-col lg:min-h-0" />
          </div>
        </main>
      </div>
      {!isDesktop && <MemoSheet open={memoOpen} onOpenChange={setMemoOpen} />}
      <InstallSheet open={installOpen} onOpenChange={setInstallOpen} />
      <RoutineSheet open={routinesOpen} onOpenChange={setRoutinesOpen} />
      <UndoToastBar />
    </>
  );
}

export default function App() {
  return (
    <AppDataProvider>
      <Shell />
    </AppDataProvider>
  );
}
