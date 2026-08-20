import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { dateKey, dayKeyOf, defaultDueDate } from "../domain/calendar";
import { completionPatch } from "../domain/todo";
import type { Scope, Todo } from "../../../types";
import type { usePlanning } from "../usePlanning";
import { Card, fail, scopeOptions, styles, weekdays } from "../../shared";

type Store = ReturnType<typeof usePlanning>;

export function TodoScreen({ store }: { store: Store }) {
  const [view, setView] = useState<"list" | "calendar">("list");
  const [scope, setScope] = useState<Scope>("day");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [subDrafts, setSubDrafts] = useState<Record<string, string>>({});
  const [showRoutines, setShowRoutines] = useState(false);
  const roots = useMemo(
    () =>
      store.data.todos
        .filter((todo) => todo.scope === scope && !todo.parentId)
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
    [scope, store.data.todos],
  );

  const submit = async () => {
    if (!title.trim()) return;
    try {
      await store.addTodo({ title, scope, category, dueDate: dueDate || defaultDueDate(scope, new Date()) });
      setTitle("");
      setCategory("");
      setDueDate("");
    } catch (reason) {
      fail(reason);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <View style={styles.sectionHeader}>
        <View>
          <Text style={styles.heading}>할 일</Text>
          <Text style={styles.muted}>목록과 캘린더로 일정을 함께 관리하세요.</Text>
        </View>
        <Pressable style={styles.ghostButton} onPress={() => setShowRoutines((value) => !value)}>
          <Text style={styles.ghostText}>↻ 루틴</Text>
        </Pressable>
      </View>
      <View style={styles.segment}>
        <Pressable
          style={[styles.segmentItem, view === "list" && styles.segmentActive]}
          onPress={() => setView("list")}
        >
          <Text style={[styles.segmentText, view === "list" && styles.segmentTextActive]}>목록</Text>
        </Pressable>
        <Pressable
          style={[styles.segmentItem, view === "calendar" && styles.segmentActive]}
          onPress={() => setView("calendar")}
        >
          <Text style={[styles.segmentText, view === "calendar" && styles.segmentTextActive]}>캘린더</Text>
        </Pressable>
      </View>
      {view === "calendar" ? (
        <TodoCalendar store={store} />
      ) : (
        <>
          <View style={styles.segment}>
            {scopeOptions.map((item) => (
              <Pressable
                key={item.value}
                style={[styles.segmentItem, scope === item.value && styles.segmentActive]}
                onPress={() => setScope(item.value)}
              >
                <Text style={[styles.segmentText, scope === item.value && styles.segmentTextActive]}>
                  {item.label}
                </Text>
              </Pressable>
            ))}
          </View>
          {showRoutines && <RoutineEditor store={store} />}
          <Card>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholder="새 할 일"
              onSubmitEditing={() => void submit()}
            />
            <View style={styles.row}>
              <TextInput
                style={[styles.input, styles.flex]}
                value={category}
                onChangeText={setCategory}
                placeholder="카테고리"
              />
              <TextInput
                style={[styles.input, styles.flex]}
                value={dueDate}
                onChangeText={setDueDate}
                placeholder="마감일 YYYY-MM-DD"
              />
            </View>
            <Pressable
              style={[styles.primaryButton, !title.trim() && styles.disabled]}
              disabled={!title.trim()}
              onPress={() => void submit()}
            >
              <Text style={styles.primaryText}>추가</Text>
            </Pressable>
          </Card>
          {!roots.length && <Text style={styles.empty}>아직 할 일이 없어요.</Text>}
          {roots.map((todo) => (
            <TodoItem
              key={todo.id}
              todo={todo}
              store={store}
              subDraft={subDrafts[todo.id] || ""}
              setSubDraft={(value) => setSubDrafts((current) => ({ ...current, [todo.id]: value }))}
            />
          ))}
        </>
      )}
    </ScrollView>
  );
}

function TodoItem({
  todo,
  store,
  subDraft,
  setSubDraft,
}: {
  todo: Todo;
  store: Store;
  subDraft: string;
  setSubDraft: (value: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(todo.title);
  const [note, setNote] = useState(todo.note || "");
  const [category, setCategory] = useState(todo.category || "");
  const [dueDate, setDueDate] = useState(todo.dueDate || "");
  const children = store.data.todos
    .filter((item) => item.parentId === todo.id)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const overdue = Boolean(todo.dueDate && !todo.done && todo.dueDate < dateKey(new Date()));
  const toggle = () => void store.patchTodo(todo.id, completionPatch(!todo.done, new Date())).catch(fail);
  const remove = () =>
    Alert.alert("할 일 삭제", `“${todo.title}”을 삭제할까요?`, [
      { text: "취소", style: "cancel" },
      { text: "삭제", style: "destructive", onPress: () => void store.deleteTodo(todo.id).catch(fail) },
    ]);
  const save = async () => {
    try {
      await store.patchTodo(todo.id, {
        title: draft.trim() || todo.title,
        note: note.trim() || null,
        category: category.trim() || null,
        dueDate: dueDate.trim() || null,
      });
      setEditing(false);
    } catch (reason) {
      fail(reason);
    }
  };
  const addChild = async () => {
    if (!subDraft.trim()) return;
    try {
      await store.addTodo({ title: subDraft, scope: todo.scope, parentId: todo.id });
      setSubDraft("");
      setExpanded(true);
    } catch (reason) {
      fail(reason);
    }
  };
  return (
    <Card>
      <View style={styles.todoRow}>
        <Pressable style={[styles.checkbox, todo.done && styles.checkboxDone]} onPress={toggle}>
          <Text style={styles.check}>{todo.done ? "✓" : ""}</Text>
        </Pressable>
        <Pressable
          style={styles.flex}
          onPress={() => setExpanded((value) => !value)}
          onLongPress={() => setEditing(true)}
        >
          <Text style={[styles.todoTitle, todo.done && styles.done]}>{todo.title}</Text>
          <View style={styles.metaRow}>
            {todo.category ? <Text style={styles.chip}>{todo.category}</Text> : null}
            {todo.dueDate ? (
              <Text style={[styles.meta, overdue && styles.overdue]}>
                {overdue ? "지연 " : "마감 "}
                {todo.dueDate}
              </Text>
            ) : null}
            {todo.routineId ? <Text style={styles.meta}>↻ 루틴</Text> : null}
            {children.length ? (
              <Text style={styles.meta}>
                하위 {children.filter((item) => item.done).length}/{children.length}
              </Text>
            ) : null}
          </View>
        </Pressable>
        <Pressable onPress={() => setEditing((value) => !value)}>
          <Text style={styles.action}>편집</Text>
        </Pressable>
        <Pressable onPress={remove}>
          <Text style={[styles.action, styles.danger]}>삭제</Text>
        </Pressable>
      </View>
      {editing && (
        <View style={styles.editor}>
          <TextInput style={styles.input} value={draft} onChangeText={setDraft} />
          <View style={styles.row}>
            <TextInput
              style={[styles.input, styles.flex]}
              value={category}
              onChangeText={setCategory}
              placeholder="카테고리"
            />
            <TextInput
              style={[styles.input, styles.flex]}
              value={dueDate}
              onChangeText={setDueDate}
              placeholder="마감일 YYYY-MM-DD"
            />
          </View>
          <TextInput
            style={[styles.input, styles.multiline]}
            value={note}
            onChangeText={setNote}
            placeholder="메모"
            multiline
          />
          <Pressable style={styles.secondaryButton} onPress={() => void save()}>
            <Text style={styles.secondaryText}>저장</Text>
          </Pressable>
        </View>
      )}
      {expanded && (
        <View style={styles.subList}>
          {children.map((child) => (
            <View key={child.id} style={styles.subRow}>
              <Pressable
                style={[styles.smallCheck, child.done && styles.checkboxDone]}
                onPress={() =>
                  void store
                    .patchTodo(child.id, {
                      done: !child.done,
                      completedAt: !child.done ? new Date().toISOString() : null,
                    })
                    .catch(fail)
                }
              >
                <Text style={styles.check}>{child.done ? "✓" : ""}</Text>
              </Pressable>
              <Text style={[styles.flex, child.done && styles.done]}>{child.title}</Text>
              <Pressable onPress={() => void store.deleteTodo(child.id).catch(fail)}>
                <Text style={styles.danger}>×</Text>
              </Pressable>
            </View>
          ))}
          <View style={styles.row}>
            <TextInput
              style={[styles.input, styles.flex]}
              value={subDraft}
              onChangeText={setSubDraft}
              placeholder="하위 목표"
              onSubmitEditing={() => void addChild()}
            />
            <Pressable style={styles.miniButton} onPress={() => void addChild()}>
              <Text style={styles.primaryText}>+</Text>
            </Pressable>
          </View>
        </View>
      )}
    </Card>
  );
}

function RoutineEditor({ store }: { store: Store }) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const submit = async () => {
    if (!title.trim() || !days.length) return;
    try {
      await store.addRoutine(title, days, category);
      setTitle("");
    } catch (reason) {
      fail(reason);
    }
  };
  return (
    <Card>
      <Text style={styles.cardTitle}>반복 루틴</Text>
      <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="루틴 이름" />
      <TextInput style={styles.input} value={category} onChangeText={setCategory} placeholder="카테고리" />
      <View style={styles.weekdays}>
        {weekdays.map((label, index) => (
          <Pressable
            key={label}
            style={[styles.day, days.includes(index) && styles.dayActive]}
            onPress={() =>
              setDays((current) =>
                current.includes(index) ? current.filter((day) => day !== index) : [...current, index],
              )
            }
          >
            <Text style={[styles.dayText, days.includes(index) && styles.primaryText]}>{label}</Text>
          </Pressable>
        ))}
      </View>
      <Pressable style={styles.secondaryButton} onPress={() => void submit()}>
        <Text style={styles.secondaryText}>루틴 추가</Text>
      </Pressable>
      {store.data.routines.map((routine) => (
        <View key={routine.id} style={styles.listRow}>
          <Pressable
            style={styles.flex}
            onPress={() => void store.patchRoutine(routine.id, { active: !routine.active }).catch(fail)}
          >
            <Text style={[styles.todoTitle, !routine.active && styles.done]}>{routine.title}</Text>
            <Text style={styles.meta}>{routine.weekdays.map((day) => weekdays[day]).join(" · ")}</Text>
          </Pressable>
          <Pressable onPress={() => void store.deleteRoutine(routine.id).catch(fail)}>
            <Text style={styles.danger}>삭제</Text>
          </Pressable>
        </View>
      ))}
    </Card>
  );
}

function TodoCalendar({ store }: { store: Store }) {
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const lastDate = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: lastDate }, (_, index) => index + 1),
  ];
  while (cells.length % 7) cells.push(null);
  const todayKey = dateKey(new Date());
  const dayKey = (day: number) => dayKeyOf(year, month, day);
  return (
    <>
      <View style={styles.sectionHeader}>
        <View>
          <Text style={styles.cardTitle}>월간 일정</Text>
          <Text style={styles.muted}>할 일의 마감일을 날짜별로 확인하세요.</Text>
        </View>
        <Pressable
          style={styles.todayButton}
          onPress={() => {
            const now = new Date();
            setCursor(new Date(now.getFullYear(), now.getMonth(), 1));
          }}
        >
          <Text style={styles.secondaryText}>오늘</Text>
        </Pressable>
      </View>
      <Card>
        <View style={styles.calendarHeader}>
          <Pressable onPress={() => setCursor(new Date(year, month - 1, 1))}>
            <Text style={styles.calendarArrow}>‹</Text>
          </Pressable>
          <Text style={styles.calendarTitle}>
            {year}년 {month + 1}월
          </Text>
          <Pressable onPress={() => setCursor(new Date(year, month + 1, 1))}>
            <Text style={styles.calendarArrow}>›</Text>
          </Pressable>
        </View>
        <View style={styles.calendarGrid}>
          {weekdays.map((label, index) => (
            <View key={label} style={styles.weekHeader}>
              <Text
                style={[styles.weekHeaderText, index === 0 && styles.sunday, index === 6 && styles.saturday]}
              >
                {label}
              </Text>
            </View>
          ))}
          {cells.map((day, index) => {
            const key = day ? dayKey(day) : "";
            const items = day ? store.data.todos.filter((todo) => todo.dueDate === key) : [];
            return (
              <View
                key={`${index}-${day}`}
                style={[styles.calendarCell, key === todayKey && styles.calendarToday]}
              >
                {day && (
                  <>
                    <Text
                      style={[
                        styles.calendarDay,
                        index % 7 === 0 && styles.sunday,
                        index % 7 === 6 && styles.saturday,
                      ]}
                    >
                      {day}
                    </Text>
                    {items.slice(0, 3).map((todo) => (
                      <Text
                        key={todo.id}
                        style={[styles.calendarEvent, todo.done && styles.done]}
                        numberOfLines={1}
                      >
                        {todo.done ? "✓ " : ""}
                        {todo.title}
                      </Text>
                    ))}
                    {items.length > 3 && <Text style={styles.more}>+{items.length - 3}</Text>}
                  </>
                )}
              </View>
            );
          })}
        </View>
      </Card>
      <Card>
        <Text style={styles.cardTitle}>마감일 없는 할 일</Text>
        {store.data.todos
          .filter((todo) => !todo.dueDate && !todo.parentId && !todo.done)
          .slice(0, 8)
          .map((todo) => (
            <View key={todo.id} style={styles.listRow}>
              <Text style={styles.todoTitle}>• {todo.title}</Text>
              <Text style={styles.chip}>{scopeOptions.find((item) => item.value === todo.scope)?.label}</Text>
            </View>
          ))}
      </Card>
    </>
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
