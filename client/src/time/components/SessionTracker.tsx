import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { addDays, dateKey, dayKeyOf, defaultDueDate, startOfWeek } from "../../todo/model/calendar";
import {
  isMomentNote,
  momentNoteLabel,
  momentNoteText,
  sessionsCoveringHour,
  sessionsStartedBetween,
  totalDurationMs,
} from "../../time/model/sessionRules";
import { completionPatch } from "../../todo/model/todoRules";
import type { Scope, Todo } from "../../todo/model/types";
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

export function SessionTracker({ store }: { store: Store }) {
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
