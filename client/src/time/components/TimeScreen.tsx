import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useRef, useState } from "react";
import { Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import type { TimeStore } from "../../time/model/store";
import { Card } from "../../shared/ui/Card";
import { showRequestError } from "../../shared/ui/showRequestError";
import { styles } from "./TimeScreen.styles";

type Store = TimeStore;
import { SessionTracker } from "./SessionTracker";
import { StudyPlanner } from "./StudyPlanner";

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
              .catch(showRequestError);
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
          .catch(showRequestError);
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
