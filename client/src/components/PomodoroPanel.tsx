import { useEffect, useRef, useState } from "react";
import { Play, RotateCcw, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAppData } from "@/hooks/useAppData";
import { minutesToLabel, nowIso, uid } from "@/lib/helpers";

const TIMER_KEY = "free-adhd-memo:timer-minutes";
const defaultModeMinutes = { focus: 25, short: 5, long: 15 };
type TimerMode = keyof typeof defaultModeMinutes;
const modeNames: Record<TimerMode, string> = { focus: "집중", short: "짧은 휴식", long: "긴 휴식" };

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
  const [secondsLeft, setSecondsLeft] = useState(minutes.focus * 60);
  const [running, setRunning] = useState(false);
  const activeSessionRef = useRef(activeSession);
  activeSessionRef.current = activeSession;
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const minutesRef = useRef(minutes);
  minutesRef.current = minutes;

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setSecondsLeft((current) => {
        if (current <= 1) {
          setRunning(false);
          playBeep();
          const message = modeRef.current === "focus" ? "집중 끝! 잠깐 쉬세요." : "휴식 끝! 다시 시작해볼까요.";
          if ("Notification" in window && Notification.permission === "granted") {
            new Notification("Free ADHD Memo", { body: message, icon: "/icons/icon-192.png" });
          }
          if (modeRef.current === "focus" && !activeSessionRef.current) {
            const durationMs = minutesRef.current.focus * 60 * 1000;
            recordSession({
              id: uid(),
              label: "뽀모도로 집중",
              startedAt: new Date(Date.now() - durationMs).toISOString(),
              endedAt: nowIso(),
            });
          }
          return 0;
        }
        return current - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [running, recordSession]);

  const selectMode = (next: TimerMode) => {
    setMode(next);
    setRunning(false);
    setSecondsLeft(minutes[next] * 60);
  };

  const toggle = () => {
    if (!running && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
    setRunning((current) => !current);
  };

  return (
    <Card className="shrink-0 gap-0 p-4.5">
      <div className="mb-2">
        <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">pomodoro</p>
        <h2 className="text-lg font-bold">타이머</h2>
      </div>
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
          min={1}
          max={180}
          className="h-8 w-16 text-center"
          value={minutes[mode]}
          onChange={(event) => {
            const value = Math.max(1, Math.min(180, Math.round(Number(event.target.value)) || defaultModeMinutes[mode]));
            const next = { ...minutes, [mode]: value };
            setMinutes(next);
            localStorage.setItem(TIMER_KEY, JSON.stringify(next));
            if (!running) setSecondsLeft(value * 60);
          }}
        />
      </div>
      <div className="mt-4 flex gap-2">
        <Button className="flex-1 font-bold" onClick={toggle}>
          {running ? <Square className="size-4" /> : <Play className="size-4" />}
          {running ? "정지" : "시작"}
        </Button>
        <Button variant="secondary" className="flex-1 font-bold" onClick={() => selectMode(mode)}>
          <RotateCcw className="size-4" />
          리셋
        </Button>
      </div>
    </Card>
  );
}
