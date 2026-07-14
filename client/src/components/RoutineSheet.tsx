import { useState } from "react";
import { Plus, Repeat, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useAppData } from "@/hooks/useAppData";
import type { Routine } from "@/lib/types";
import { cn } from "@/lib/utils";

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];
const EVERYDAY = [0, 1, 2, 3, 4, 5, 6];
const WEEKDAYS_ONLY = [1, 2, 3, 4, 5];

function WeekdayPicker({ value, onChange }: { value: number[]; onChange: (weekdays: number[]) => void }) {
  return (
    <div className="flex gap-1">
      {WEEKDAY_LABELS.map((label, day) => {
        const active = value.includes(day);
        return (
          <button
            key={day}
            type="button"
            aria-pressed={active}
            title={`${label}요일`}
            onClick={() => onChange(active ? value.filter((item) => item !== day) : [...value, day].sort())}
            className={cn(
              "size-8 shrink-0 rounded-full text-xs font-bold transition-colors",
              active ? "bg-emerald-600 text-white" : "bg-muted text-muted-foreground hover:bg-accent",
            )}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

function weekdaySummary(weekdays: number[]) {
  if (weekdays.length === 0) return "요일 없음 (안 만들어집니다)";
  if (weekdays.length === 7) return "매일";
  if (weekdays.length === 5 && WEEKDAYS_ONLY.every((day) => weekdays.includes(day))) return "평일";
  return weekdays.map((day) => WEEKDAY_LABELS[day]).join("·");
}

function RoutineRow({ routine }: { routine: Routine }) {
  const { updateRoutine, deleteRoutine } = useAppData();

  return (
    <div className={cn("rounded-lg bg-muted p-3", !routine.active && "opacity-60")}>
      <div className="mb-2 flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold">{routine.title}</p>
          <p className="text-xs font-medium text-muted-foreground">
            {weekdaySummary(routine.weekdays)}
            {routine.category && ` · ${routine.category}`}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 shrink-0 text-xs font-bold"
          onClick={() => void updateRoutine(routine.id, { active: !routine.active })}
        >
          {routine.active ? "끄기" : "켜기"}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 shrink-0"
          title="루틴 삭제"
          onClick={() => void deleteRoutine(routine.id)}
        >
          <X className="size-3.5" />
        </Button>
      </div>
      <WeekdayPicker
        value={routine.weekdays}
        onChange={(weekdays) => void updateRoutine(routine.id, { weekdays })}
      />
    </div>
  );
}

export function RoutineSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { data, addRoutine } = useAppData();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [weekdays, setWeekdays] = useState<number[]>(EVERYDAY);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed || weekdays.length === 0) return;
    await addRoutine({ title: trimmed, weekdays, category: category.trim() || null });
    setTitle("");
    setCategory("");
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-y-auto p-4 sm:max-w-md">
        <SheetHeader className="p-0 pb-3">
          <SheetTitle className="flex items-center gap-1.5 text-xs font-bold tracking-wide text-muted-foreground uppercase">
            <Repeat className="size-3.5" />
            루틴
          </SheetTitle>
        </SheetHeader>
        <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
          고른 요일이 되면 오늘 할 일에 자동으로 들어갑니다. 약 먹기는 매일, 필라테스는 월·수·금처럼요.
        </p>

        <form onSubmit={submit} className="mb-4 space-y-2 rounded-lg border p-3">
          <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="루틴 이름" />
          <Input
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            placeholder="카테고리 (선택)"
          />
          <div className="flex items-center justify-between gap-2">
            <WeekdayPicker value={weekdays} onChange={setWeekdays} />
            <Button type="submit" size="icon" title="루틴 추가" disabled={!title.trim() || weekdays.length === 0}>
              <Plus className="size-4" />
            </Button>
          </div>
          <div className="flex gap-1.5">
            <Button type="button" variant="secondary" size="sm" className="h-7 text-xs" onClick={() => setWeekdays(EVERYDAY)}>
              매일
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setWeekdays(WEEKDAYS_ONLY)}
            >
              평일
            </Button>
          </div>
        </form>

        {data.routines.length ? (
          <div className="space-y-2">
            {data.routines.map((routine) => (
              <RoutineRow key={routine.id} routine={routine} />
            ))}
          </div>
        ) : (
          <p className="text-sm font-medium text-muted-foreground">아직 루틴이 없습니다.</p>
        )}
      </SheetContent>
    </Sheet>
  );
}
