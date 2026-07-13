import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import { GripVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useAppData } from "@/hooks/useAppData";
import { cn } from "@/lib/utils";
import type { Memo } from "@/lib/types";

/* 사용자가 지정한 순서(sortOrder 오름차순). 순서가 없는 기존 메모는 최신순으로 뒤에 붙인다. */
function sortMemos(memos: Memo[]) {
  return [...memos].sort((a, b) => {
    const aOrder = Number.isFinite(a.sortOrder) ? a.sortOrder! : null;
    const bOrder = Number.isFinite(b.sortOrder) ? b.sortOrder! : null;
    if (aOrder !== null && bOrder !== null && aOrder !== bOrder) return aOrder - bOrder;
    if (aOrder !== null && bOrder === null) return -1;
    if (aOrder === null && bOrder !== null) return 1;
    return b.createdAt.localeCompare(a.createdAt);
  });
}

function submitOnCtrlEnter(event: KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) {
  if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }
}

function MemoComposer() {
  const { addMemo } = useAppData();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const canSave = Boolean(title.trim() || body.trim());

  return (
    <form
      className="shrink-0 rounded-lg border bg-card p-2.5 shadow-sm"
      onSubmit={(event) => {
        event.preventDefault();
        if (!canSave) return;
        addMemo({ title: title.trim(), body: body.trim() });
        setTitle("");
        setBody("");
      }}
    >
      <Input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={submitOnCtrlEnter}
        placeholder="제목 (선택)"
        className="h-8 border-0 px-1 font-semibold shadow-none focus-visible:ring-0"
      />
      <Textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={submitOnCtrlEnter}
        placeholder="메모 작성..."
        className="min-h-14 resize-y border-0 px-1 shadow-none focus-visible:ring-0"
      />
      <div className="mt-1 flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">Ctrl+Enter로 바로 저장</span>
        <Button type="submit" size="sm" className="font-bold" disabled={!canSave}>
          <Plus className="size-4" />
          저장
        </Button>
      </div>
    </form>
  );
}

function MemoCard({
  memo,
  dragging,
  onDragStart,
  onDragEnter,
  onDragEnd,
  onDrop,
}: {
  memo: Memo;
  dragging: boolean;
  onDragStart: (event: DragEvent) => void;
  onDragEnter: () => void;
  onDragEnd: () => void;
  onDrop: () => void;
}) {
  const { updateMemo, deleteMemo } = useAppData();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  const startEdit = () => {
    setTitle(memo.title || "");
    setBody(memo.body);
    setEditing(true);
  };

  if (editing) {
    const canSave = Boolean(title.trim() || body.trim());
    return (
      <form
        className="col-span-full rounded-lg border border-emerald-400 bg-card p-2.5 shadow-sm"
        onSubmit={(event) => {
          event.preventDefault();
          if (!canSave) return;
          updateMemo(memo.id, { title: title.trim(), body: body.trim() });
          setEditing(false);
        }}
      >
        <Input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={submitOnCtrlEnter}
          placeholder="제목 (선택)"
          className="h-8 border-0 px-1 font-semibold shadow-none focus-visible:ring-0"
          autoFocus
        />
        <Textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          onKeyDown={submitOnCtrlEnter}
          placeholder="메모 작성..."
          className="min-h-20 resize-y border-0 px-1 shadow-none focus-visible:ring-0"
        />
        <div className="mt-1 flex items-center justify-end gap-1.5">
          <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
            취소
          </Button>
          <Button type="submit" size="sm" className="font-bold" disabled={!canSave}>
            저장
          </Button>
        </div>
      </form>
    );
  }

  return (
    <article
      draggable
      onDragStart={onDragStart}
      onDragEnter={(event) => {
        event.preventDefault();
        onDragEnter();
      }}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
      }}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onDrop();
      }}
      onDragEnd={onDragEnd}
      className={cn(
        "group flex min-h-24 cursor-grab flex-col rounded-lg border bg-card p-2.5 shadow-sm transition-shadow hover:shadow-md",
        dragging && "opacity-40 ring-2 ring-emerald-500",
      )}
    >
      <div className="flex items-start gap-1">
        {memo.title ? (
          <h3 className="min-w-0 flex-1 text-sm font-bold break-words">{memo.title}</h3>
        ) : (
          <span className="flex-1" />
        )}
        <GripVertical className="size-4 shrink-0 text-muted-foreground/50" />
      </div>
      {memo.body && (
        <p className="mt-1 text-xs leading-relaxed break-words whitespace-pre-wrap line-clamp-[8]">{memo.body}</p>
      )}
      <div className="mt-auto flex justify-end gap-0.5 pt-1.5 opacity-0 transition-opacity group-hover:opacity-100 max-lg:opacity-100">
        <button
          type="button"
          title="메모 수정"
          onClick={startEdit}
          className="grid size-6 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Pencil className="size-3.5" />
        </button>
        <button
          type="button"
          title="메모 삭제"
          onClick={() => deleteMemo(memo.id)}
          className="grid size-6 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-destructive"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
    </article>
  );
}

export function MemoWorkspace() {
  const { data, reorderMemos } = useAppData();
  const [previewIds, setPreviewIds] = useState<string[] | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [orderError, setOrderError] = useState(false);
  const previewRef = useRef<string[] | null>(null);
  previewRef.current = previewIds;

  const sorted = sortMemos(data.memos);
  const baseIds = sorted.map((memo) => memo.id);
  const byId = new Map(sorted.map((memo) => [memo.id, memo]));
  const displayed = (previewIds ?? baseIds)
    .map((id) => byId.get(id))
    .filter((memo): memo is Memo => Boolean(memo));

  /* 드래그 중 카드가 들어갈 위치를 미리 보여주기 위해 표시 순서만 먼저 바꾼다. */
  const moveBefore = (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    setPreviewIds((prev) => {
      const ids = prev ?? baseIds;
      const from = ids.indexOf(dragId);
      const to = ids.indexOf(targetId);
      if (from < 0 || to < 0 || from === to) return prev;
      const next = [...ids];
      next.splice(from, 1);
      next.splice(to, 0, dragId);
      return next;
    });
  };

  /* drop은 카드와 컨테이너에서 중복 발생할 수 있으므로 ref를 먼저 비워 한 번만 커밋한다. */
  const commitDrop = async () => {
    const ids = previewRef.current;
    previewRef.current = null;
    setDragId(null);
    setPreviewIds(null);
    if (!ids || ids.join("\n") === baseIds.join("\n")) return;
    setOrderError(false);
    const ok = await reorderMemos(ids);
    if (!ok) setOrderError(true);
  };

  const cancelDrag = () => {
    setDragId(null);
    setPreviewIds(null);
  };

  useEffect(() => {
    if (!orderError) return;
    const timer = setTimeout(() => setOrderError(false), 5000);
    return () => clearTimeout(timer);
  }, [orderError]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MemoComposer />

      {orderError && (
        <p className="mt-2 shrink-0 rounded-md bg-destructive/10 px-2.5 py-1.5 text-xs font-semibold text-destructive">
          순서 저장에 실패해 기존 순서로 되돌렸습니다. 잠시 후 다시 시도해 주세요.
        </p>
      )}

      <div
        className="mt-3 grid min-h-0 flex-1 auto-rows-min content-start gap-2 overflow-y-auto pr-1 [grid-template-columns:repeat(auto-fill,minmax(150px,1fr))]"
        onDragOver={(event) => {
          if (dragId) event.preventDefault();
        }}
        onDrop={(event) => {
          event.preventDefault();
          commitDrop();
        }}
      >
        {displayed.length ? (
          displayed.map((memo) => (
            <MemoCard
              key={memo.id}
              memo={memo}
              dragging={dragId === memo.id}
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", memo.id);
                setDragId(memo.id);
                setPreviewIds(baseIds);
              }}
              onDragEnter={() => moveBefore(memo.id)}
              onDrop={commitDrop}
              onDragEnd={cancelDrag}
            />
          ))
        ) : (
          <p className="col-span-full text-sm font-medium text-muted-foreground">
            아직 메모가 없습니다. 위 입력창에서 첫 메모를 작성해 보세요.
          </p>
        )}
      </div>
    </div>
  );
}

/* 모바일: 뒤로가기 버튼과 연동되는 메모 서랍 */
export function MemoSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  useEffect(() => {
    if (!open) return;
    window.history.pushState({ memoSheet: true }, "");
    const onPopState = () => onOpenChange(false);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [open, onOpenChange]);

  const handleChange = (next: boolean) => {
    onOpenChange(next);
    if (!next && window.history.state?.memoSheet) window.history.back();
  };

  return (
    <Sheet open={open} onOpenChange={handleChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-4 sm:max-w-md">
        <SheetHeader className="p-0 pb-2">
          <SheetTitle className="text-xs font-bold tracking-wide text-muted-foreground uppercase">
            메모
          </SheetTitle>
        </SheetHeader>
        <MemoWorkspace />
      </SheetContent>
    </Sheet>
  );
}
