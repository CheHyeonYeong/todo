import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { addDays, dateKey, dayKeyOf, defaultDueDate, startOfWeek } from "../../domain/calendar";
import {
  isMomentNote,
  momentNoteLabel,
  momentNoteText,
  sessionsCoveringHour,
  sessionsStartedBetween,
  totalDurationMs,
} from "../../domain/session";
import { completionPatch } from "../../domain/todo";
import type { Scope, Todo } from "../../types";
import type { useAppData } from "../../useAppData";
import { Card } from "../../shared/ui/Card";
import { showRequestError } from "../../shared/ui/showRequestError";
import { weekdayLabels } from "../../shared/date/weekdayLabels";
import { styles } from "./styles";

type Store = ReturnType<typeof useAppData>;
const fail = showRequestError;
const weekdays = weekdayLabels;
const scopeOptions: { value: Scope; label: string }[] = [
  { value: "day", label: "오늘" },
  { value: "week", label: "이번 주" },
  { value: "month", label: "이번 달" },
];

export function RoutineEditor({ store }: { store: Store }) {
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
