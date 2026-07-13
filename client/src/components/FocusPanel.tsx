import { useEffect, useState } from "react";
import { ChevronDown, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAppData } from "@/hooks/useAppData";
import { cn } from "@/lib/utils";

const COLLAPSE_KEY = "free-adhd-memo:collapse:focus";

export function FocusPanel() {
  const { data, toggleTodo, activeSession, startSession, stopSession } = useAppData();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_KEY) === "1");
  const queue = data.todos.filter((todo) => !todo.done).slice(0, 4);

  useEffect(() => {
    localStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0");
  }, [collapsed]);

  return (
    <Card className="shrink-0 gap-0 p-4.5">
      <button
        type="button"
        className="flex w-full items-center justify-between text-left lg:pointer-events-none"
        onClick={() => setCollapsed((current) => !current)}
      >
        <div>
          <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">now</p>
          <h2 className="text-lg font-bold">집중 큐</h2>
        </div>
        <div className="flex items-center gap-2 lg:hidden">
          {collapsed && queue.length > 0 && (
            <span className="text-sm font-bold text-muted-foreground">{queue.length}개</span>
          )}
          <ChevronDown className={cn("size-5 text-muted-foreground transition-transform", collapsed && "-rotate-90")} />
        </div>
      </button>
      <div className={cn("mt-3 grid gap-2", collapsed && "max-lg:hidden")}>
        {queue.length ? (
          queue.map((todo) => (
            <div key={todo.id} className="flex gap-2">
              <button
                type="button"
                onClick={() => toggleTodo(todo.id)}
                className="flex min-w-0 flex-1 items-center gap-2 rounded-lg bg-muted px-3 py-2.5 text-left text-sm font-medium transition-colors hover:bg-accent"
              >
                <span aria-hidden="true" className="text-muted-foreground">○</span>
                <span className="break-words">{todo.title}</span>
              </button>
              <Button
                variant="secondary"
                size="icon"
                className="h-auto w-10 shrink-0 bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                title="이 일 기록 시작"
                onClick={() => {
                  if (activeSession) stopSession();
                  startSession(todo.title);
                }}
              >
                <Play className="size-4" />
              </Button>
            </div>
          ))
        ) : (
          <p className="text-sm font-medium text-muted-foreground">비어 있습니다. 쉬어도 됩니다.</p>
        )}
      </div>
    </Card>
  );
}
