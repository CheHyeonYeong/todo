import { useEffect, useRef, useState } from "react";
import { ChevronDown, Play, RotateCcw, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAppData } from "@/hooks/useAppData";
import { minutesToLabel, uid } from "@/lib/helpers";
import { cn } from "@/lib/utils";

const TIMER_KEY = "free-adhd-memo:timer-minutes";
const COLLAPSE_KEY = "free-adhd-memo:collapse:pomodoro";
const defaultModeMinutes = { focus: 25, short: 5, long: 15 };
const MIN_MINUTES = 1;
const MAX_MINUTES = 180;
type TimerMode = keyof typeof defaultModeMinutes;
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

export function PomodoroPanel() {
  const { activeSession, recordSession } = useAppData();
  const [minutes, setMinutes] = useState(loadTimerMinutes);
  const [mode, setMode] = useState<TimerMode>("focus");
  // 입력 중에는 원본 문자열을 들고 있어야 "25"를 지우고 "30"을 칠 수 있다.
  const [minutesDraft, setMinutesDraft] = useState(() => String(minutes.focus));
  const [secondsLeft, setSecondsLeft] = useState(minutes.focus * 60);
  const [running, setRunning] = useState(false);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_KEY) === "1");
  const activeSessionRef = useRef(activeSession);
  activeSessionRef.current = activeSession;
  const modeRef = useRef(mode);
  modeRef.current = mode;
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
      label: "뽀모도로 집중",
      startedAt: new Date(startedAt).toISOString(),
      endedAt: new Date(endedAtMs).toISOString(),
    });
  };
  const recordFocusSegmentRef = useRef(recordFocusSegment);
  recordFocusSegmentRef.current = recordFocusSegment;

  useEffect(() => {
    if (!running) return;
    const tick = () => {
      const endAt = endAtRef.current;
      if (endAt == null) return;
      const remaining = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (remaining > 0) return;
      endAtRef.current = null;
      setRunning(false);
      playBeep();
      const message = modeRef.current === "focus" ? "집중 끝! 잠깐 쉬세요." : "휴식 끝! 다시 시작해볼까요.";
      if ("Notification" in window && Notification.permission === "granted") {
        new Notification("Todo", { body: message, icon: "/icons/icon-192.png" });
      }
      recordFocusSegmentRef.current(endAt);
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
      Notification.requestPermission();
    }
    const baseSeconds = secondsLeft > 0 ? secondsLeft : minutes[mode] * 60;
    setSecondsLeft(baseSeconds);
    endAtRef.current = Date.now() + baseSeconds * 1000;
    startedAtRef.current = Date.now();
    setRunning(true);
  };

  const selectMode = (next: TimerMode) => {
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
          {collapsed && (
            <span className={cn("text-sm font-bold tabular-nums", running ? "text-emerald-600" : "text-muted-foreground")}>
              {minutesToLabel(secondsLeft)}
            </span>
          )}
          <ChevronDown className={cn("size-5 text-muted-foreground transition-transform", collapsed && "-rotate-90")} />
        </div>
      </button>
      <div className={cn(collapsed && "max-lg:hidden")}>
        <div className="my-5 text-center text-[clamp(2rem,22cqw,5rem)] leading-none font-black tabular-nums @container">
          {minutesToLabel(secondsLeft)}
        </div>
        <Tabs value={mode} onValueChange={(value) => selectMode(value as TimerMode)}>
          <TabsList className="w-full">
            {(Object.keys(modeNames) as TimerMode[]).map((key) => (
              <TabsTrigger key={key} value={key} className="flex-1 text-xs">
                {modeNames[key]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="mt-3 flex items-center justify-center gap-2 text-sm font-semibold text-muted-foreground">
          <label htmlFor="timerMinutes">분 설정</label>
          <Input
            id="timerMinutes"
            type="number"
            min={MIN_MINUTES}
            max={MAX_MINUTES}
            className={cn("h-8 w-16 text-center", !draftMinutes && "border-destructive text-destructive")}
            value={minutesDraft}
            onChange={(event) => {
              const draft = event.target.value;
              setMinutesDraft(draft);
              const value = parseMinutes(draft);
              if (value == null) return;
              const next = { ...minutes, [mode]: value };
              setMinutes(next);
              localStorage.setItem(TIMER_KEY, JSON.stringify(next));
              if (!running) setSecondsLeft(value * 60);
            }}
            onBlur={() => {
              // 빈 칸이나 범위 밖인 채로 벗어나면 마지막 유효값으로 되돌린다.
              if (!draftMinutes) setMinutesDraft(String(minutes[mode]));
            }}
          />
        </div>
        <p className="mt-2 text-center text-xs font-medium text-muted-foreground">
          {draftMinutes
            ? "집중 1분 이상이면 타임테이블에 자동 기록"
            : `${MIN_MINUTES}~${MAX_MINUTES} 사이의 분을 입력하세요`}
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
      </div>
    </Card>
  );
}
