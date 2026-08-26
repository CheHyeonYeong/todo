import { useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import type { Scope } from "../../types";
import type { useAppData } from "../../useAppData";
import { defaultDueDate } from "../../domain/calendar";
import { Card } from "../../shared/ui/Card";
import { RoutineEditor } from "../../routines/components/RoutineEditor";
import { TodoCalendar } from "./TodoCalendar";
import { TodoItem } from "./TodoItem";
import { styles } from "./todoStyles";

type Store = ReturnType<typeof useAppData>;
const scopeOptions: { value: Scope; label: string }[] = [
  { value: "day", label: "오늘" },
  { value: "week", label: "이번 주" },
  { value: "month", label: "이번 달" },
];
function fail(reason: unknown) {
  Alert.alert("저장 오류", reason instanceof Error ? reason.message : "잠시 후 다시 시도해주세요.");
}

export function TodoScreen({ store }: { store: Store }) {
  const [view, setView] = useState<"list" | "calendar">("list");
  const [scope, setScope] = useState<Scope>("day");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [dueDate, setDueDate] = useState("");
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
      await store.addTodo({
        title,
        scope,
        category,
        dueDate: dueDate || defaultDueDate(scope, new Date()),
      });
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
            <TodoItem key={todo.id} todo={todo} store={store} />
          ))}
        </>
      )}
    </ScrollView>
  );
}
