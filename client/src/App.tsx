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
import { Topbar } from "@/components/Topbar";
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
      <button
        type="button"
        title={`${panelTitles[panel]} 위치 옮기기 (끌어서 다른 패널과 자리 교환)`}
        aria-label={`${panelTitles[panel]} 위치 옮기기`}
        className="absolute top-0 left-1/2 z-10 grid h-6 w-16 -translate-x-1/2 cursor-grab place-items-center rounded-b-lg border border-t-0 border-border bg-muted text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:cursor-grabbing"
        onPointerDown={() => setArmed(true)}
        onPointerUp={() => setArmed(false)}
      >
        <GripHorizontal className="size-4" />
      </button>
      {renderPanel(panel)}
    </div>
  );
}

function Shell() {
  const { auth } = useAppData();
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const panelLayout = usePanelLayout();
  const [memoOpen, setMemoOpen] = useState(false);
  const [installOpen, setInstallOpen] = useState(false);
  const [routinesOpen, setRoutinesOpen] = useState(false);
  const [leftWidth, saveLeftWidth] = useStoredPx(DASHBOARD_WIDTH_KEY);
  const [dockHeight, saveDockHeight] = useStoredPx(MEMO_DOCK_HEIGHT_KEY);
  const leftRef = useRef<HTMLDivElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const dragBase = useRef(0);

  const showLogin = auth !== "ready";
  // 모바일에서는 배치를 바꾸지 않고 기본 순서를 그대로 쓴다.
  const [mainPanel, dockPanel, ...sidePanels] = isDesktop ? panelLayout.layout : DEFAULT_LAYOUT;

  return (
    <>
      {showLogin && <LoginScreen checking={auth === "checking"} />}
      <div className="mx-auto flex h-dvh w-full max-w-[1480px] flex-col overflow-y-auto p-4 lg:overflow-hidden">
        <Topbar
          onOpenMemo={() => setMemoOpen(true)}
          onOpenInstall={() => setInstallOpen(true)}
          onOpenRoutines={() => setRoutinesOpen(true)}
          onResetLayout={isDesktop && panelLayout.customized ? panelLayout.reset : undefined}
        />
        <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
          <div
            ref={leftRef}
            className="flex min-h-0 flex-col max-lg:shrink-0 lg:min-w-[360px]"
            style={isDesktop ? (leftWidth ? { flex: `0 0 ${leftWidth}px` } : { flex: "1.6 1 0%" }) : undefined}
          >
            <PanelSlot panel={mainPanel} layout={panelLayout} className="flex min-h-0 flex-1 flex-col" />
            {isDesktop && (
              <>
                <DragHandle
                  direction="row"
                  onDrag={(delta) => {
                    if (!dockRef.current) return;
                    if (!dragBase.current) dragBase.current = dockRef.current.getBoundingClientRect().height;
                    const next = Math.max(140, dragBase.current - delta);
                    dockRef.current.style.flex = `0 0 ${next}px`;
                  }}
                  onEnd={() => {
                    if (dockRef.current) saveDockHeight(dockRef.current.getBoundingClientRect().height);
                    dragBase.current = 0;
                  }}
                />
                <PanelSlot
                  panel={dockPanel}
                  layout={panelLayout}
                  draggableRef={dockRef}
                  className="flex min-h-0 flex-col"
                  style={{ flex: `0 0 ${dockHeight || 260}px` }}
                />
              </>
            )}
          </div>
          <DragHandle
            direction="col"
            onDrag={(delta) => {
              if (!leftRef.current) return;
              if (!dragBase.current) dragBase.current = leftRef.current.getBoundingClientRect().width;
              const next = Math.max(360, dragBase.current + delta);
              leftRef.current.style.flex = `0 0 ${next}px`;
            }}
            onEnd={() => {
              if (leftRef.current) saveLeftWidth(leftRef.current.getBoundingClientRect().width);
              dragBase.current = 0;
            }}
          />
          <div className="flex min-w-0 flex-1 flex-col gap-3 max-lg:shrink-0 lg:min-w-[280px] lg:overflow-y-auto">
            {sidePanels.map((panel) => (
              <PanelSlot
                key={panel}
                panel={panel}
                layout={panelLayout}
                className={cn("flex shrink-0 flex-col", growingPanels.includes(panel) && "min-h-90")}
              />
            ))}
          </div>
        </div>
      </div>
      {!isDesktop && <MemoSheet open={memoOpen} onOpenChange={setMemoOpen} />}
      <InstallSheet open={installOpen} onOpenChange={setInstallOpen} />
      <RoutineSheet open={routinesOpen} onOpenChange={setRoutinesOpen} />
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
