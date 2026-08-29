import { useEffect, useRef, useState } from "react";
import { Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { addDays, startOfWeek } from "../../todo/domain/calendar";
import {
  isMomentNote,
  momentNoteText,
  sessionsCoveringHour,
  sessionsStartedBetween,
  totalDurationMs,
} from "../domain/session";
import type { TimeActions, TimerMode } from "../hooks/useTimeActions";
import { styles } from "./TimeScreen.styles";
const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
const fail = (reason: unknown) =>
  Alert.alert("저장 오류", reason instanceof Error ? reason.message : "잠시 후 다시 시도해주세요.");
function Card({ children }: { children: React.ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

export function TimeScreen({ time }: { time: TimeActions }) {
  const [mode, setMode] = useState<TimerMode>("focus");
  const [remaining, setRemaining] = useState(time.timerMinutes.focus * 60);
  const [running, setRunning] = useState(false);
  const [task, setTask] = useState("");
  const [focusCount, setFocusCount] = useState(0);
  const startedAt = useRef<number | null>(null);
  useEffect(() => {
    if (!running) setRemaining(time.timerMinutes[mode] * 60);
  }, [mode, running, time.timerMinutes]);
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
            !time.activeSession
          )
            void time
              .recordTimedSession({
                label: task.trim() || "뽀모도로 집중",
                startedAtMs: startedAt.current,
                endedAtMs: endedAt,
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
            return time.timerMinutes[nextMode] * 60;
          }
          setMode("focus");
          Alert.alert("휴식 완료", "준비되면 다음 집중을 시작하세요.");
          return time.timerMinutes.focus * 60;
        }),
      1000,
    );
    return () => clearInterval(id);
  }, [focusCount, mode, running, task, time]);
  const choose = (next: TimerMode) => {
    setRunning(false);
    startedAt.current = null;
    setMode(next);
    setRemaining(time.timerMinutes[next] * 60);
  };
  const updateMinutes = (value: string) => {
    time.updateTimerMinutes(mode, value);
  };
  const toggleTimer = () => {
    if (running) {
      setRunning(false);
      const endedAt = Date.now();
      if (
        mode === "focus" &&
        startedAt.current &&
        endedAt - startedAt.current >= 60000 &&
        !time.activeSession
      )
        void time
          .recordTimedSession({
            label: task.trim() || "뽀모도로 집중",
            startedAtMs: startedAt.current,
            endedAtMs: endedAt,
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
                value={String(time.timerMinutes[mode])}
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
                  setRemaining(time.timerMinutes[mode] * 60);
                }}
              >
                <Text style={styles.secondaryText}>초기화</Text>
              </Pressable>
            </View>
          </Card>
        </View>
        <View style={styles.timePanel}>
          <SessionTracker time={time} />
        </View>
      </View>
      <StudyPlanner time={time} />
    </ScrollView>
  );
}

function SessionTracker({ time }: { time: TimeActions }) {
  const [label, setLabel] = useState("");
  const [, tick] = useState(0);
  useEffect(() => {
    if (!time.activeSession) return;
    const id = setInterval(() => tick((value) => value + 1), 30000);
    return () => clearInterval(id);
  }, [time.activeSession]);
  const elapsed = time.activeSession
    ? Math.floor((Date.now() - new Date(time.activeSession.startedAt).getTime()) / 60000)
    : 0;
  return (
    <Card>
      <Text style={styles.cardTitle}>작업 시간 기록</Text>
      {time.activeSession ? (
        <>
          <Text style={styles.sessionLabel}>{time.activeSession.label || "이름 없는 작업"}</Text>
          <Text style={styles.muted}>{elapsed}분째 기록 중</Text>
          <Pressable style={styles.stopButton} onPress={() => void time.stopSession().catch(fail)}>
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
                void time.startSession(label);
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

function StudyPlanner({ time }: { time: TimeActions }) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [momentNote, setMomentNote] = useState("");
  const start = addDays(startOfWeek(new Date()), weekOffset * 7);
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
  const hours = Array.from({ length: 18 }, (_, index) => index + 6);
  const sessionAt = (date: Date, hour: number) => sessionsCoveringHour(time.sessions, date, hour);
  // 마지막 날의 다음 날 0시까지. 고정 24시간이면 서머타임이 있는 지역에서 한 시간이 새거나 겹친다.
  const weekSessions = sessionsStartedBetween(time.sessions, days[0], addDays(days[6], 1));
  const total = totalDurationMs(weekSessions);
  const addMoment = () => {
    const body = momentNote.trim();
    if (!body) return;
    void time.recordMomentNote(body).catch(fail);
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
          <Pressable onPress={() => void time.deleteSession(note.id).catch(fail)}>
            <Text style={styles.danger}>삭제</Text>
          </Pressable>
        </View>
      ))}
    </Card>
  );
}
