import { useEffect, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Pencil, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAppData } from "@/hooks/useAppData";
import { dateKey, formatDate, scopeLabels, todayKey } from "@/lib/helpers";
import type { Scope, Todo } from "@/lib/types";
import { cn } from "@/lib/utils";

function sortTodos(todos: Todo[]) {
  return [...todos].sort((a, b) => Number(a.done) - Number(b.done) || b.createdAt.localeCompare(a.createdAt));
}

function TodoRow({ todo }: { todo: Todo }) {
  const { toggleTodo, deleteTodo, updateTodoTitle, pauseSyncRef } = useAppData();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(todo.title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    pauseSyncRef.current = editing;
    return () => {
      pauseSyncRef.current = false;
    };
  }, [editing, pauseSyncRef]);

  const commit = () => {
    setEditing(false);
    const title = draft.trim();
    if (title && title !== todo.title) updateTodoTitle(todo.id, title);
    else setDraft(todo.title);
  };

  return (
    <div className="group flex items-start gap-2 py-1">
      <button
        type="button"
        onClick={() => toggleTodo(todo.id)}
        title="완료 전환"
        className={cn(
          "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border transition-colors",
          todo.done ? "border-emerald-600 bg-emerald-600 text-white" : "border-muted-foreground/40 text-transparent hover:border-emerald-600",
        )}
      >
        <Check className="size-3.5" strokeWidth={3} />
      </button>
      {editing ? (
        <Input
          ref={inputRef}
          autoFocus
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") commit();
            if (event.key === "Escape") {
              setDraft(todo.title);
              setEditing(false);
            }
          }}
          className="h-7 flex-1 px-2 text-sm"
        />
      ) : (
        <span
          className={cn(
            "min-w-0 flex-1 break-words text-sm leading-snug",
            todo.done && "text-muted-foreground line-through",
          )}
        >
          {todo.title}
          {todo.dueDate && <span className="ml-1.5 text-xs font-semibold text-muted-foreground">~{todo.dueDate}</span>}
        </span>
      )}
      {!editing && (
        <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 max-lg:opacity-100">
          <Button variant="ghost" size="icon" className="size-6" title="수정" onClick={() => setEditing(true)}>
            <Pencil className="size-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="size-6" title="삭제" onClick={() => deleteTodo(todo.id)}>
            <X className="size-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}

function TodoForm() {
  const { addTodo } = useAppData();
  const [title, setTitle] = useState("");
  const [scope, setScope] = useState<Scope>("day");
  const [dueDate, setDueDate] = useState(todayKey());

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    addTodo({ title: trimmed, scope, dueDate: dueDate || null });
    setTitle("");
    setDueDate(todayKey());
  };

  return (
    <form onSubmit={submit} className="flex shrink-0 flex-wrap items-center gap-2">
      <Input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="할 일 추가"
        className="min-w-40 flex-1"
      />
      <Input
        type="date"
        value={dueDate}
        onChange={(event) => setDueDate(event.target.value)}
        title="마감일 (기본 오늘)"
        className="w-36 text-muted-foreground max-sm:flex-1"
      />
      <Select value={scope} onValueChange={(value) => setScope(value as Scope)}>
        <SelectTrigger className="w-27">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="day">오늘</SelectItem>
          <SelectItem value="week">이번 주</SelectItem>
          <SelectItem value="month">이번 달</SelectItem>
        </SelectContent>
      </Select>
      <Button type="submit" size="icon" title="추가">
        <Plus className="size-4" />
      </Button>
    </form>
  );
}

function CalendarView() {
  const { data, addTodo } = useAppData();
  const [month, setMonth] = useState(() => new Date());
  const [selected, setSelected] = useState<string | null>(null);
  const [quickTitle, setQuickTitle] = useState("");

  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const firstDay = new Date(year, monthIndex, 1);
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const today = todayKey();

  const countByDate = data.todos.reduce<Record<string, number>>((acc, todo) => {
    if (!todo.dueDate) return acc;
    acc[todo.dueDate] = (acc[todo.dueDate] || 0) + 1;
    return acc;
  }, {});

  const selectedTodos = selected
    ? sortTodos(data.todos.filter((todo) => todo.dueDate === selected))
    : [];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row">
      <div className="flex min-w-0 flex-[1.4] flex-col">
        <div className="mb-2 flex items-center justify-between">
          <Button variant="secondary" size="icon" className="size-8" onClick={() => setMonth(new Date(year, monthIndex - 1, 1))}>
            <ChevronLeft className="size-4" />
          </Button>
          <h3 className="text-sm font-bold">{year}년 {monthIndex + 1}월</h3>
          <Button variant="secondary" size="icon" className="size-8" onClick={() => setMonth(new Date(year, monthIndex + 1, 1))}>
            <ChevronRight className="size-4" />
          </Button>
        </div>
        <div className="mb-1.5 grid grid-cols-7 text-center text-xs font-bold text-muted-foreground">
          {["일", "월", "화", "수", "목", "금", "토"].map((day) => (
            <span key={day}>{day}</span>
          ))}
        </div>
        <div className="grid min-h-0 flex-1 auto-rows-fr grid-cols-7 gap-1.5 overflow-y-auto">
          {Array.from({ length: firstDay.getDay() }).map((_, index) => (
            <div key={`blank-${index}`} />
          ))}
          {Array.from({ length: daysInMonth }).map((_, index) => {
            const day = index + 1;
            const key = dateKey(new Date(year, monthIndex, day));
            const count = countByDate[key] || 0;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setSelected(key)}
                className={cn(
                  "flex min-h-11 flex-col items-start justify-between rounded-md bg-muted p-1.5 text-sm font-semibold transition-colors hover:bg-accent",
                  key === today && "ring-2 ring-emerald-600 ring-inset",
                  key === selected && "bg-primary text-primary-foreground hover:bg-primary",
                )}
              >
                <span>{day}</span>
                {count > 0 && (
                  <span
                    className={cn(
                      "self-end rounded-full bg-emerald-700 px-1.5 text-[11px] text-white",
                      key === selected && "bg-white text-primary",
                    )}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
      <div className="min-w-0 flex-1 overflow-y-auto rounded-lg bg-muted p-3.5">
        {selected ? (
          <>
            <h4 className="mb-3 text-sm font-bold">{formatDate(`${selected}T00:00:00`)}</h4>
            <form
              className="mb-3 flex gap-1.5"
              onSubmit={(event) => {
                event.preventDefault();
                const title = quickTitle.trim();
                if (!title) return;
                addTodo({ title, scope: "day", dueDate: selected });
                setQuickTitle("");
              }}
            >
              <Input
                value={quickTitle}
                onChange={(event) => setQuickTitle(event.target.value)}
                placeholder="이 날짜에 할 일 추가"
                className="h-8 bg-background"
              />
              <Button type="submit" size="icon" className="size-8 shrink-0">
                <Plus className="size-4" />
              </Button>
            </form>
            {selectedTodos.length ? (
              selectedTodos.map((todo) => <TodoRow key={todo.id} todo={todo} />)
            ) : (
              <p className="text-sm font-medium text-muted-foreground">이 날짜에 마감인 할 일이 없습니다.</p>
            )}
          </>
        ) : (
          <p className="text-sm font-medium text-muted-foreground">
            날짜를 선택하면 그날 마감인 할 일을 보고 추가할 수 있습니다.
          </p>
        )}
      </div>
    </div>
  );
}

export function TodoPanel() {
  const { data } = useAppData();
  const [view, setView] = useState("list");

  return (
    <Card className="flex min-h-0 flex-1 flex-col gap-0 p-4.5">
      <div className="mb-3 flex shrink-0 items-center justify-between gap-4">
        <div>
          <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">todo</p>
          <h2 className="text-lg font-bold">기간별 할 일</h2>
        </div>
        <Tabs value={view} onValueChange={setView}>
          <TabsList>
            <TabsTrigger value="list">목록</TabsTrigger>
            <TabsTrigger value="calendar">캘린더</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      {view === "list" ? (
        <>
          <div className="mb-3">
            <TodoForm />
          </div>
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-3">
            {(Object.keys(scopeLabels) as Scope[]).map((scope) => {
              const items = sortTodos(data.todos.filter((todo) => todo.scope === scope));
              return (
                <div key={scope} className="min-h-32 overflow-y-auto rounded-lg bg-muted p-3">
                  <h3 className="mb-2 text-sm font-bold text-muted-foreground">{scopeLabels[scope]}</h3>
                  {items.length ? (
                    items.map((todo) => <TodoRow key={todo.id} todo={todo} />)
                  ) : (
                    <p className="text-sm font-medium text-muted-foreground/70">없음</p>
                  )}
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <CalendarView />
      )}
    </Card>
  );
}
