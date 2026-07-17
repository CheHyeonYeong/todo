import { useEffect, useRef } from "react";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { Prec } from "@codemirror/state";
import { drawSelection, EditorView, keymap, placeholder as cmPlaceholder } from "@codemirror/view";
import { vim } from "@replit/codemirror-vim";
import { cn } from "@/lib/utils";

/* Textarea와 비슷하게 보이도록 최소한만 꾸민다. 폰트는 부모를 따라간다. */
const theme = EditorView.theme({
  "&": { fontSize: "0.875rem", backgroundColor: "transparent" },
  "&.cm-focused": { outline: "none" },
  ".cm-content": { fontFamily: "inherit", padding: "4px 0", caretColor: "currentColor" },
  ".cm-line": { padding: "0 4px" },
  ".cm-placeholder": { color: "var(--muted-foreground, #6b7280)" },
  ".cm-cursor": { borderLeftColor: "currentColor" },
  /* vim 노멀 모드의 블록 커서 */
  ".cm-fat-cursor": { background: "#059669cc", color: "white" },
  "&:not(.cm-focused) .cm-fat-cursor": { background: "none", outline: "1px solid #059669cc" },
});

/** 메모 본문용 Vim 키바인딩 에디터. 값이 밖에서 바뀌면(저장 후 비우기 등) 따라간다. */
export function VimEditor({
  value,
  onChange,
  onSubmit,
  placeholder,
  autoFocus = false,
  className,
}: {
  value: string;
  onChange: (next: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onSubmitRef = useRef(onSubmit);
  onSubmitRef.current = onSubmit;

  useEffect(() => {
    const view = new EditorView({
      doc: value,
      parent: hostRef.current!,
      extensions: [
        // vim()이 다른 키맵보다 먼저 와야 모드 전환이 우선한다.
        vim(),
        history(),
        drawSelection(),
        EditorView.lineWrapping,
        Prec.highest(
          keymap.of([
            {
              key: "Mod-Enter",
              run: () => {
                onSubmitRef.current?.();
                return true;
              },
            },
          ]),
        ),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        cmPlaceholder(placeholder ?? ""),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onChangeRef.current(update.state.doc.toString());
        }),
        theme,
      ],
    });
    viewRef.current = view;
    if (autoFocus) view.focus();
    return () => {
      viewRef.current = null;
      view.destroy();
    };
    // 에디터는 마운트 때 한 번만 만든다. 이후 값 동기화는 아래 이펙트가 맡는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (view && value !== view.state.doc.toString()) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
    }
  }, [value]);

  return (
    <div
      ref={hostRef}
      className={cn("min-h-14 text-sm [&_.cm-editor]:h-full", className)}
      // vim의 Esc가 모바일 서랍(Sheet) 닫기로 새지 않게 막는다.
      onKeyDown={(event) => {
        if (event.key === "Escape") event.stopPropagation();
      }}
    />
  );
}
