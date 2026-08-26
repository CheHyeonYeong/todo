import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { addDays, dateKey, dayKeyOf, defaultDueDate, startOfWeek } from "./domain/calendar";
import {
  isMomentNote,
  momentNoteLabel,
  momentNoteText,
  sessionsCoveringHour,
  sessionsStartedBetween,
  totalDurationMs,
} from "./domain/session";
import { completionPatch } from "./domain/todo";
import type { Scope, Todo } from "./types";
import type { useAppData } from "./useAppData";

type Store = ReturnType<typeof useAppData>;
const scopeOptions: { value: Scope; label: string }[] = [
  { value: "day", label: "오늘" },
  { value: "week", label: "이번 주" },
  { value: "month", label: "이번 달" },
];
const weekdays = ["일", "월", "화", "수", "목", "금", "토"];

function fail(reason: unknown) {
  Alert.alert("저장 오류", reason instanceof Error ? reason.message : "잠시 후 다시 시도해주세요.");
}

function Card({ children }: { children: React.ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

export function MemoScreen({ store }: { store: Store }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const active = store.data.memos.find((memo) => memo.id === selected);
  useEffect(() => {
    if (active) {
      setTitle(active.title || "");
      setBody(active.body);
    }
  }, [active?.id]);
  const clear = () => {
    setSelected(null);
    setTitle("");
    setBody("");
  };
  const save = async () => {
    if (!title.trim() && !body.trim()) return;
    try {
      if (selected) await store.patchMemo(selected, { title: title.trim(), body: body.trim() });
      else await store.addMemo(title, body);
      clear();
    } catch (reason) {
      fail(reason);
    }
  };
  const visible = [...store.data.memos]
    .filter(
      (memo) =>
        !query.trim() ||
        [memo.title, memo.body, ...(memo.tags || [])].some((value) =>
          value?.toLowerCase().includes(query.trim().toLowerCase()),
        ),
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <View>
        <Text style={styles.heading}>메모</Text>
        <Text style={styles.muted}>
          생각을 붙잡고 #태그로 모아보세요. `- [ ]` 또는 `todo:` 줄은 할 일로도 만들어집니다.
        </Text>
      </View>
      <Card>
        <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="제목" />
        <TextInput
          style={[styles.input, styles.memoInput]}
          value={body}
          onChangeText={setBody}
          placeholder="내용을 입력하세요"
          multiline
          textAlignVertical="top"
        />
        <View style={styles.row}>
          <Pressable style={[styles.primaryButton, styles.flex]} onPress={() => void save()}>
            <Text style={styles.primaryText}>{selected ? "수정 저장" : "메모 저장"}</Text>
          </Pressable>
          {selected && (
            <Pressable style={styles.secondaryButton} onPress={clear}>
              <Text style={styles.secondaryText}>취소</Text>
            </Pressable>
          )}
        </View>
      </Card>
      <TextInput
        style={styles.input}
        value={query}
        onChangeText={setQuery}
        placeholder="메모 검색 (제목 · 본문 · #태그)"
      />
      {visible.map((memo) => (
        <Pressable key={memo.id} onPress={() => setSelected(memo.id)}>
          <Card>
            <View style={styles.sectionHeader}>
              <View style={styles.flex}>
                <Text style={styles.cardTitle}>{memo.title || "제목 없는 메모"}</Text>
                <Text style={styles.memoBody} numberOfLines={4}>
                  {memo.body}
                </Text>
                <View style={styles.metaRow}>
                  {memo.tags.map((tag) => (
                    <Text key={tag} style={styles.chip}>
                      #{tag}
                    </Text>
                  ))}
                </View>
              </View>
              <Pressable
                onPress={() =>
                  Alert.alert("메모 삭제", "이 메모를 삭제할까요?", [
                    { text: "취소" },
                    {
                      text: "삭제",
                      style: "destructive",
                      onPress: () => void store.deleteMemo(memo.id).catch(fail),
                    },
                  ])
                }
              >
                <Text style={styles.danger}>삭제</Text>
              </Pressable>
            </View>
          </Card>
        </Pressable>
      ))}
      {!visible.length && (
        <Text style={styles.empty}>{query ? "검색 결과가 없습니다." : "아직 메모가 없습니다."}</Text>
      )}
    </ScrollView>
  );
}

type TimerMode = "focus" | "short" | "long";
const timerDefaults: Record<TimerMode, number> = { focus: 25, short: 5, long: 15 };
export function TimeScreen({ store }: { store: Store }) {
  const [mode, setMode] = useState<TimerMode>("focus");
  const [minutes, setMinutes] = useState(timerDefaults);
  const [remaining, setRemaining] = useState(timerDefaults.focus * 60);
  const [running, setRunning] = useState(false);
  const [task, setTask] = useState("");
  const [focusCount, setFocusCount] = useState(0);
  const startedAt = useRef<number | null>(null);
  useEffect(() => {
    AsyncStorage.getItem("todo:timer-settings")
      .then((value) => {
        if (value) {
          const saved = JSON.parse(value);
          setMinutes({ ...timerDefaults, ...saved });
        }
      })
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    if (!running) setRemaining(minutes[mode] * 60);
  }, [minutes, mode, running]);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(
      () =>
        setRemaining((value) => {
          if (value > 1) return value - 1;
          const endedAt = Date.now();
          setRunning(false);
          if (
            mode === "focus" &&
            startedAt.current &&
            endedAt - startedAt.current >= 60000 &&
            !store.activeSession
          )
            void store
              .recordSession({
                id: `${endedAt}`,
                label: task.trim() || "뽀모도로 집중",
                startedAt: new Date(startedAt.current).toISOString(),
                endedAt: new Date(endedAt).toISOString(),
              })
              .catch(fail);
          startedAt.current = null;
          if (mode === "focus") {
            const nextCount = focusCount + 1;
            const nextMode: TimerMode = nextCount % 4 === 0 ? "long" : "short";
            setFocusCount(nextCount);
            setMode(nextMode);
            setTimeout(() => {
              startedAt.current = Date.now();
              setRunning(true);
            }, 250);
            Alert.alert("집중 완료", `${nextMode === "long" ? "긴" : "짧은"} 휴식을 자동으로 시작합니다.`);
            return minutes[nextMode] * 60;
          }
          setMode("focus");
          Alert.alert("휴식 완료", "준비되면 다음 집중을 시작하세요.");
          return minutes.focus * 60;
        }),
      1000,
    );
    return () => clearInterval(id);
  }, [focusCount, minutes, mode, running, store, task]);
  const choose = (next: TimerMode) => {
    setRunning(false);
    startedAt.current = null;
    setMode(next);
    setRemaining(minutes[next] * 60);
  };
  const updateMinutes = (value: string) => {
    const next = Math.max(1, Math.min(180, Number(value) || 1));
    const settings = { ...minutes, [mode]: next };
    setMinutes(settings);
    void AsyncStorage.setItem("todo:timer-settings", JSON.stringify(settings));
  };
  const toggleTimer = () => {
    if (running) {
      setRunning(false);
      if (
        mode === "focus" &&
        startedAt.current &&
        Date.now() - startedAt.current >= 60000 &&
        !store.activeSession
      )
        void store
          .recordSession({
            id: `${Date.now()}`,
            label: task.trim() || "뽀모도로 집중",
            startedAt: new Date(startedAt.current).toISOString(),
            endedAt: new Date().toISOString(),
          })
          .catch(fail);
      startedAt.current = null;
    } else {
      startedAt.current = Date.now();
      setRunning(true);
    }
  };
  return (
    <ScrollView contentContainerStyle={styles.page}>
      <View>
        <Text style={styles.heading}>시간</Text>
        <Text style={styles.muted}>타이머로 집중하고 스터디 플래너에 시간을 쌓아보세요.</Text>
      </View>
      <View style={styles.timeTopGrid}>
        <View style={styles.timePanel}>
          <Card>
            <View style={styles.segment}>
              {(["focus", "short", "long"] as TimerMode[]).map((item) => (
                <Pressable
                  key={item}
                  style={[styles.segmentItem, mode === item && styles.segmentActive]}
                  onPress={() => choose(item)}
                >
                  <Text style={[styles.segmentText, mode === item && styles.segmentTextActive]}>
                    {item === "focus" ? "집중" : item === "short" ? "짧은 휴식" : "긴 휴식"}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.timer}>
              {String(Math.floor(remaining / 60)).padStart(2, "0")}:{String(remaining % 60).padStart(2, "0")}
            </Text>
            <TextInput
              style={styles.input}
              value={task}
              onChangeText={setTask}
              placeholder="지금 뭘 하는 중? (집중 기록 이름)"
            />
            <View style={styles.focusDots}>
              {[0, 1, 2, 3].map((index) => (
                <View
                  key={index}
                  style={[
                    styles.focusDot,
                    index < (focusCount % 4 || (focusCount ? 4 : 0)) && styles.focusDotActive,
                  ]}
                />
              ))}
            </View>
            <Text style={styles.timerHint}>집중이 끝나면 휴식 자동 시작 · 1분 이상 집중은 플래너에 기록</Text>
            <View style={styles.row}>
              <TextInput
                style={[styles.input, styles.flex]}
                value={String(minutes[mode])}
                onChangeText={updateMinutes}
                keyboardType="number-pad"
              />
              <Pressable style={[styles.primaryButton, styles.flex]} onPress={toggleTimer}>
                <Text style={styles.primaryText}>{running ? "일시정지" : "시작"}</Text>
              </Pressable>
              <Pressable
                style={styles.secondaryButton}
                onPress={() => {
                  setRunning(false);
                  startedAt.current = null;
                  setRemaining(minutes[mode] * 60);
                }}
              >
                <Text style={styles.secondaryText}>초기화</Text>
              </Pressable>
            </View>
          </Card>
        </View>
        <View style={styles.timePanel}>
          <SessionTracker store={store} />
        </View>
      </View>
      <StudyPlanner store={store} />
    </ScrollView>
  );
}

function SessionTracker({ store }: { store: Store }) {
  const [label, setLabel] = useState("");
  const [, tick] = useState(0);
  useEffect(() => {
    if (!store.activeSession) return;
    const id = setInterval(() => tick((value) => value + 1), 30000);
    return () => clearInterval(id);
  }, [store.activeSession]);
  const elapsed = store.activeSession
    ? Math.floor((Date.now() - new Date(store.activeSession.startedAt).getTime()) / 60000)
    : 0;
  return (
    <Card>
      <Text style={styles.cardTitle}>작업 시간 기록</Text>
      {store.activeSession ? (
        <>
          <Text style={styles.sessionLabel}>{store.activeSession.label || "이름 없는 작업"}</Text>
          <Text style={styles.muted}>{elapsed}분째 기록 중</Text>
          <Pressable style={styles.stopButton} onPress={() => void store.stopSession().catch(fail)}>
            <Text style={styles.primaryText}>기록 종료</Text>
          </Pressable>
        </>
      ) : (
        <View style={styles.row}>
          <TextInput
            style={[styles.input, styles.flex]}
            value={label}
            onChangeText={setLabel}
            placeholder="지금 할 작업"
          />
          <Pressable
            style={styles.primaryButton}
            onPress={() => {
              if (label.trim()) {
                void store.startSession(label);
                setLabel("");
              }
            }}
          >
            <Text style={styles.primaryText}>기록 시작</Text>
          </Pressable>
        </View>
      )}
    </Card>
  );
}

function StudyPlanner({ store }: { store: Store }) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [momentNote, setMomentNote] = useState("");
  const start = addDays(startOfWeek(new Date()), weekOffset * 7);
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
  const hours = Array.from({ length: 18 }, (_, index) => index + 6);
  const sessionAt = (date: Date, hour: number) => sessionsCoveringHour(store.data.sessions, date, hour);
  // 마지막 날의 다음 날 0시까지. 고정 24시간이면 서머타임이 있는 지역에서 한 시간이 새거나 겹친다.
  const weekSessions = sessionsStartedBetween(store.data.sessions, days[0], addDays(days[6], 1));
  const total = totalDurationMs(weekSessions);
  const addMoment = () => {
    const body = momentNote.trim();
    if (!body) return;
    const now = new Date();
    void store
      .recordSession({
        id: `${now.getTime()}`,
        label: momentNoteLabel(body),
        startedAt: now.toISOString(),
        endedAt: new Date(now.getTime() + 1000).toISOString(),
      })
      .catch(fail);
    setMomentNote("");
  };
  const notes = weekSessions.filter(isMomentNote);
  return (
    <Card>
      <View style={styles.sectionHeader}>
        <View>
          <Text style={styles.cardTitle}>주간 스터디 플래너</Text>
          <Text style={styles.muted}>
            {start.getMonth() + 1}.{start.getDate()} – {days[6].getMonth() + 1}.{days[6].getDate()} · 총{" "}
            {Math.round(total / 60000)}분
          </Text>
        </View>
        <View style={styles.row}>
          <Pressable style={styles.plannerArrow} onPress={() => setWeekOffset((value) => value - 1)}>
            <Text>‹</Text>
          </Pressable>
          <Pressable style={styles.todayButton} onPress={() => setWeekOffset(0)}>
            <Text style={styles.secondaryText}>이번 주</Text>
          </Pressable>
          <Pressable style={styles.plannerArrow} onPress={() => setWeekOffset((value) => value + 1)}>
            <Text>›</Text>
          </Pressable>
        </View>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator>
        <View style={styles.planner}>
          <View style={styles.plannerHeader}>
            <View style={styles.timeHeader}>
              <Text style={styles.meta}>D-day</Text>
            </View>
            {days.map((date, index) => (
              <View key={date.toISOString()} style={styles.plannerDayHeader}>
                <Text
                  style={[
                    styles.plannerDayName,
                    index === 0 && styles.sunday,
                    index === 6 && styles.saturday,
                  ]}
                >
                  {weekdays[index]}
                </Text>
                <Text style={styles.meta}>
                  {date.getMonth() + 1}/{date.getDate()}
                </Text>
              </View>
            ))}
          </View>
          {hours.map((hour) => (
            <View key={hour} style={styles.plannerRow}>
              <View style={styles.timeCell}>
                <Text style={styles.timeLabel}>{hour > 12 ? hour - 12 : hour}</Text>
              </View>
              {days.map((date) => {
                const sessions = sessionAt(date, hour).filter((session) => !isMomentNote(session));
                return (
                  <View key={date.toISOString()} style={styles.plannerCell}>
                    {sessions.slice(0, 1).map((session) => (
                      <View key={session.id} style={styles.studyBlock}>
                        <Text style={styles.studyText} numberOfLines={2}>
                          {session.label || "공부"}
                        </Text>
                      </View>
                    ))}
                  </View>
                );
              })}
            </View>
          ))}
        </View>
      </ScrollView>
      <View style={styles.row}>
        <TextInput
          style={[styles.input, styles.flex]}
          value={momentNote}
          onChangeText={setMomentNote}
          placeholder="측정 없이 지금 시각에 메모"
          onSubmitEditing={addMoment}
        />
        <Pressable style={styles.miniButton} onPress={addMoment}>
          <Text style={styles.primaryText}>+</Text>
        </Pressable>
      </View>
      {notes.map((note) => (
        <View key={note.id} style={styles.listRow}>
          <View style={styles.flex}>
            <Text style={styles.todoTitle}>{momentNoteText(note)}</Text>
            <Text style={styles.meta}>{new Date(note.startedAt).toLocaleString()}</Text>
          </View>
          <Pressable onPress={() => void store.deleteSession(note.id).catch(fail)}>
            <Text style={styles.danger}>삭제</Text>
          </Pressable>
        </View>
      ))}
    </Card>
  );
}

export function ScheduleScreen({ store }: { store: Store }) {
  const grouped = useMemo(() => {
    const map = new Map<string, typeof store.data.sessions>();
    for (const session of store.data.sessions) {
      const day = session.startedAt.slice(0, 10);
      map.set(day, [...(map.get(day) || []), session]);
    }
    return [...map.entries()].sort(([a], [b]) => b.localeCompare(a));
  }, [store.data.sessions]);
  return (
    <ScrollView contentContainerStyle={styles.page}>
      <View>
        <Text style={styles.heading}>타임테이블</Text>
        <Text style={styles.muted}>기록한 시간을 날짜별로 돌아보세요.</Text>
      </View>
      {!grouped.length && <Text style={styles.empty}>아직 기록된 작업이 없어요.</Text>}
      {grouped.map(([day, sessions]) => {
        const total = sessions.reduce(
          (sum, session) =>
            sum + Math.max(0, new Date(session.endedAt).getTime() - new Date(session.startedAt).getTime()),
          0,
        );
        return (
          <Card key={day}>
            <View style={styles.sectionHeader}>
              <Text style={styles.cardTitle}>{day}</Text>
              <Text style={styles.chip}>총 {Math.round(total / 60000)}분</Text>
            </View>
            {sessions
              .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
              .map((session) => (
                <View key={session.id} style={styles.listRow}>
                  <View style={styles.flex}>
                    <Text style={styles.todoTitle}>{session.label || "이름 없는 작업"}</Text>
                    <Text style={styles.meta}>
                      {new Date(session.startedAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}{" "}
                      –{" "}
                      {new Date(session.endedAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}{" "}
                      ·{" "}
                      {Math.max(
                        1,
                        Math.round(
                          (new Date(session.endedAt).getTime() - new Date(session.startedAt).getTime()) /
                            60000,
                        ),
                      )}
                      분
                    </Text>
                  </View>
                  <Pressable onPress={() => void store.deleteSession(session.id).catch(fail)}>
                    <Text style={styles.danger}>삭제</Text>
                  </Pressable>
                </View>
              ))}
          </Card>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: {
    width: "100%",
    maxWidth: 1180,
    alignSelf: "center",
    gap: 14,
    paddingHorizontal: 28,
    paddingTop: 22,
    paddingBottom: 100,
  },
  heading: { fontSize: 30, fontWeight: "800", color: "#17251e" },
  muted: { marginTop: 3, color: "#748078" },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  card: {
    gap: 11,
    padding: 15,
    borderWidth: 1,
    borderColor: "#dfe6df",
    borderRadius: 18,
    backgroundColor: "#fff",
  },
  cardTitle: { fontSize: 17, fontWeight: "700", color: "#213128" },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  flex: { flex: 1 },
  input: {
    minHeight: 46,
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#d9e1da",
    borderRadius: 12,
    backgroundColor: "#fbfcfb",
    color: "#17251e",
  },
  multiline: { minHeight: 76, textAlignVertical: "top" },
  memoInput: { minHeight: 150, textAlignVertical: "top" },
  primaryButton: {
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
    borderRadius: 12,
    backgroundColor: "#176b47",
  },
  primaryText: { fontWeight: "700", color: "#fff" },
  disabled: { opacity: 0.4 },
  secondaryButton: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 15,
    borderWidth: 1,
    borderColor: "#bad0c1",
    borderRadius: 12,
    backgroundColor: "#eef6f1",
  },
  secondaryText: { fontWeight: "700", color: "#176b47" },
  ghostButton: { padding: 9 },
  ghostText: { fontWeight: "700", color: "#176b47" },
  miniButton: {
    width: 46,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "#176b47",
  },
  stopButton: {
    marginTop: 8,
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "#a43d35",
  },
  segment: { flexDirection: "row", gap: 4, padding: 4, borderRadius: 14, backgroundColor: "#e7ece8" },
  segmentItem: { flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: 10 },
  segmentActive: { backgroundColor: "#fff" },
  segmentText: { fontWeight: "600", color: "#738078" },
  segmentTextActive: { color: "#176b47" },
  todoRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  checkbox: {
    width: 25,
    height: 25,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#98a69d",
    borderRadius: 8,
  },
  smallCheck: {
    width: 21,
    height: 21,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#98a69d",
    borderRadius: 7,
  },
  checkboxDone: { borderColor: "#176b47", backgroundColor: "#176b47" },
  check: { fontWeight: "900", color: "#fff" },
  todoTitle: { fontSize: 15, fontWeight: "600", color: "#26372d" },
  done: { color: "#9aa49e", textDecorationLine: "line-through" },
  action: { fontSize: 12, color: "#65736b" },
  danger: { color: "#a43d35" },
  editor: { gap: 8, paddingTop: 8 },
  subList: {
    gap: 9,
    marginTop: 3,
    paddingTop: 11,
    paddingLeft: 35,
    borderTopWidth: 1,
    borderTopColor: "#edf0ed",
  },
  subRow: { flexDirection: "row", alignItems: "center", gap: 9 },
  metaRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6, marginTop: 5 },
  meta: { fontSize: 11, color: "#7b867f" },
  overdue: { fontWeight: "700", color: "#b24038" },
  chip: {
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 99,
    backgroundColor: "#eaf4ed",
    fontSize: 11,
    color: "#256543",
  },
  weekdays: { flexDirection: "row", justifyContent: "space-between", gap: 5 },
  day: { flex: 1, alignItems: "center", paddingVertical: 9, borderRadius: 10, backgroundColor: "#edf0ed" },
  dayActive: { backgroundColor: "#176b47" },
  dayText: { fontWeight: "700", color: "#68756d" },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 9,
    borderTopWidth: 1,
    borderTopColor: "#edf0ed",
  },
  memoBody: { marginTop: 5, lineHeight: 20, color: "#59665e" },
  timer: {
    marginVertical: 24,
    textAlign: "center",
    fontSize: 66,
    fontVariant: ["tabular-nums"],
    fontWeight: "800",
    color: "#153c2a",
  },
  sessionLabel: { marginTop: 8, fontSize: 22, fontWeight: "700", color: "#1d3327" },
  empty: { paddingVertical: 45, textAlign: "center", color: "#8a958e" },
  todayButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#c8d8cc",
    borderRadius: 10,
    backgroundColor: "#f4f8f5",
  },
  calendarHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  calendarTitle: { fontSize: 20, fontWeight: "800", color: "#20362a" },
  calendarArrow: { paddingHorizontal: 14, fontSize: 30, color: "#176b47" },
  calendarGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderColor: "#dfe5e0",
  },
  weekHeader: {
    width: "14.2857%",
    alignItems: "center",
    paddingVertical: 9,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#dfe5e0",
    backgroundColor: "#f2f5f2",
  },
  weekHeaderText: { fontSize: 12, fontWeight: "700", color: "#59665e" },
  calendarCell: {
    width: "14.2857%",
    minHeight: 96,
    padding: 7,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#dfe5e0",
    backgroundColor: "#fff",
  },
  calendarToday: { backgroundColor: "#eef8f1" },
  calendarDay: { marginBottom: 6, fontSize: 12, fontWeight: "700", color: "#3b4840" },
  calendarEvent: {
    marginBottom: 3,
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: "#e7f2ea",
    fontSize: 10,
    color: "#245f40",
  },
  more: { fontSize: 10, color: "#7b867f" },
  sunday: { color: "#b54a43" },
  saturday: { color: "#426ba8" },
  timeTopGrid: { flexDirection: "row", flexWrap: "wrap", alignItems: "stretch", gap: 14 },
  timePanel: { flexGrow: 1, flexBasis: 390 },
  plannerArrow: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#d7dfd9",
    borderRadius: 9,
    backgroundColor: "#fff",
  },
  focusDots: { flexDirection: "row", justifyContent: "center", gap: 7 },
  focusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#d4dcd6" },
  focusDotActive: { backgroundColor: "#1c7a50" },
  timerHint: { textAlign: "center", fontSize: 11, color: "#758078" },
  planner: { minWidth: 820, marginTop: 12, borderTopWidth: 1, borderLeftWidth: 1, borderColor: "#aeb8b1" },
  plannerHeader: { flexDirection: "row" },
  timeHeader: {
    width: 52,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#aeb8b1",
    backgroundColor: "#f3f5f3",
  },
  plannerDayHeader: {
    width: 108,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#aeb8b1",
    backgroundColor: "#f8faf8",
  },
  plannerDayName: { fontWeight: "800", color: "#38463d" },
  plannerRow: { flexDirection: "row" },
  timeCell: {
    width: 52,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#aeb8b1",
    backgroundColor: "#f8faf8",
  },
  timeLabel: { fontSize: 11, color: "#5f6a63" },
  plannerCell: {
    width: 108,
    height: 46,
    padding: 2,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#aeb8b1",
    backgroundColor: "#fff",
  },
  studyBlock: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 5,
    borderRadius: 3,
    backgroundColor: "#dcefe2",
  },
  studyText: { fontSize: 9, fontWeight: "600", color: "#245d3d" },
});
