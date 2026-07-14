import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, ChevronLeft, ChevronRight, Pencil, Plus, StickyNote, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useAppData } from "@/hooks/useAppData";
import { dateKey, daysFromToday, formatDate, labelHue, scopeLabels, todayKey } from "@/lib/helpers";
import type { Scope, Todo } from "@/lib/types";
import { cn } from "@/lib/utils";

function sortTodos(todos: Todo[]) {
  return [...todos].sort(
    (a, b) =>
      (Number.isFinite(a.sortOrder) ? a.sortOrder! : Number.MAX_SAFE_INTEGER) -
        (Number.isFinite(b.sortOrder) ? b.sortOrder! : Number.MAX_SAFE_INTEGER) ||
      a.createdAt.localeCompare(b.createdAt),
  );
}

function CategoryChip({
  category,
  onClick,
  onPointerDown,
  active,
}: {
  category: string;
  onClick?: () => void;
  onPointerDown?: (event: React.PointerEvent) => void;
  active?: boolean;
}) {
  const hue = labelHue(category);
  return (
    <button
      type="button"
      onClick={onClick}
      onPointerDown={onPointerDown}
      className={cn(
        "inline-flex max-w-32 shrink-0 items-center truncate rounded-full px-2 py-px text-[11px] font-bold",
        (onClick || onPointerDown) && "cursor-pointer",
        active && "ring-2 ring-offset-1",
      )}
      style={{ background: `hsl(${hue} 65% 88%)`, color: `hsl(${hue} 60% 28%)` }}
    >
      {category}
    </button>
  );
}

function TodoRow({
  todo,
  draggable = false,
  depth = 0,
  children = [],
}: {
  todo: Todo;
  draggable?: boolean;
  depth?: number;
  children?: Todo[];
}) {
  const { toggleTodo, deleteTodo, updateTodo, pauseSyncRef } = useAppData();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(todo.title);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState(todo.note || "");
  const [collapsed, setCollapsed] = useState(false);

  const overdueDays = todo.dueDate && !todo.done ? -daysFromToday(todo.dueDate) : 0;
  const overdue = overdueDays > 0;

  useEffect(() => {
    pauseSyncRef.current = editing || noteOpen;
    return () => {
      pauseSyncRef.current = false;
    };
  }, [editing, noteOpen, pauseSyncRef]);

  const commitTitle = () => {
    setEditing(false);
    const title = draft.trim();
    if (title && title !== todo.title) updateTodo(todo.id, { title });
    else setDraft(todo.title);
  };

  const commitNote = () => {
    setNoteOpen(false);
    const note = noteDraft.trim();
    if (note !== (todo.note || "")) updateTodo(todo.id, { note });
  };

  return (
    <div
      className={cn("group py-1", depth === 1 && "ml-7 border-l-2 border-border/70 pl-3")}
      draggable={draggable && !editing && !noteOpen}
      onDragStart={(event) => {
        event.dataTransfer.setData("text/todo-id", todo.id);
        event.dataTransfer.effectAllowed = "move";
      }}
    >
      <div className="flex items-start gap-2">
        {children.length > 0 && (
          <button
            type="button"
            className="mt-0.5 grid size-5 shrink-0 place-items-center text-muted-foreground"
            title={collapsed ? "하위 목표 펼치기" : "하위 목표 접기"}
            onClick={() => setCollapsed((value) => !value)}
          >
            <ChevronDown className={cn("size-4 transition-transform", collapsed && "-rotate-90")} />
          </button>
        )}
        <button
          type="button"
          onClick={() => toggleTodo(todo.id)}
          title="완료 전환"
          className={cn(
            "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border transition-colors",
            todo.done
              ? "border-emerald-600 bg-emerald-600 text-white"
              : "border-muted-foreground/40 text-transparent hover:border-emerald-600",
          )}
        >
          <Check className="size-3.5" strokeWidth={3} />
        </button>
        {editing ? (
          <Input
            autoFocus
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commitTitle}
            onKeyDown={(event) => {
              if (event.key === "Enter") commitTitle();
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
            {todo.category && <CategoryChip category={todo.category} />}
            {todo.category && " "}
            {todo.title}
            {children.length > 0 && (
              <span className="ml-1.5 text-xs font-bold text-muted-foreground">
                ({children.filter((child) => child.done).length}/{children.length})
              </span>
            )}
            {todo.dueDate && (
              <span
                className={cn(
                  "ml-1.5 text-xs font-semibold whitespace-nowrap",
                  overdue ? "font-bold text-red-600" : "text-muted-foreground",
                )}
              >
                ~{todo.dueDate}
                {overdue && ` (${overdueDays}일 지남)`}
              </span>
            )}
          </span>
        )}
        {!editing && (
          <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 max-lg:opacity-100">
            <Button
              variant="ghost"
              size="icon"
              className={cn("size-6", todo.note && "text-amber-600")}
              title={todo.note ? "메모 보기/수정" : "메모 달기"}
              onClick={() => {
                setNoteDraft(todo.note || "");
                setNoteOpen((open) => !open);
              }}
            >
              <StickyNote className="size-3.5" fill={todo.note ? "currentColor" : "none"} fillOpacity={0.25} />
            </Button>
            <Button variant="ghost" size="icon" className="size-6" title="수정" onClick={() => setEditing(true)}>
              <Pencil className="size-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="size-6" title="삭제" onClick={() => deleteTodo(todo.id)}>
              <X className="size-3.5" />
            </Button>
          </div>
        )}
      </div>
      {noteOpen ? (
        <Textarea
          autoFocus
          value={noteDraft}
          onChange={(event) => setNoteDraft(event.target.value)}
          onBlur={commitNote}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setNoteDraft(todo.note || "");
              setNoteOpen(false);
            }
          }}
          placeholder="이 할 일에 대한 메모 (비우고 저장하면 삭제)"
          className="mt-1.5 ml-7 min-h-14 w-auto bg-background text-xs"
        />
      ) : (
        todo.note && (
          <p
            className="mt-1 ml-7 cursor-pointer text-xs leading-relaxed whitespace-pre-wrap text-muted-foreground"
            title="클릭해서 수정"
            onClick={() => {
              setNoteDraft(todo.note || "");
              setNoteOpen(true);
            }}
          >
            {todo.note}
          </p>
        )
      )}
      {!collapsed && children.length > 0 && (
        <div className="mt-0.5">
          {children.map((child) => (
            <TodoRow key={child.id} todo={child} depth={1} />
          ))}
        </div>
      )}
    </div>
  );
}

function TodoForm({ categories }: { categories: string[] }) {
  const { addTodo } = useAppData();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [scope, setScope] = useState<Scope>("day");
  const [dueDate, setDueDate] = useState(todayKey());
  const [pickerOpen, setPickerOpen] = useState(false);

  const typed = category.trim().toLowerCase();
  const suggestions = categories.filter((item) => item.toLowerCase().includes(typed));

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    addTodo({ title: trimmed, scope, dueDate: dueDate || null, category: category.trim() || null });
    setTitle("");
  };

  return (
    <form onSubmit={submit} className="flex shrink-0 flex-wrap items-center gap-2">
      <div className="relative w-30 max-sm:flex-1">
        <Input
          value={category}
          onChange={(event) => {
            setCategory(event.target.value);
            setPickerOpen(true);
          }}
          onFocus={() => setPickerOpen(true)}
          onBlur={() => setPickerOpen(false)}
          onKeyDown={(event) => {
            if (event.key === "Escape") setPickerOpen(false);
          }}
          placeholder="카테고리 (선택)"
          className="w-full"
        />
        {pickerOpen && suggestions.length > 0 && (
          <div className="absolute top-full left-0 z-20 mt-1 flex max-h-40 w-max min-w-full max-w-64 flex-wrap gap-1.5 overflow-y-auto rounded-lg border bg-popover p-2 shadow-md">
            {suggestions.map((item) => (
              <CategoryChip
                key={item}
                category={item}
                // 입력창이 blur되면서 클릭이 취소되지 않도록 기본 동작을 막는다.
                onPointerDown={(event) => {
                  event.preventDefault();
                  setCategory(item);
                  setPickerOpen(false);
                }}
              />
            ))}
          </div>
        )}
      </div>
      <Input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="할 일 추가"
        className="min-w-36 flex-1"
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

  const selectedTodos = selected ? sortTodos(data.todos.filter((todo) => todo.dueDate === selected)) : [];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row">
      <div className="flex min-w-0 flex-[1.4] flex-col">
        <div className="mb-2 flex items-center justify-between">
          <Button
            variant="secondary"
            size="icon"
            className="size-8"
            onClick={() => setMonth(new Date(year, monthIndex - 1, 1))}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <h3 className="text-sm font-bold">
            {year}년 {monthIndex + 1}월
          </h3>
          <Button
            variant="secondary"
            size="icon"
            className="size-8"
            onClick={() => setMonth(new Date(year, monthIndex + 1, 1))}
          >
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
  const { data, updateTodo } = useAppData();
  const [view, setView] = useState("list");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [dropScope, setDropScope] = useState<Scope | null>(null);

  const categories = useMemo(
    () =>
      Array.from(new Set(data.todos.map((todo) => todo.category).filter(Boolean) as string[])).sort((a, b) =>
        a.localeCompare(b),
      ),
    [data.todos],
  );

  useEffect(() => {
    if (categoryFilter && !categories.includes(categoryFilter)) setCategoryFilter(null);
  }, [categories, categoryFilter]);

  return (
    <Card className="@container flex min-h-0 flex-1 flex-col gap-0 p-4.5">
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
          <div className="mb-2.5">
            <TodoForm categories={categories} />
          </div>
          {categories.length > 0 && (
            <div className="mb-2.5 flex shrink-0 flex-wrap items-center gap-1.5">
              <Badge
                variant={categoryFilter ? "outline" : "default"}
                className="cursor-pointer font-semibold"
                onClick={() => setCategoryFilter(null)}
              >
                전체
              </Badge>
              {categories.map((category) => (
                <CategoryChip
                  key={category}
                  category={category}
                  active={categoryFilter === category}
                  onClick={() => setCategoryFilter(categoryFilter === category ? null : category)}
                />
              ))}
            </div>
          )}
          {/* 패널이 좁은 자리로 옮겨질 수 있으므로 뷰포트가 아니라 패널 폭 기준으로 접는다. */}
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto @2xl:grid-cols-3 @2xl:overflow-visible">
            {(Object.keys(scopeLabels) as Scope[]).map((scope) => {
              const scopeTodos = data.todos.filter((todo) => todo.scope === scope);
              const items = sortTodos(scopeTodos.filter((todo) => !todo.parentId)).filter((todo) => {
                if (!categoryFilter) return true;
                return (
                  todo.category === categoryFilter ||
                  scopeTodos.some((child) => child.parentId === todo.id && child.category === categoryFilter)
                );
              });
              return (
                <div
                  key={scope}
                  className={cn(
                    "min-h-32 overflow-y-auto rounded-lg bg-muted p-3 transition-shadow",
                    dropScope === scope && "shadow-[inset_0_0_0_2px_theme(colors.emerald.500)]",
                  )}
                  onDragOver={(event) => {
                    if (!event.dataTransfer.types.includes("text/todo-id")) return;
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                    setDropScope(scope);
                  }}
                  onDragLeave={() => setDropScope((current) => (current === scope ? null : current))}
                  onDrop={(event) => {
                    event.preventDefault();
                    setDropScope(null);
                    const id = event.dataTransfer.getData("text/todo-id");
                    const todo = data.todos.find((item) => item.id === id);
                    if (todo && todo.scope !== scope) updateTodo(id, { scope });
                  }}
                >
                  <h3 className="mb-2 text-sm font-bold text-muted-foreground">{scopeLabels[scope]}</h3>
                  {items.length ? (
                    items.map((todo) => (
                      <TodoRow
                        key={todo.id}
                        todo={todo}
                        children={sortTodos(scopeTodos.filter((child) => child.parentId === todo.id))}
                        draggable
                      />
                    ))
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
