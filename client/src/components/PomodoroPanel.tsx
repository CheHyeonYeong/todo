import { useEffect, useRef, useState } from "react";
import { ChevronDown, Play, Plus, RotateCcw, Square, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAppData } from "@/hooks/useAppData";
import { minutesToLabel, uid } from "@/lib/helpers";
import { cn } from "@/lib/utils";

const TIMER_KEY = "free-adhd-memo:timer-minutes";
const TASK_KEY = "free-adhd-memo:timer-task";
const COLLAPSE_KEY = "free-adhd-memo:collapse:pomodoro";
const EXTRA_TIMERS_KEY = "free-adhd-memo:extra-timers";
const defaultModeMinutes = { focus: 25, short: 5, long: 15 };
const MIN_MINUTES = 1;
const MAX_MINUTES = 180;
type TimerMode = keyof typeof defaultModeMinutes;
interface ExtraTimer {
  id: string;
  name: string;
  minutes: number;
  remaining: number;
  endAt: number | null;
}
const modeNames: Record<TimerMode, string> = { focus: "집중", short: "짧은 휴식", long: "긴 휴식" };

function parseMinutes(draft: string) {
  const value = Number(draft);
  if (!draft.trim() || !Number.isInteger(value)) return null;
  return value >= MIN_MINUTES && value <= MAX_MINUTES ? value : null;
}

function loadTimerMinutes() {
  try {
    const parsed = JSON.parse(localStorage.getItem(TIMER_KEY) || "{}");
    return {
      focus: Number(parsed.focus) > 0 ? Number(parsed.focus) : defaultModeMinutes.focus,
      short: Number(parsed.short) > 0 ? Number(parsed.short) : defaultModeMinutes.short,
      long: Number(parsed.long) > 0 ? Number(parsed.long) : defaultModeMinutes.long,
    };
  } catch {
    return { ...defaultModeMinutes };
  }
}

function loadExtraTimers(): ExtraTimer[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(EXTRA_TIMERS_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((timer) => timer?.id && Number(timer.minutes) > 0)
      .map((timer) => ({
        id: String(timer.id),
        name: String(timer.name || "타이머"),
        minutes: Math.min(1440, Math.max(1, Number(timer.minutes))),
        remaining: Math.max(0, Number(timer.remaining) || Number(timer.minutes) * 60),
        endAt: Number(timer.endAt) > 0 ? Number(timer.endAt) : null,
      }));
  } catch {
    return [];
  }
}

/* 모바일 크롬은 new Notification()을 막고 서비스워커의 showNotification만 허용한다.
   창이 안 떠 있어도(백그라운드 탭/다른 앱) 뜨도록 서비스워커를 먼저 쓴다. */
async function notify(body: string) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const options: NotificationOptions = {
    body,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: "pomodoro",
    requireInteraction: true,
  };
  try {
    const registration = await navigator.serviceWorker?.ready;
    if (registration) {
      await registration.showNotification("Todo", options);
      return;
    }
  } catch {
    // 서비스워커가 없거나 실패하면 창 알림으로 넘어간다.
  }
  try {
    new Notification("Todo", options);
  } catch {
    // 알림이 안 되는 환경이면 소리로만 알린다.
  }
}

function playBeep() {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.frequency.value = 880;
    gain.gain.setValueAtTime(0.001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.2, context.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.9);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.95);
  } catch {
    // 사운드가 안 되는 환경이면 조용히 넘어간다.
  }
}

function ExtraTimerRack() {
  const [timers, setTimers] = useState<ExtraTimer[]>(loadExtraTimers);

  useEffect(() => {
    localStorage.setItem(EXTRA_TIMERS_KEY, JSON.stringify(timers));
  }, [timers]);

  useEffect(() => {
    if (!timers.some((timer) => timer.endAt)) return;
    const id = window.setInterval(() => {
      const now = Date.now();
      const completed: ExtraTimer[] = [];
      setTimers((current) =>
        current.map((timer) => {
          if (!timer.endAt) return timer;
          const remaining = Math.max(0, Math.ceil((timer.endAt - now) / 1000));
          if (remaining > 0) return { ...timer, remaining };
          completed.push(timer);
          return { ...timer, remaining: 0, endAt: null };
        }),
      );
      completed.forEach((timer) => {
        playBeep();
        void notify(`${timer.name} 타이머가 끝났어요.`);
      });
    }, 500);
    return () => window.clearInterval(id);
  }, [timers.some((timer) => Boolean(timer.endAt))]);

  const update = (id: string, patch: Partial<ExtraTimer>) => {
    setTimers((current) => current.map((timer) => (timer.id === id ? { ...timer, ...patch } : timer)));
  };

  return (
    <div className="mt-4 border-t pt-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-bold tracking-wide text-muted-foreground uppercase">추가 타이머</span>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          onClick={() =>
            setTimers((current) => [
              ...current,
              {
                id: crypto.randomUUID(),
                name: `타이머 ${current.length + 1}`,
                minutes: 60,
                remaining: 3600,
                endAt: null,
              },
            ])
          }
        >
          <Plus className="size-3.5" />
          추가
        </Button>
      </div>
      <div className="grid gap-2">
        {timers.map((timer) => {
          const running = Boolean(timer.endAt);
          return (
            <div key={timer.id} className="flex items-center gap-1.5 rounded-lg bg-muted p-2">
              <Input
                value={timer.name}
                disabled={running}
                onChange={(event) => update(timer.id, { name: event.target.value })}
                className="h-7 min-w-0 flex-1 bg-background px-2 text-xs font-semibold"
                aria-label="타이머 이름"
              />
              {running ? (
                <span className="w-16 text-center text-sm font-black tabular-nums">
                  {minutesToLabel(timer.remaining)}
                </span>
              ) : (
                <Input
                  type="number"
                  min={1}
                  max={1440}
                  value={timer.minutes}
                  onChange={(event) => {
                    const minutes = Math.min(1440, Math.max(1, Number(event.target.value) || 1));
                    update(timer.id, { minutes, remaining: minutes * 60 });
                  }}
                  className="h-7 w-16 bg-background px-1 text-center text-xs"
                  aria-label="타이머 분"
                />
              )}
              <Button
                size="icon"
                variant={running ? "secondary" : "default"}
                className="size-7 shrink-0"
                title={running ? "일시정지" : "시작"}
                onClick={() => {
                  if (running) {
                    update(timer.id, { endAt: null });
                  } else {
                    const remaining = timer.remaining > 0 ? timer.remaining : timer.minutes * 60;
                    update(timer.id, { remaining, endAt: Date.now() + remaining * 1000 });
                  }
                }}
              >
                {running ? <Square className="size-3" /> : <Play className="size-3" />}
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="size-7 shrink-0"
                title="리셋"
                onClick={() => update(timer.id, { remaining: timer.minutes * 60, endAt: null })}
              >
                <RotateCcw className="size-3" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="size-7 shrink-0 text-muted-foreground hover:text-destructive"
                title="삭제"
                onClick={() => setTimers((current) => current.filter((item) => item.id !== timer.id))}
              >
                <Trash2 className="size-3" />
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function PomodoroPanel() {
  const { activeSession, recordSession } = useAppData();
  const [minutes, setMinutes] = useState(loadTimerMinutes);
  const [mode, setMode] = useState<TimerMode>("focus");
  // 지금 뭘 하는지 적어두면 실행 중에 보여주고 집중 기록 이름으로도 쓴다.
  const [task, setTask] = useState(() => localStorage.getItem(TASK_KEY) || "");
  // 입력 중에는 원본 문자열을 들고 있어야 "25"를 지우고 "30"을 칠 수 있다.
  const [minutesDraft, setMinutesDraft] = useState(() => String(minutes.focus));
  const [secondsLeft, setSecondsLeft] = useState(minutes.focus * 60);
  const [running, setRunning] = useState(false);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_KEY) === "1");
  const [notifyPermission, setNotifyPermission] = useState<NotificationPermission | "unsupported">(() =>
    "Notification" in window ? Notification.permission : "unsupported",
  );
  // 이번 사이클에서 끝낸 집중 횟수. 4번째 집중 후엔 긴 휴식으로 넘어간다.
  const [focusCount, setFocusCount] = useState(0);
  const activeSessionRef = useRef(activeSession);
  activeSessionRef.current = activeSession;
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const taskRef = useRef(task);
  taskRef.current = task;
  const minutesRef = useRef(minutes);
  minutesRef.current = minutes;
  const focusCountRef = useRef(focusCount);
  focusCountRef.current = focusCount;
  // 탭이 백그라운드로 가도 시간이 정확하도록 마감시각 기준으로 계산한다.
  const endAtRef = useRef<number | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const recordSessionRef = useRef(recordSession);
  recordSessionRef.current = recordSession;

  useEffect(() => {
    localStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0");
  }, [collapsed]);

  const recordFocusSegment = (endedAtMs: number) => {
    const startedAt = startedAtRef.current;
    startedAtRef.current = null;
    if (modeRef.current !== "focus" || !startedAt || activeSessionRef.current) return;
    if (endedAtMs - startedAt < 60 * 1000) return;
    recordSessionRef.current({
      id: uid(),
      label: taskRef.current.trim() || "뽀모도로 집중",
      startedAt: new Date(startedAt).toISOString(),
      endedAt: new Date(endedAtMs).toISOString(),
    });
  };
  const recordFocusSegmentRef = useRef(recordFocusSegment);
  recordFocusSegmentRef.current = recordFocusSegment;

  /* 타이머가 끝났을 때: 집중이면 기록 후 휴식을 자동 시작(4번째는 긴 휴식),
     휴식이면 집중 모드로 되돌려 놓고 시작은 사용자에게 맡긴다. */
  const handleComplete = (endAt: number) => {
    endAtRef.current = null;
    setRunning(false);
    window.focus();
    playBeep();
    recordFocusSegment(endAt);
    if (modeRef.current === "focus") {
      const count = focusCountRef.current + 1;
      setFocusCount(count);
      const nextMode: TimerMode = count % 4 === 0 ? "long" : "short";
      void notify(`집중 끝! ${modeNames[nextMode]}을 자동으로 시작했어요.`);
      setMode(nextMode);
      setMinutesDraft(String(minutesRef.current[nextMode]));
      const seconds = minutesRef.current[nextMode] * 60;
      setSecondsLeft(seconds);
      endAtRef.current = Date.now() + seconds * 1000;
      startedAtRef.current = Date.now();
      setRunning(true);
    } else {
      void notify("휴식 끝! 준비되면 시작을 눌러 다음 집중을 이어가세요.");
      setMode("focus");
      setMinutesDraft(String(minutesRef.current.focus));
      setSecondsLeft(minutesRef.current.focus * 60);
    }
  };
  const handleCompleteRef = useRef(handleComplete);
  handleCompleteRef.current = handleComplete;

  useEffect(() => {
    if (!running) return;
    const tick = () => {
      const endAt = endAtRef.current;
      if (endAt == null) return;
      const remaining = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (remaining > 0) return;
      handleCompleteRef.current(endAt);
    };
    const id = setInterval(tick, 500);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [running]);

  const pause = () => {
    if (!running) return;
    setRunning(false);
    endAtRef.current = null;
    recordFocusSegment(Date.now());
  };

  const start = () => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().then(setNotifyPermission);
    }
    const baseSeconds = secondsLeft > 0 ? secondsLeft : minutes[mode] * 60;
    setSecondsLeft(baseSeconds);
    endAtRef.current = Date.now() + baseSeconds * 1000;
    startedAtRef.current = Date.now();
    setRunning(true);
  };

  const selectMode = (next: TimerMode) => {
    // 실행 중인 타이머는 다른 모드 탭을 잘못 눌러도 계속 간다.
    if (running && next !== mode) return;
    pause();
    setMode(next);
    setMinutesDraft(String(minutes[next]));
    setSecondsLeft(minutes[next] * 60);
  };

  const draftMinutes = parseMinutes(minutesDraft);

  return (
    <Card className="shrink-0 gap-0 p-4.5">
      <button
        type="button"
        className="flex w-full items-center justify-between text-left lg:pointer-events-none"
        onClick={() => setCollapsed((current) => !current)}
      >
        <div>
          <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">pomodoro</p>
          <h2 className="text-lg font-bold">타이머</h2>
        </div>
        <div className="flex items-center gap-2 lg:hidden">
          {collapsed && running && task.trim() && (
            <span className="max-w-28 truncate text-xs font-semibold text-muted-foreground">{task}</span>
          )}
          {collapsed && (
            <span className={cn("text-sm font-bold tabular-nums", running ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground")}>
              {minutesToLabel(secondsLeft)}
            </span>
          )}
          <ChevronDown className={cn("size-5 text-muted-foreground transition-transform", collapsed && "-rotate-90")} />
        </div>
      </button>
      <div className={cn(collapsed && "max-lg:hidden")}>
        {running ? (
          <div className="my-5 text-center text-[clamp(2rem,22cqw,5rem)] leading-none font-black tabular-nums @container">
            {minutesToLabel(secondsLeft)}
          </div>
        ) : (
          <div className="relative my-3 @container">
            <Input
              id="timerMinutes"
              type="number"
              min={MIN_MINUTES}
              max={MAX_MINUTES}
              aria-label="타이머 분 설정"
              className={cn(
                "h-auto border-0 bg-transparent p-0 text-center text-[clamp(2rem,22cqw,5rem)] leading-none font-black tabular-nums shadow-none focus-visible:ring-0",
                !draftMinutes && "text-destructive",
              )}
              value={minutesDraft}
              onChange={(event) => {
                const draft = event.target.value;
                setMinutesDraft(draft);
                const value = parseMinutes(draft);
                if (value == null) return;
                const next = { ...minutes, [mode]: value };
                setMinutes(next);
                localStorage.setItem(TIMER_KEY, JSON.stringify(next));
                setSecondsLeft(value * 60);
              }}
              onBlur={() => {
                if (!draftMinutes) setMinutesDraft(String(minutes[mode]));
              }}
            />
            <span className="pointer-events-none absolute right-[15%] bottom-1 text-xs font-bold text-muted-foreground">분</span>
          </div>
        )}
        <Input
          value={task}
          onChange={(event) => {
            setTask(event.target.value);
            localStorage.setItem(TASK_KEY, event.target.value);
          }}
          placeholder="지금 뭘 하는 중? (집중 기록 이름)"
          title="집중이 끝나면 이 이름으로 타임테이블에 기록됩니다"
          className={cn(
            "mb-3 h-8 text-center text-sm",
            running && mode === "focus" && task.trim() && "border-emerald-600 font-bold text-emerald-700 dark:text-emerald-300",
          )}
        />
        <Tabs value={mode} onValueChange={(value) => selectMode(value as TimerMode)}>
          <TabsList className="w-full">
            {(Object.keys(modeNames) as TimerMode[]).map((key) => (
              <TabsTrigger
                key={key}
                value={key}
                disabled={running && key !== mode}
                title={running && key !== mode ? "진행 중인 타이머를 먼저 정지하세요" : undefined}
                className="flex-1 text-xs"
              >
                {modeNames[key]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div
          className="mt-2.5 flex items-center justify-center gap-1.5"
          title={`이번 사이클 집중 ${focusCount}회 (4회마다 긴 휴식)`}
        >
          {[0, 1, 2, 3].map((index) => {
            const filled = focusCount > 0 && index < (focusCount % 4 === 0 ? 4 : focusCount % 4);
            return (
              <span
                key={index}
                className={cn("size-2 rounded-full", filled ? "bg-emerald-600" : "bg-muted-foreground/25")}
              />
            );
          })}
        </div>
        <p className="mt-2 text-center text-xs font-medium text-muted-foreground">
          {!draftMinutes
            ? `${MIN_MINUTES}~${MAX_MINUTES} 사이의 분을 입력하세요`
            : notifyPermission === "denied"
              ? "알림이 차단돼 있어 소리로만 알려요 (브라우저 설정에서 허용)"
              : "집중이 끝나면 휴식 자동 시작 · 1분 이상 집중은 타임테이블에 기록"}
        </p>
        <div className="mt-3 flex gap-2">
          <Button
            className="flex-1 font-bold"
            disabled={!running && !draftMinutes}
            onClick={() => (running ? pause() : start())}
          >
            {running ? <Square className="size-4" /> : <Play className="size-4" />}
            {running ? "정지" : "시작"}
          </Button>
          <Button variant="secondary" className="flex-1 font-bold" onClick={() => selectMode(mode)}>
            <RotateCcw className="size-4" />
            리셋
          </Button>
        </div>
        <ExtraTimerRack />
      </div>
    </Card>
  );
}
