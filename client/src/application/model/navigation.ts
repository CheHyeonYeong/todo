export type Workspace = "todo" | "memo" | "time";

export const tabs: { key: Workspace; label: string; icon: string }[] = [
  { key: "todo", label: "할 일", icon: "✓" },
  { key: "memo", label: "메모", icon: "✎" },
  { key: "time", label: "시간", icon: "◷" },
];
