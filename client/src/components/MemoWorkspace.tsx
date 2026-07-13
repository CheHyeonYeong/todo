import { useEffect, useState } from "react";
import { Plus, Search, Star, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useAppData } from "@/hooks/useAppData";
import { formatDate, formatTime, nowIso } from "@/lib/helpers";
import { cn } from "@/lib/utils";

export function MemoWorkspace() {
  const { data, addMemo, deleteMemo, toggleMemoStar } = useAppData();
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [starOnly, setStarOnly] = useState(false);

  const tags = Array.from(new Set(data.memos.flatMap((memo) => memo.tags))).sort((a, b) => a.localeCompare(b));
  const normalized = query.trim().toLowerCase();
  const memos = data.memos
    .filter((memo) => {
      const matchesQuery = normalized ? memo.body.toLowerCase().includes(normalized) : true;
      const matchesTag = activeTag ? memo.tags.includes(activeTag) : true;
      const matchesStar = starOnly ? memo.starred : true;
      return matchesQuery && matchesTag && matchesStar;
    })
    .sort(
      (a, b) =>
        Number(Boolean(b.starred)) - Number(Boolean(a.starred)) || b.createdAt.localeCompare(a.createdAt),
    );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <form
        className="shrink-0"
        onSubmit={(event) => {
          event.preventDefault();
          const body = draft.trim();
          if (!body) return;
          addMemo(body);
          setDraft("");
        }}
      >
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-base font-bold">생각나는 즉시 기록</h2>
          <Badge variant="secondary" className="bg-emerald-50 font-bold text-emerald-800">
            {formatDate(nowIso())}
          </Badge>
        </div>
        <Textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          placeholder="회의에서 나온 말, 갑자기 떠오른 일, - [ ] 해야 할 일, #태그"
          className="min-h-16 resize-y bg-background"
        />
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-muted-foreground">Ctrl+Enter로 바로 기록</span>
          <Button type="submit" size="sm" className="font-bold">
            <Plus className="size-4" />
            기록
          </Button>
        </div>
      </form>

      <div className="mt-3 flex shrink-0 items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="검색"
            className="h-8 pl-8"
          />
        </div>
        <Button
          type="button"
          variant={starOnly ? "default" : "outline"}
          size="icon"
          className={cn("size-8", starOnly && "bg-amber-400 text-amber-950 hover:bg-amber-400/90")}
          title="즐겨찾기만 보기"
          onClick={() => setStarOnly((value) => !value)}
        >
          <Star className="size-4" />
        </Button>
      </div>

      {tags.length > 0 && (
        <div className="mt-2.5 flex shrink-0 flex-wrap gap-1.5">
          <Badge
            variant={activeTag ? "outline" : "default"}
            className="cursor-pointer font-semibold"
            onClick={() => setActiveTag(null)}
          >
            전체
          </Badge>
          {tags.map((tag) => (
            <Badge
              key={tag}
              variant={activeTag === tag ? "default" : "outline"}
              className="cursor-pointer font-semibold"
              onClick={() => setActiveTag(activeTag === tag ? null : tag)}
            >
              #{tag}
            </Badge>
          ))}
        </div>
      )}

      <div className="mt-3 grid min-h-0 flex-1 auto-rows-min gap-2 overflow-y-auto pr-1">
        {memos.length ? (
          memos.map((memo) => (
            <article
              key={memo.id}
              className={cn(
                "group grid grid-cols-[64px_minmax(0,1fr)_auto] gap-3 rounded-lg border bg-card p-3",
                memo.starred && "border-amber-300 bg-amber-50/60",
              )}
            >
              <time className="text-sm font-black text-emerald-800/70">{formatTime(memo.createdAt)}</time>
              <p className="text-sm leading-relaxed break-words whitespace-pre-wrap">{memo.body}</p>
              <div className="flex flex-col gap-0.5">
                <button
                  type="button"
                  title={memo.starred ? "즐겨찾기 해제" : "즐겨찾기"}
                  onClick={() => toggleMemoStar(memo.id)}
                  className={cn(
                    "grid size-6 place-items-center rounded text-muted-foreground",
                    memo.starred && "text-amber-500",
                  )}
                >
                  <Star className="size-4" fill={memo.starred ? "currentColor" : "none"} />
                </button>
                <button
                  type="button"
                  title="메모 삭제"
                  onClick={() => deleteMemo(memo.id)}
                  className="grid size-6 place-items-center rounded text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 max-lg:opacity-100"
                >
                  <X className="size-4" />
                </button>
              </div>
            </article>
          ))
        ) : (
          <p className="text-sm font-medium text-muted-foreground">검색 결과가 없습니다.</p>
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
            quick capture
          </SheetTitle>
        </SheetHeader>
        <MemoWorkspace />
      </SheetContent>
    </Sheet>
  );
}
