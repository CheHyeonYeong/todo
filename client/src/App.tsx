import { useCallback, useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { FocusPanel } from "@/components/FocusPanel";
import { LoginScreen } from "@/components/LoginScreen";
import { MemoSheet, MemoWorkspace } from "@/components/MemoWorkspace";
import { PomodoroPanel } from "@/components/PomodoroPanel";
import { TimetablePanel } from "@/components/TimetablePanel";
import { TodoPanel } from "@/components/TodoPanel";
import { Topbar } from "@/components/Topbar";
import { AppDataProvider, useAppData } from "@/hooks/useAppData";

const DASHBOARD_WIDTH_KEY = "free-adhd-memo:dashboard-width";
const MEMO_DOCK_HEIGHT_KEY = "free-adhd-memo:memo-dock-height";

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

function Shell() {
  const { auth } = useAppData();
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const [memoOpen, setMemoOpen] = useState(false);
  const [leftWidth, saveLeftWidth] = useStoredPx(DASHBOARD_WIDTH_KEY);
  const [dockHeight, saveDockHeight] = useStoredPx(MEMO_DOCK_HEIGHT_KEY);
  const leftRef = useRef<HTMLDivElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const dragBase = useRef(0);

  const showLogin = auth !== "ready";

  return (
    <>
      {showLogin && <LoginScreen checking={auth === "checking"} />}
      <div className="mx-auto flex h-dvh w-full max-w-[1480px] flex-col overflow-y-auto p-4 lg:overflow-hidden">
        <Topbar onOpenMemo={() => setMemoOpen(true)} />
        <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
          <div
            ref={leftRef}
            className="flex min-h-0 flex-col lg:min-w-[360px]"
            style={isDesktop && leftWidth ? { flex: `0 0 ${leftWidth}px` } : { flex: "1.6 1 0%" }}
          >
            <TodoPanel />
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
                <Card
                  ref={dockRef}
                  className="flex min-h-0 flex-col gap-0 overflow-hidden p-4"
                  style={{ flex: `0 0 ${dockHeight || 260}px` }}
                >
                  <MemoWorkspace />
                </Card>
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
          <div className="flex min-w-0 flex-1 flex-col gap-3 lg:min-w-[280px] lg:overflow-y-auto">
            <FocusPanel />
            <PomodoroPanel />
            <TimetablePanel />
          </div>
        </div>
      </div>
      {!isDesktop && <MemoSheet open={memoOpen} onOpenChange={setMemoOpen} />}
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
