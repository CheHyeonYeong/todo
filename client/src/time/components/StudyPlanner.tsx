import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { addDays, startOfWeek } from "../../todo/model/calendar";
import {
  isMomentNote,
  momentNoteLabel,
  momentNoteText,
  sessionsCoveringHour,
  sessionsStartedBetween,
  totalDurationMs,
} from "../../time/model/sessionRules";
import type { TimeStore } from "../../time/model/store";
import { Card } from "../../shared/ui/Card";
import { showRequestError } from "../../shared/ui/showRequestError";
import { weekdayLabels } from "../../shared/date/weekdayLabels";
import { styles } from "./styles";

type Store = TimeStore;
const handleRequestError = showRequestError;
const weekdays = weekdayLabels;

export function StudyPlanner({ store }: { store: Store }) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [momentNote, setMomentNote] = useState("");
  const start = useMemo(() => addDays(startOfWeek(new Date()), weekOffset * 7), [weekOffset]);
  const days = useMemo(
    () =>
      Array.from({ length: 7 }, (_, index) => {
        const date = new Date(start);
        date.setDate(start.getDate() + index);
        return date;
      }),
    [start],
  );
  const hours = useMemo(() => Array.from({ length: 18 }, (_, index) => index + 6), []);
  const sessionAt = (date: Date, hour: number) => sessionsCoveringHour(store.data.sessions, date, hour);
  // 마지막 날의 다음 날 0시까지. 고정 24시간이면 서머타임이 있는 지역에서 한 시간이 새거나 겹친다.
  const weekSessions = useMemo(
    () => sessionsStartedBetween(store.data.sessions, days[0], addDays(days[6], 1)),
    [days, store.data.sessions],
  );
  const totalMinutes = useMemo(() => Math.round(totalDurationMs(weekSessions) / 60000), [weekSessions]);
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
      .catch(handleRequestError);
    setMomentNote("");
  };
  const notes = useMemo(() => weekSessions.filter(isMomentNote), [weekSessions]);
  return (
    <Card>
      <View style={styles.sectionHeader}>
        <View>
          <Text style={styles.cardTitle}>주간 스터디 플래너</Text>
          <Text style={styles.muted}>
            {start.getMonth() + 1}.{start.getDate()} – {days[6].getMonth() + 1}.{days[6].getDate()} · 총{" "}
            {totalMinutes}분
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
          <Pressable onPress={() => void store.deleteSession(note.id).catch(handleRequestError)}>
            <Text style={styles.danger}>삭제</Text>
          </Pressable>
        </View>
      ))}
    </Card>
  );
}
