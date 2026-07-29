import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Pencil, Play, Square, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAppData } from "@/hooks/useAppData";
import {
  dateKey,
  formatDate,
  formatDuration,
  formatTime,
  formatWeekdayShort,
  labelHue,
  sessionDurationMs,
  sessionMinutesOnDay,
  shiftDateKey,
  shortDate,
  todayKey,
  weekStartKey,
} from "@/lib/helpers";
import type { Session } from "@/lib/types";
import { cn } from "@/lib/utils";

const HOUR_PX = 44;
const WEEK_HOUR_PX = 16;
const FALLBACK_LABEL = "이름 없는 작업";

function Tracker() {
  const { activeSession, startSession, stopSession } = useAppData();
  const [label, setLabel] = useState("");
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!activeSession) return;
    const id = setInterval(() => setTick((tick) => tick + 1), 30000);
    return () => clearInterval(id);
  }, [activeSession]);

  if (activeSession) {
    return (
      <div className="mb-3 flex items-center justify-between gap-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950 px-3.5 py-3">
        <div className="min-w-0">
          <strong className="block break-words text-sm text-emerald-900 dark:text-emerald-100">
            {activeSession.label || FALLBACK_LABEL}
          </strong>
          <span className="text-xs font-bold text-emerald-700 dark:text-emerald-300">
            {formatTime(activeSession.startedAt)} 시작 ·{" "}
            {formatDuration(Date.now() - new Date(activeSession.startedAt).getTime())} 경과
          </span>
        </div>
        <Button variant="destructive" size="sm" className="shrink-0 font-bold" onClick={stopSession}>
          <Square className="size-3.5" />
          종료
        </Button>
      </div>
    );
  }

  return (
    <form
      className="mb-3 flex gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        startSession(label.trim());
        setLabel("");
      }}
    >
      <Input
        value={label}
        onChange={(event) => setLabel(event.target.value)}
        placeholder="지금 뭐 하는 중?"
        className="min-w-0 flex-1"
      />
      <Button type="submit" className="shrink-0 font-bold" title="기록 시작">
        <Play className="size-4" />
        시작
      </Button>
    </form>
  );
}

function DayGrid({ dayKey }: { dayKey: string }) {
  const { data, activeSession, deleteSession, updateSession } = useAppData();
  const gridRef = useRef<HTMLDivElement>(null);
  const didAutoScroll = useRef(false);

  const sessions = useMemo(
    () =>
      data.sessions
        .filter((session) => dateKey(new Date(session.startedAt)) === dayKey)
        .sort((a, b) => a.startedAt.localeCompare(b.startedAt)),
    [data.sessions, dayKey],
  );

  const drawable: (Session & { running?: boolean })[] = [...sessions];
  if (activeSession && dayKey === todayKey()) {
    drawable.push({ ...activeSession, endedAt: new Date().toISOString(), running: true });
  }

  const spans = drawable.map((session) => ({ session, ...sessionMinutesOnDay(session, dayKey) }));
  const startHour = Math.min(8, ...spans.map((span) => Math.floor(span.startMin / 60)));
  const endHour = Math.max(22, ...spans.map((span) => Math.ceil(span.endMin / 60)));

  useEffect(() => {
    if (!gridRef.current || didAutoScroll.current || !spans.length) return;
    const firstTop = Math.min(...spans.map((span) => (span.startMin - startHour * 60) * (HOUR_PX / 60)));
    gridRef.current.scrollTop = Math.max(0, firstTop - 12);
    didAutoScroll.current = true;
  });

  useEffect(() => {
    didAutoScroll.current = false;
  }, [dayKey]);

  if (!drawable.length) {
    return <p className="text-sm font-medium text-muted-foreground">기록이 없습니다. 위에서 시작을 눌러보세요.</p>;
  }

  const totalMs = sessions.reduce((sum, session) => sum + sessionDurationMs(session), 0);

  return (
    <>
      <div ref={gridRef} className="max-h-[440px] overflow-y-auto rounded-lg bg-muted">
        <div className="relative my-1.5" style={{ height: (endHour - startHour) * HOUR_PX }}>
          {Array.from({ length: endHour - startHour }).map((_, index) => (
            <div
              key={index}
              className="absolute right-0 left-0 border-t border-dashed border-border pt-0.5 pl-2 text-[11px] font-bold text-muted-foreground/70"
              style={{ top: index * HOUR_PX, height: HOUR_PX }}
            >
              {startHour + index}시
            </div>
          ))}
          {spans.map(({ session, startMin, endMin }) => {
            const running = (session as Session & { running?: boolean }).running;
            const label = session.label || FALLBACK_LABEL;
            const hue = labelHue(label);
            const timeText = `${formatTime(session.startedAt)} – ${running ? "지금" : formatTime(session.endedAt)}`;
            return (
              <div
                key={session.id + (running ? "-run" : "")}
                title={`${label} · ${timeText}`}
                className={cn(
                  "group absolute right-2 left-12 flex flex-col justify-center overflow-hidden rounded-md py-0.5 pr-5 pl-2 text-xs leading-tight",
                  running && "border-[1.5px] border-dashed border-emerald-700",
                )}
                style={{
                  top: (startMin - startHour * 60) * (HOUR_PX / 60),
                  height: Math.max(20, (endMin - startMin) * (HOUR_PX / 60)),
                  background: `hsl(${hue} 65% 88%)`,
                  borderLeft: running ? "3px solid #047857" : `3px solid hsl(${hue} 55% 42%)`,
                  color: "#1d2940",
                }}
              >
                <span className="truncate font-bold">{label}</span>
                <span className="truncate font-semibold opacity-60">{timeText}</span>
                {!running && (
                  <span className="absolute top-0.5 right-0.5 flex opacity-0 transition-opacity group-hover:opacity-100 max-lg:opacity-70">
                    <button
                      type="button"
                      title="기록 이름 수정"
                      onClick={() => {
                        const next = window.prompt("기록 이름", session.label || FALLBACK_LABEL);
                        if (next !== null) updateSession(session.id, next === FALLBACK_LABEL ? "" : next);
                      }}
                      className="grid size-4.5 place-items-center rounded"
                    >
                      <Pencil className="size-3" />
                    </button>
                    <button
                      type="button"
                      title="기록 삭제"
                      onClick={() => deleteSession(session.id)}
                      className="grid size-4.5 place-items-center rounded"
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
      {totalMs > 0 && (
        <p className="mt-2 text-right text-xs font-black text-emerald-700 dark:text-emerald-300">합계 {formatDuration(totalMs)}</p>
      )}
    </>
  );
}

function WeekGrid({ anchorKey }: { anchorKey: string }) {
  const { data } = useAppData();
  const startKey = weekStartKey(anchorKey);
  const today = todayKey();
  const dayKeys = Array.from({ length: 7 }, (_, index) => shiftDateKey(startKey, index));

  const byDay = new Map<string, Session[]>(dayKeys.map((key) => [key, []]));
  data.sessions.forEach((session) => {
    const key = dateKey(new Date(session.startedAt));
    if (byDay.has(key)) byDay.get(key)!.push(session);
  });
  const weekSessions = dayKeys.flatMap((key) => byDay.get(key)!);

  if (!weekSessions.length) {
    return <p className="text-sm font-medium text-muted-foreground">이번 주 기록이 없습니다.</p>;
  }

  let startHour = 8;
  let endHour = 22;
  dayKeys.forEach((key) => {
    byDay.get(key)!.forEach((session) => {
      const { startMin, endMin } = sessionMinutesOnDay(session, key);
      startHour = Math.min(startHour, Math.floor(startMin / 60));
      endHour = Math.max(endHour, Math.ceil(endMin / 60));
    });
  });

  const totals = new Map<string, number>();
  weekSessions.forEach((session) => {
    const label = session.label || FALLBACK_LABEL;
    totals.set(label, (totals.get(label) || 0) + sessionDurationMs(session));
  });
  const totalMs = weekSessions.reduce((sum, session) => sum + sessionDurationMs(session), 0);

  return (
    <>
      <div className="grid grid-cols-7 gap-1">
        {dayKeys.map((key) => {
          const date = new Date(`${key}T00:00:00`);
          return (
            <div key={key}>
              <span
                className={cn(
                  "mb-1 block text-center text-[11px] leading-tight font-bold text-muted-foreground",
                  key === today && "text-emerald-700 dark:text-emerald-300",
                )}
              >
                {formatWeekdayShort(date)}
                <br />
                {date.getDate()}
              </span>
              <div
                className={cn("relative overflow-hidden rounded-md bg-muted", key === today && "ring-[1.5px] ring-emerald-600 ring-inset")}
                style={{ height: (endHour - startHour) * WEEK_HOUR_PX }}
              >
                {byDay.get(key)!.map((session) => {
                  const { startMin, endMin } = sessionMinutesOnDay(session, key);
                  const label = session.label || FALLBACK_LABEL;
                  return (
                    <div
                      key={session.id}
                      title={`${label} · ${formatTime(session.startedAt)} – ${formatTime(session.endedAt)}`}
                      className="absolute right-0.5 left-0.5 rounded-sm"
                      style={{
                        top: (startMin - startHour * 60) * (WEEK_HOUR_PX / 60),
                        height: Math.max(5, (endMin - startMin) * (WEEK_HOUR_PX / 60)),
                        background: `hsl(${labelHue(label)} 60% 62%)`,
                      }}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-3 grid gap-1">
        {[...totals.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 8)
          .map(([label, ms]) => (
            <div key={label} className="flex items-center gap-2 px-1 text-sm">
              <span className="size-2.5 shrink-0 rounded-sm" style={{ background: `hsl(${labelHue(label)} 60% 55%)` }} />
              <span className="min-w-0 flex-1 truncate font-semibold">{label}</span>
              <span className="text-xs font-bold text-muted-foreground">{formatDuration(ms)}</span>
            </div>
          ))}
      </div>
      <p className="mt-2 text-right text-xs font-black text-emerald-700 dark:text-emerald-300">합계 {formatDuration(totalMs)}</p>
    </>
  );
}

export function TimetablePanel() {
  const [view, setView] = useState("day");
  const [anchorKey, setAnchorKey] = useState(todayKey);
  const today = todayKey();

  const label =
    view === "week"
      ? weekStartKey(anchorKey) === weekStartKey(today)
        ? "이번 주"
        : `${shortDate(weekStartKey(anchorKey))} – ${shortDate(shiftDateKey(weekStartKey(anchorKey), 6))}`
      : anchorKey === today
        ? "오늘"
        : formatDate(`${anchorKey}T00:00:00`);

  return (
    <Card className="shrink-0 gap-0 p-4.5">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">time</p>
          <h2 className="text-lg font-bold">타임테이블</h2>
        </div>
        <Tabs value={view} onValueChange={setView}>
          <TabsList>
            <TabsTrigger value="day">일</TabsTrigger>
            <TabsTrigger value="week">주</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <Tracker />
      <div className="mb-2.5 flex items-center justify-between">
        <Button
          variant="secondary"
          size="icon"
          className="size-7"
          title="이전"
          onClick={() => setAnchorKey(shiftDateKey(anchorKey, view === "week" ? -7 : -1))}
        >
          <ChevronLeft className="size-4" />
        </Button>
        <h3 className="text-sm font-bold text-muted-foreground">{label}</h3>
        <Button
          variant="secondary"
          size="icon"
          className="size-7"
          title="다음"
          onClick={() => setAnchorKey(shiftDateKey(anchorKey, view === "week" ? 7 : 1))}
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>
      {view === "day" ? <DayGrid dayKey={anchorKey} /> : <WeekGrid anchorKey={anchorKey} />}
    </Card>
  );
}
