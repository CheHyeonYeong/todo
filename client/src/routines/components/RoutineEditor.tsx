import { useState } from "react";
import { Alert, Pressable, Text, TextInput, View } from "react-native";
import type { Routine } from "../../types";
import { Card } from "../../shared/ui/Card";
import { styles } from "./RoutineEditor.styles";

const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
function fail(reason: unknown) {
  Alert.alert("저장 오류", reason instanceof Error ? reason.message : "잠시 후 다시 시도해주세요.");
}

export function RoutineEditor({
  routines,
  onAddRoutine,
  onPatchRoutine,
  onDeleteRoutine,
}: {
  routines: Routine[];
  onAddRoutine: (title: string, weekdays: number[], category?: string) => Promise<void>;
  onPatchRoutine: (id: string, patch: Partial<Routine>) => Promise<void>;
  onDeleteRoutine: (id: string) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const submitRoutine = async () => {
    if (!title.trim() || !days.length) return;
    try {
      await onAddRoutine(title, days, category);
      setTitle("");
    } catch (reason) {
      fail(reason);
    }
  };
  const toggleWeekday = (day: number) =>
    setDays((current) =>
      current.includes(day) ? current.filter((value) => value !== day) : [...current, day],
    );
  const toggleRoutine = (routineId: string, active: boolean) =>
    void onPatchRoutine(routineId, { active: !active }).catch(fail);
  const deleteRoutine = (routineId: string) => void onDeleteRoutine(routineId).catch(fail);
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
            onPress={() => toggleWeekday(index)}
          >
            <Text style={[styles.dayText, days.includes(index) && styles.primaryText]}>{label}</Text>
          </Pressable>
        ))}
      </View>
      <Pressable style={styles.secondaryButton} onPress={() => void submitRoutine()}>
        <Text style={styles.secondaryText}>루틴 추가</Text>
      </Pressable>
      {routines.map((routine) => (
        <View key={routine.id} style={styles.listRow}>
          <Pressable style={styles.flex} onPress={() => toggleRoutine(routine.id, routine.active)}>
            <Text style={[styles.todoTitle, !routine.active && styles.done]}>{routine.title}</Text>
            <Text style={styles.meta}>{routine.weekdays.map((day) => weekdays[day]).join(" · ")}</Text>
          </Pressable>
          <Pressable onPress={() => deleteRoutine(routine.id)}>
            <Text style={styles.danger}>삭제</Text>
          </Pressable>
        </View>
      ))}
    </Card>
  );
}
