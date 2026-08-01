import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import type { Scope, Todo } from "./types";
import type { useAppData } from "./useAppData";

type Store = ReturnType<typeof useAppData>;
const scopeOptions: { value: Scope; label: string }[] = [
  { value: "day", label: "오늘" }, { value: "week", label: "이번 주" }, { value: "month", label: "이번 달" },
];
const weekdays = ["일", "월", "화", "수", "목", "금", "토"];

function fail(reason: unknown) {
  Alert.alert("저장 오류", reason instanceof Error ? reason.message : "잠시 후 다시 시도해주세요.");
}

function Card({ children }: { children: React.ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

export function TodoScreen({ store }: { store: Store }) {
  const [scope, setScope] = useState<Scope>("day");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [subDrafts, setSubDrafts] = useState<Record<string, string>>({});
  const [showRoutines, setShowRoutines] = useState(false);
  const roots = useMemo(() => store.data.todos.filter((todo) => todo.scope === scope && !todo.parentId).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)), [scope, store.data.todos]);

  const submit = async () => {
    if (!title.trim()) return;
    try { await store.addTodo({ title, scope, category, dueDate: dueDate || null }); setTitle(""); setCategory(""); setDueDate(""); } catch (reason) { fail(reason); }
  };

  return <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
    <View style={styles.sectionHeader}><View><Text style={styles.heading}>할 일</Text><Text style={styles.muted}>작게 나누고 하나씩 끝내세요.</Text></View><Pressable style={styles.ghostButton} onPress={() => setShowRoutines((value) => !value)}><Text style={styles.ghostText}>↻ 루틴</Text></Pressable></View>
    <View style={styles.segment}>{scopeOptions.map((item) => <Pressable key={item.value} style={[styles.segmentItem, scope === item.value && styles.segmentActive]} onPress={() => setScope(item.value)}><Text style={[styles.segmentText, scope === item.value && styles.segmentTextActive]}>{item.label}</Text></Pressable>)}</View>
    {showRoutines && <RoutineEditor store={store} />}
    <Card>
      <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="새 할 일" onSubmitEditing={() => void submit()} />
      <View style={styles.row}><TextInput style={[styles.input, styles.flex]} value={category} onChangeText={setCategory} placeholder="카테고리" /><TextInput style={[styles.input, styles.flex]} value={dueDate} onChangeText={setDueDate} placeholder="마감일 YYYY-MM-DD" /></View>
      <Pressable style={[styles.primaryButton, !title.trim() && styles.disabled]} disabled={!title.trim()} onPress={() => void submit()}><Text style={styles.primaryText}>추가</Text></Pressable>
    </Card>
    {!roots.length && <Text style={styles.empty}>아직 할 일이 없어요.</Text>}
    {roots.map((todo) => <TodoItem key={todo.id} todo={todo} store={store} subDraft={subDrafts[todo.id] || ""} setSubDraft={(value) => setSubDrafts((current) => ({ ...current, [todo.id]: value }))} />)}
  </ScrollView>;
}

function TodoItem({ todo, store, subDraft, setSubDraft }: { todo: Todo; store: Store; subDraft: string; setSubDraft: (value: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(todo.title);
  const [note, setNote] = useState(todo.note || "");
  const children = store.data.todos.filter((item) => item.parentId === todo.id).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const toggle = () => void store.patchTodo(todo.id, { done: !todo.done, completedAt: !todo.done ? new Date().toISOString() : null }).catch(fail);
  const remove = () => Alert.alert("할 일 삭제", `“${todo.title}”을 삭제할까요?`, [{ text: "취소", style: "cancel" }, { text: "삭제", style: "destructive", onPress: () => void store.deleteTodo(todo.id).catch(fail) }]);
  const save = async () => { try { await store.patchTodo(todo.id, { title: draft.trim() || todo.title, note: note.trim() || null }); setEditing(false); } catch (reason) { fail(reason); } };
  const addChild = async () => { if (!subDraft.trim()) return; try { await store.addTodo({ title: subDraft, scope: todo.scope, parentId: todo.id }); setSubDraft(""); setExpanded(true); } catch (reason) { fail(reason); } };
  return <Card>
    <View style={styles.todoRow}><Pressable style={[styles.checkbox, todo.done && styles.checkboxDone]} onPress={toggle}><Text style={styles.check}>{todo.done ? "✓" : ""}</Text></Pressable><Pressable style={styles.flex} onPress={() => setExpanded((value) => !value)} onLongPress={() => setEditing(true)}><Text style={[styles.todoTitle, todo.done && styles.done]}>{todo.title}</Text><View style={styles.metaRow}>{todo.category ? <Text style={styles.chip}>{todo.category}</Text> : null}{todo.dueDate ? <Text style={styles.meta}>마감 {todo.dueDate}</Text> : null}{children.length ? <Text style={styles.meta}>하위 {children.filter((item) => item.done).length}/{children.length}</Text> : null}</View></Pressable><Pressable onPress={() => setEditing((value) => !value)}><Text style={styles.action}>편집</Text></Pressable><Pressable onPress={remove}><Text style={[styles.action, styles.danger]}>삭제</Text></Pressable></View>
    {editing && <View style={styles.editor}><TextInput style={styles.input} value={draft} onChangeText={setDraft} /><TextInput style={[styles.input, styles.multiline]} value={note} onChangeText={setNote} placeholder="메모" multiline /><Pressable style={styles.secondaryButton} onPress={() => void save()}><Text style={styles.secondaryText}>저장</Text></Pressable></View>}
    {expanded && <View style={styles.subList}>{children.map((child) => <View key={child.id} style={styles.subRow}><Pressable style={[styles.smallCheck, child.done && styles.checkboxDone]} onPress={() => void store.patchTodo(child.id, { done: !child.done, completedAt: !child.done ? new Date().toISOString() : null }).catch(fail)}><Text style={styles.check}>{child.done ? "✓" : ""}</Text></Pressable><Text style={[styles.flex, child.done && styles.done]}>{child.title}</Text><Pressable onPress={() => void store.deleteTodo(child.id).catch(fail)}><Text style={styles.danger}>×</Text></Pressable></View>)}<View style={styles.row}><TextInput style={[styles.input, styles.flex]} value={subDraft} onChangeText={setSubDraft} placeholder="하위 목표" onSubmitEditing={() => void addChild()} /><Pressable style={styles.miniButton} onPress={() => void addChild()}><Text style={styles.primaryText}>+</Text></Pressable></View></View>}
  </Card>;
}

function RoutineEditor({ store }: { store: Store }) {
  const [title, setTitle] = useState(""); const [category, setCategory] = useState(""); const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const submit = async () => { if (!title.trim() || !days.length) return; try { await store.addRoutine(title, days, category); setTitle(""); } catch (reason) { fail(reason); } };
  return <Card><Text style={styles.cardTitle}>반복 루틴</Text><TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="루틴 이름" /><TextInput style={styles.input} value={category} onChangeText={setCategory} placeholder="카테고리" /><View style={styles.weekdays}>{weekdays.map((label, index) => <Pressable key={label} style={[styles.day, days.includes(index) && styles.dayActive]} onPress={() => setDays((current) => current.includes(index) ? current.filter((day) => day !== index) : [...current, index])}><Text style={[styles.dayText, days.includes(index) && styles.primaryText]}>{label}</Text></Pressable>)}</View><Pressable style={styles.secondaryButton} onPress={() => void submit()}><Text style={styles.secondaryText}>루틴 추가</Text></Pressable>{store.data.routines.map((routine) => <View key={routine.id} style={styles.listRow}><Pressable style={styles.flex} onPress={() => void store.patchRoutine(routine.id, { active: !routine.active }).catch(fail)}><Text style={[styles.todoTitle, !routine.active && styles.done]}>{routine.title}</Text><Text style={styles.meta}>{routine.weekdays.map((day) => weekdays[day]).join(" · ")}</Text></Pressable><Pressable onPress={() => void store.deleteRoutine(routine.id).catch(fail)}><Text style={styles.danger}>삭제</Text></Pressable></View>)}</Card>;
}

export function MemoScreen({ store }: { store: Store }) {
  const [title, setTitle] = useState(""); const [body, setBody] = useState(""); const [selected, setSelected] = useState<string | null>(null);
  const active = store.data.memos.find((memo) => memo.id === selected);
  useEffect(() => { if (active) { setTitle(active.title || ""); setBody(active.body); } }, [active?.id]);
  const clear = () => { setSelected(null); setTitle(""); setBody(""); };
  const save = async () => { if (!title.trim() && !body.trim()) return; try { if (selected) await store.patchMemo(selected, { title: title.trim(), body: body.trim() }); else await store.addMemo(title, body); clear(); } catch (reason) { fail(reason); } };
  return <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled"><View><Text style={styles.heading}>메모</Text><Text style={styles.muted}>생각을 붙잡고 #태그로 모아보세요.</Text></View><Card><TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="제목" /><TextInput style={[styles.input, styles.memoInput]} value={body} onChangeText={setBody} placeholder="내용을 입력하세요" multiline textAlignVertical="top" /><View style={styles.row}><Pressable style={[styles.primaryButton, styles.flex]} onPress={() => void save()}><Text style={styles.primaryText}>{selected ? "수정 저장" : "메모 저장"}</Text></Pressable>{selected && <Pressable style={styles.secondaryButton} onPress={clear}><Text style={styles.secondaryText}>취소</Text></Pressable>}</View></Card>{[...store.data.memos].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((memo) => <Pressable key={memo.id} onPress={() => setSelected(memo.id)}><Card><View style={styles.sectionHeader}><View style={styles.flex}><Text style={styles.cardTitle}>{memo.title || "제목 없는 메모"}</Text><Text style={styles.memoBody} numberOfLines={4}>{memo.body}</Text><View style={styles.metaRow}>{memo.tags.map((tag) => <Text key={tag} style={styles.chip}>#{tag}</Text>)}</View></View><Pressable onPress={() => Alert.alert("메모 삭제", "이 메모를 삭제할까요?", [{ text: "취소" }, { text: "삭제", style: "destructive", onPress: () => void store.deleteMemo(memo.id).catch(fail) }])}><Text style={styles.danger}>삭제</Text></Pressable></View></Card></Pressable>)}</ScrollView>;
}

type TimerMode = "focus" | "short" | "long";
const timerDefaults: Record<TimerMode, number> = { focus: 25, short: 5, long: 15 };
export function TimerScreen({ store }: { store: Store }) {
  const [mode, setMode] = useState<TimerMode>("focus"); const [minutes, setMinutes] = useState(timerDefaults); const [remaining, setRemaining] = useState(timerDefaults.focus * 60); const [running, setRunning] = useState(false); const [task, setTask] = useState("");
  useEffect(() => { AsyncStorage.getItem("todo:timer-settings").then((value) => { if (value) { const saved = JSON.parse(value); setMinutes({ ...timerDefaults, ...saved }); } }).catch(() => undefined); }, []);
  useEffect(() => { if (!running) setRemaining(minutes[mode] * 60); }, [minutes, mode, running]);
  useEffect(() => { if (!running) return; const id = setInterval(() => setRemaining((value) => { if (value <= 1) { setRunning(false); Alert.alert("타이머 완료", task || "시간이 끝났습니다."); return 0; } return value - 1; }), 1000); return () => clearInterval(id); }, [running, task]);
  const choose = (next: TimerMode) => { setRunning(false); setMode(next); setRemaining(minutes[next] * 60); };
  const updateMinutes = (value: string) => { const next = Math.max(1, Math.min(180, Number(value) || 1)); const settings = { ...minutes, [mode]: next }; setMinutes(settings); void AsyncStorage.setItem("todo:timer-settings", JSON.stringify(settings)); };
  return <ScrollView contentContainerStyle={styles.page}><View><Text style={styles.heading}>집중 타이머</Text><Text style={styles.muted}>집중 시간과 작업 기록을 한곳에서 관리하세요.</Text></View><Card><View style={styles.segment}>{(["focus", "short", "long"] as TimerMode[]).map((item) => <Pressable key={item} style={[styles.segmentItem, mode === item && styles.segmentActive]} onPress={() => choose(item)}><Text style={[styles.segmentText, mode === item && styles.segmentTextActive]}>{item === "focus" ? "집중" : item === "short" ? "짧은 휴식" : "긴 휴식"}</Text></Pressable>)}</View><Text style={styles.timer}>{String(Math.floor(remaining / 60)).padStart(2, "0")}:{String(remaining % 60).padStart(2, "0")}</Text><TextInput style={styles.input} value={task} onChangeText={setTask} placeholder="집중할 작업" /><View style={styles.row}><TextInput style={[styles.input, styles.flex]} value={String(minutes[mode])} onChangeText={updateMinutes} keyboardType="number-pad" /><Pressable style={[styles.primaryButton, styles.flex]} onPress={() => setRunning((value) => !value)}><Text style={styles.primaryText}>{running ? "일시정지" : "시작"}</Text></Pressable><Pressable style={styles.secondaryButton} onPress={() => { setRunning(false); setRemaining(minutes[mode] * 60); }}><Text style={styles.secondaryText}>초기화</Text></Pressable></View></Card><SessionTracker store={store} /></ScrollView>;
}

function SessionTracker({ store }: { store: Store }) {
  const [label, setLabel] = useState(""); const [, tick] = useState(0);
  useEffect(() => { if (!store.activeSession) return; const id = setInterval(() => tick((value) => value + 1), 30000); return () => clearInterval(id); }, [store.activeSession]);
  const elapsed = store.activeSession ? Math.floor((Date.now() - new Date(store.activeSession.startedAt).getTime()) / 60000) : 0;
  return <Card><Text style={styles.cardTitle}>작업 시간 기록</Text>{store.activeSession ? <><Text style={styles.sessionLabel}>{store.activeSession.label || "이름 없는 작업"}</Text><Text style={styles.muted}>{elapsed}분째 기록 중</Text><Pressable style={styles.stopButton} onPress={() => void store.stopSession().catch(fail)}><Text style={styles.primaryText}>기록 종료</Text></Pressable></> : <View style={styles.row}><TextInput style={[styles.input, styles.flex]} value={label} onChangeText={setLabel} placeholder="지금 할 작업" /><Pressable style={styles.primaryButton} onPress={() => { if (label.trim()) { void store.startSession(label); setLabel(""); } }}><Text style={styles.primaryText}>기록 시작</Text></Pressable></View>}</Card>;
}

export function ScheduleScreen({ store }: { store: Store }) {
  const grouped = useMemo(() => { const map = new Map<string, typeof store.data.sessions>(); for (const session of store.data.sessions) { const day = session.startedAt.slice(0, 10); map.set(day, [...(map.get(day) || []), session]); } return [...map.entries()].sort(([a], [b]) => b.localeCompare(a)); }, [store.data.sessions]);
  return <ScrollView contentContainerStyle={styles.page}><View><Text style={styles.heading}>타임테이블</Text><Text style={styles.muted}>기록한 시간을 날짜별로 돌아보세요.</Text></View>{!grouped.length && <Text style={styles.empty}>아직 기록된 작업이 없어요.</Text>}{grouped.map(([day, sessions]) => { const total = sessions.reduce((sum, session) => sum + Math.max(0, new Date(session.endedAt).getTime() - new Date(session.startedAt).getTime()), 0); return <Card key={day}><View style={styles.sectionHeader}><Text style={styles.cardTitle}>{day}</Text><Text style={styles.chip}>총 {Math.round(total / 60000)}분</Text></View>{sessions.sort((a, b) => b.startedAt.localeCompare(a.startedAt)).map((session) => <View key={session.id} style={styles.listRow}><View style={styles.flex}><Text style={styles.todoTitle}>{session.label || "이름 없는 작업"}</Text><Text style={styles.meta}>{new Date(session.startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} – {new Date(session.endedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · {Math.max(1, Math.round((new Date(session.endedAt).getTime() - new Date(session.startedAt).getTime()) / 60000))}분</Text></View><Pressable onPress={() => void store.deleteSession(session.id).catch(fail)}><Text style={styles.danger}>삭제</Text></Pressable></View>)}</Card>; })}</ScrollView>;
}

const styles = StyleSheet.create({
  page: { width: "100%", maxWidth: 1180, alignSelf: "center", gap: 14, paddingHorizontal: 28, paddingTop: 22, paddingBottom: 100 },
  heading: { fontSize: 30, fontWeight: "800", color: "#17251e" }, muted: { marginTop: 3, color: "#748078" },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  card: { gap: 11, padding: 15, borderWidth: 1, borderColor: "#dfe6df", borderRadius: 18, backgroundColor: "#fff" }, cardTitle: { fontSize: 17, fontWeight: "700", color: "#213128" },
  row: { flexDirection: "row", alignItems: "center", gap: 8 }, flex: { flex: 1 },
  input: { minHeight: 46, paddingHorizontal: 13, paddingVertical: 10, borderWidth: 1, borderColor: "#d9e1da", borderRadius: 12, backgroundColor: "#fbfcfb", color: "#17251e" }, multiline: { minHeight: 76, textAlignVertical: "top" }, memoInput: { minHeight: 150, textAlignVertical: "top" },
  primaryButton: { minHeight: 46, alignItems: "center", justifyContent: "center", paddingHorizontal: 18, borderRadius: 12, backgroundColor: "#176b47" }, primaryText: { fontWeight: "700", color: "#fff" }, disabled: { opacity: .4 },
  secondaryButton: { minHeight: 44, alignItems: "center", justifyContent: "center", paddingHorizontal: 15, borderWidth: 1, borderColor: "#bad0c1", borderRadius: 12, backgroundColor: "#eef6f1" }, secondaryText: { fontWeight: "700", color: "#176b47" },
  ghostButton: { padding: 9 }, ghostText: { fontWeight: "700", color: "#176b47" }, miniButton: { width: 46, height: 46, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: "#176b47" }, stopButton: { marginTop: 8, minHeight: 46, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: "#a43d35" },
  segment: { flexDirection: "row", gap: 4, padding: 4, borderRadius: 14, backgroundColor: "#e7ece8" }, segmentItem: { flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: 10 }, segmentActive: { backgroundColor: "#fff" }, segmentText: { fontWeight: "600", color: "#738078" }, segmentTextActive: { color: "#176b47" },
  todoRow: { flexDirection: "row", alignItems: "center", gap: 10 }, checkbox: { width: 25, height: 25, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#98a69d", borderRadius: 8 }, smallCheck: { width: 21, height: 21, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#98a69d", borderRadius: 7 }, checkboxDone: { borderColor: "#176b47", backgroundColor: "#176b47" }, check: { fontWeight: "900", color: "#fff" }, todoTitle: { fontSize: 15, fontWeight: "600", color: "#26372d" }, done: { color: "#9aa49e", textDecorationLine: "line-through" }, action: { fontSize: 12, color: "#65736b" }, danger: { color: "#a43d35" }, editor: { gap: 8, paddingTop: 8 }, subList: { gap: 9, marginTop: 3, paddingTop: 11, paddingLeft: 35, borderTopWidth: 1, borderTopColor: "#edf0ed" }, subRow: { flexDirection: "row", alignItems: "center", gap: 9 },
  metaRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6, marginTop: 5 }, meta: { fontSize: 11, color: "#7b867f" }, chip: { overflow: "hidden", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99, backgroundColor: "#eaf4ed", fontSize: 11, color: "#256543" },
  weekdays: { flexDirection: "row", justifyContent: "space-between", gap: 5 }, day: { flex: 1, alignItems: "center", paddingVertical: 9, borderRadius: 10, backgroundColor: "#edf0ed" }, dayActive: { backgroundColor: "#176b47" }, dayText: { fontWeight: "700", color: "#68756d" }, listRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9, borderTopWidth: 1, borderTopColor: "#edf0ed" },
  memoBody: { marginTop: 5, lineHeight: 20, color: "#59665e" }, timer: { marginVertical: 24, textAlign: "center", fontSize: 66, fontVariant: ["tabular-nums"], fontWeight: "800", color: "#153c2a" }, sessionLabel: { marginTop: 8, fontSize: 22, fontWeight: "700", color: "#1d3327" }, empty: { paddingVertical: 45, textAlign: "center", color: "#8a958e" },
});
