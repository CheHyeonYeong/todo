import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import type { Todo, WorkSession } from "../../types";
import { isMomentNote, momentNoteText } from "../../time/domain/session";
import type { TodoInput } from "../hooks/useTodos";
import { addDays, dateKey } from "../domain/calendar";
import {
  calendarWeekDays,
  HOUR_HEIGHT,
  positionOverlappingSegments,
  sessionSegmentsForWeek,
  sessionsOnDate,
  startOfMondayWeek,
  totalOverlapDurationMs,
} from "../domain/weekly";
import { weeklyStyles as styles } from "./WeeklyCalendarScreen.styles";

const DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
const GRID_HEIGHT = HOUR_HEIGHT * 24;
const fail = (reason: unknown) =>
  Alert.alert("저장 오류", reason instanceof Error ? reason.message : "잠시 후 다시 시도해주세요.");

type SelectedEvent = { kind: "todo"; item: Todo } | { kind: "session"; item: WorkSession };

function formatRange(days: Date[]) {
  const format = (date: Date) =>
    `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")}`;
  return `${format(days[0])} – ${format(days[6])}`;
}

function formatTime(date: Date) {
  return date.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function formatDuration(milliseconds: number) {
  const minutes = Math.round(milliseconds / 60_000);
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`;
}

export function WeeklyCalendarScreen({
  todos,
  sessions,
  today,
  nowMs,
  onAddTodo,
  onToggleTodo,
  onDeleteTodo,
  onRecordMomentNote,
  onDeleteSession,
}: {
  todos: Todo[];
  sessions: WorkSession[];
  today: Date;
  nowMs: () => number;
  onAddTodo: (input: TodoInput) => Promise<void>;
  onToggleTodo: (todo: Todo) => void;
  onDeleteTodo: (id: string) => Promise<void>;
  onRecordMomentNote: (body: string) => Promise<void>;
  onDeleteSession: (id: string) => Promise<void>;
}) {
  const { width } = useWindowDimensions();
  const [weekCursor, setWeekCursor] = useState(() => startOfMondayWeek(today));
  const [selectedDate, setSelectedDate] = useState(today);
  const [now, setNow] = useState(() => new Date(nowMs()));
  const [memoDraft, setMemoDraft] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<SelectedEvent | null>(null);
  const headerScroll = useRef<ScrollView>(null);
  const verticalScroll = useRef<ScrollView>(null);
  const didInitialScroll = useRef(false);
  const days = useMemo(() => calendarWeekDays(weekCursor), [weekCursor]);
  const dayWidth = Math.max(134, (width - 280 - 64) / 7);
  const calendarWidth = dayWidth * 7;
  const segments = useMemo(
    () => positionOverlappingSegments(sessionSegmentsForWeek(sessions, weekCursor)),
    [sessions, weekCursor],
  );
  const selectedKey = dateKey(selectedDate);
  const todayKey = dateKey(today);
  const selectedTodos = todos.filter((todo) => todo.dueDate === selectedKey && !todo.parentId);
  const selectedSessions = sessionsOnDate(sessions, selectedDate);
  const selectedNotes = selectedSessions.filter(isMomentNote);
  const completed = selectedTodos.filter((todo) => todo.done);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date(nowMs())), 60_000);
    return () => clearInterval(timer);
  }, [nowMs]);

  useEffect(() => {
    if (didInitialScroll.current) return;
    didInitialScroll.current = true;
    const isCurrentWeek = dateKey(startOfMondayWeek(today)) === dateKey(startOfMondayWeek(weekCursor));
    const minute = isCurrentWeek ? today.getHours() * 60 + today.getMinutes() : 9 * 60;
    const y = Math.max(0, (minute / 60) * HOUR_HEIGHT - 170);
    setTimeout(() => verticalScroll.current?.scrollTo({ y, animated: false }), 0);
  }, [today, weekCursor]);

  const moveWeek = (amount: number) => {
    setWeekCursor((value) => addDays(value, amount * 7));
    setSelectedDate((value) => addDays(value, amount * 7));
  };
  const goToday = () => {
    setWeekCursor(startOfMondayWeek(today));
    setSelectedDate(today);
    const minute = today.getHours() * 60 + today.getMinutes();
    setTimeout(
      () => verticalScroll.current?.scrollTo({ y: Math.max(0, (minute / 60) * HOUR_HEIGHT - 170) }),
      0,
    );
  };
  const submitMemo = async () => {
    if (!memoDraft.trim()) return;
    try {
      await onRecordMomentNote(memoDraft.trim());
      setMemoDraft("");
    } catch (reason) {
      fail(reason);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.toolbar}>
        <View style={styles.toolbarLeft}>
          <Pressable accessibilityLabel="이전 주" style={styles.arrowButton} onPress={() => moveWeek(-1)}>
            <Text style={styles.arrow}>‹</Text>
          </Pressable>
          <Text style={styles.range}>{formatRange(days)}</Text>
          <Pressable accessibilityLabel="다음 주" style={styles.arrowButton} onPress={() => moveWeek(1)}>
            <Text style={styles.arrow}>›</Text>
          </Pressable>
          <Pressable style={styles.todayButton} onPress={goToday}>
            <Text style={styles.todayButtonText}>이번 주</Text>
          </Pressable>
        </View>
        <Pressable style={styles.addButton} onPress={() => setShowCreate(true)}>
          <Text style={styles.addButtonText}>+ ADD EVENT</Text>
        </Pressable>
      </View>

      <View style={styles.workspace}>
        <DailySummary
          date={selectedDate}
          todayKey={todayKey}
          todos={selectedTodos}
          completed={completed}
          notes={selectedNotes}
          focusMs={totalOverlapDurationMs(sessions, selectedDate)}
          memoDraft={memoDraft}
          onChangeMemo={setMemoDraft}
          onSubmitMemo={submitMemo}
          onSelectTodo={(item) => setSelectedEvent({ kind: "todo", item })}
          onDeleteNote={(id) => void onDeleteSession(id).catch(fail)}
        />

        <View style={styles.calendarArea}>
          <View style={styles.calendarHeaderRow}>
            <View style={styles.axisHeader}>
              <Text style={styles.timezone}>GMT+9</Text>
              <Text style={styles.allDayLabel}>ALL-DAY</Text>
            </View>
            <ScrollView
              ref={headerScroll}
              horizontal
              scrollEnabled={false}
              showsHorizontalScrollIndicator={false}
              style={styles.headerViewport}
            >
              <View style={{ width: calendarWidth }}>
                <View style={styles.dayHeaders}>
                  {days.map((day, index) => {
                    const key = dateKey(day);
                    const selected = key === selectedKey;
                    const isToday = key === todayKey;
                    return (
                      <Pressable
                        key={key}
                        accessibilityLabel={`${day.toLocaleDateString("ko-KR")}${isToday ? ", 오늘" : ""}${selected ? ", 선택됨" : ""}`}
                        accessibilityState={{ selected }}
                        style={[styles.dayHeader, { width: dayWidth }, selected && styles.dayHeaderSelected]}
                        onPress={() => setSelectedDate(day)}
                      >
                        <View style={styles.dayHeaderTop}>
                          <Text style={[styles.weekday, selected && styles.inverseText]}>{DAYS[index]}</Text>
                          <View
                            style={[
                              styles.dateBadge,
                              isToday && styles.todayBadge,
                              selected && styles.selectedBadge,
                            ]}
                          >
                            <Text style={[styles.badgeText, selected && styles.inverseText]}>
                              {day.getDate()}
                            </Text>
                          </View>
                        </View>
                        <Text style={[styles.largeDate, selected && styles.inverseText]}>
                          {day.getDate()}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <View style={styles.allDayRow}>
                  {days.map((day) => {
                    const items = todos.filter((todo) => todo.dueDate === dateKey(day) && !todo.parentId);
                    return (
                      <View key={dateKey(day)} style={[styles.allDayColumn, { width: dayWidth }]}>
                        {items.slice(0, 2).map((todo) => (
                          <Pressable
                            key={todo.id}
                            style={[styles.allDayEvent, todo.done && styles.completedEvent]}
                            onPress={() => setSelectedEvent({ kind: "todo", item: todo })}
                          >
                            <Text
                              style={[styles.allDayEventText, todo.done && styles.completedText]}
                              numberOfLines={1}
                            >
                              {todo.done ? "✓ " : ""}
                              {todo.title}
                            </Text>
                          </Pressable>
                        ))}
                        {items.length > 2 && <Text style={styles.moreText}>+{items.length - 2}개</Text>}
                      </View>
                    );
                  })}
                </View>
              </View>
            </ScrollView>
          </View>

          <ScrollView ref={verticalScroll} style={styles.verticalViewport} nestedScrollEnabled>
            <View style={styles.timelineRow}>
              <View style={styles.timeAxis}>
                {Array.from({ length: 24 }, (_, hour) => (
                  <Text key={hour} style={[styles.hourLabel, { top: hour * HOUR_HEIGHT - 7 }]}>
                    {hour === 0
                      ? "12 AM"
                      : hour < 12
                        ? `${hour} AM`
                        : hour === 12
                          ? "12 PM"
                          : `${hour - 12} PM`}
                  </Text>
                ))}
              </View>
              <ScrollView
                horizontal
                nestedScrollEnabled
                showsHorizontalScrollIndicator
                scrollEventThrottle={16}
                style={styles.gridViewport}
                onScroll={(event) =>
                  headerScroll.current?.scrollTo({ x: event.nativeEvent.contentOffset.x, animated: false })
                }
              >
                <View style={[styles.grid, { width: calendarWidth }]}>
                  {days.map((day, index) => (
                    <View
                      key={dateKey(day)}
                      style={[
                        styles.dayColumn,
                        { left: index * dayWidth, width: dayWidth },
                        dateKey(day) === selectedKey && styles.selectedColumn,
                      ]}
                    />
                  ))}
                  {Array.from({ length: 24 }, (_, hour) => (
                    <View key={hour} style={[styles.hourLine, { top: hour * HOUR_HEIGHT }]} />
                  ))}
                  {segments.map((segment, index) => {
                    const started = new Date(segment.session.startedAt);
                    const ended = new Date(segment.session.endedAt);
                    return (
                      <Pressable
                        key={`${segment.session.id}-${segment.dayIndex}-${index}`}
                        accessibilityLabel={`${segment.session.label}, ${formatTime(started)}부터 ${formatTime(ended)}까지`}
                        style={[
                          styles.sessionCard,
                          {
                            left:
                              segment.dayIndex * dayWidth +
                              5 +
                              segment.lane * ((dayWidth - 10) / segment.laneCount),
                            top: segment.top,
                            width: (dayWidth - 10) / segment.laneCount - 2,
                            height: segment.height,
                          },
                        ]}
                        onPress={() => setSelectedEvent({ kind: "session", item: segment.session })}
                      >
                        <Text style={styles.sessionTitle} numberOfLines={1}>
                          {segment.session.label}
                        </Text>
                        {segment.height >= 38 && (
                          <Text style={styles.sessionTime}>
                            {formatTime(started)} – {formatTime(ended)}
                          </Text>
                        )}
                      </Pressable>
                    );
                  })}
                  {dateKey(startOfMondayWeek(now)) === dateKey(startOfMondayWeek(weekCursor)) && (
                    <View
                      pointerEvents="none"
                      style={[
                        styles.nowLine,
                        {
                          left: ((now.getDay() + 6) % 7) * dayWidth,
                          top: ((now.getHours() * 60 + now.getMinutes()) / 60) * HOUR_HEIGHT,
                          width: dayWidth,
                        },
                      ]}
                    >
                      <View style={styles.nowDot} />
                    </View>
                  )}
                </View>
              </ScrollView>
            </View>
          </ScrollView>
        </View>
      </View>

      <CreateEventModal
        visible={showCreate}
        selectedDate={selectedDate}
        onClose={() => setShowCreate(false)}
        onSave={async (input) => {
          await onAddTodo(input);
          setShowCreate(false);
        }}
      />
      <EventDetail
        selected={selectedEvent}
        onClose={() => setSelectedEvent(null)}
        onToggle={(todo) => {
          onToggleTodo(todo);
          setSelectedEvent(null);
        }}
        onDelete={async (event) => {
          if (event.kind === "todo") await onDeleteTodo(event.item.id);
          else await onDeleteSession(event.item.id);
          setSelectedEvent(null);
        }}
      />
    </View>
  );
}

function DailySummary({
  date,
  todayKey,
  todos,
  completed,
  notes,
  focusMs,
  memoDraft,
  onChangeMemo,
  onSubmitMemo,
  onSelectTodo,
  onDeleteNote,
}: {
  date: Date;
  todayKey: string;
  todos: Todo[];
  completed: Todo[];
  notes: WorkSession[];
  focusMs: number;
  memoDraft: string;
  onChangeMemo: (value: string) => void;
  onSubmitMemo: () => void;
  onSelectTodo: (todo: Todo) => void;
  onDeleteNote: (id: string) => void;
}) {
  return (
    <View style={styles.summary}>
      <View style={styles.summaryTitleBlock}>
        <Text style={styles.summaryEyebrow}>DAILY SUMMARY</Text>
        <Text style={styles.summaryCaption}>Workspace Agenda</Text>
      </View>
      <View style={styles.selectedDateBlock}>
        <View>
          <Text style={styles.summarySectionLabel}>SELECTED DAY</Text>
          <Text style={styles.selectedDateText}>
            {date
              .toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
              .toUpperCase()}
          </Text>
        </View>
        {dateKey(date) === todayKey && <Text style={styles.todayChip}>TODAY</Text>}
      </View>
      <ScrollView contentContainerStyle={styles.summaryContent}>
        <SummaryHeading title="총 집중 시간 (FOCUS TIME)" value="◷" />
        <View style={styles.focusCard}>
          <Text style={styles.focusValue}>{formatDuration(focusMs)}</Text>
        </View>

        <SummaryHeading title="완료 일정 (COMPLETED)" value={`${completed.length}/${todos.length}`} />
        {completed.length ? (
          completed.map((todo) => (
            <Pressable key={todo.id} style={styles.summaryItem} onPress={() => onSelectTodo(todo)}>
              <Text style={styles.checkIcon}>●</Text>
              <Text style={[styles.summaryItemText, styles.completedText]} numberOfLines={1}>
                {todo.title}
              </Text>
            </Pressable>
          ))
        ) : (
          <Text style={styles.emptyText}>완료한 일정이 없습니다.</Text>
        )}

        <SummaryHeading title="오늘의 메모 (MEMO)" value="✎" />
        <View style={styles.memoInputRow}>
          <TextInput
            style={styles.memoInput}
            value={memoDraft}
            onChangeText={onChangeMemo}
            placeholder="+ Quick memo..."
            placeholderTextColor="#9CA3AF"
            onSubmitEditing={onSubmitMemo}
          />
          <Pressable accessibilityLabel="빠른 메모 저장" onPress={onSubmitMemo}>
            <Text style={styles.memoAdd}>↵</Text>
          </Pressable>
        </View>
        {notes.length ? (
          notes.map((note) => (
            <View key={note.id} style={styles.memoCard}>
              <View style={styles.memoCardTop}>
                <Text style={styles.memoText}>{momentNoteText(note)}</Text>
                <Pressable accessibilityLabel="메모 삭제" onPress={() => onDeleteNote(note.id)}>
                  <Text style={styles.memoDelete}>×</Text>
                </Pressable>
              </View>
              <Text style={styles.memoTime}>{formatTime(new Date(note.startedAt))}</Text>
            </View>
          ))
        ) : (
          <Text style={styles.emptyText}>메모가 없습니다.</Text>
        )}
      </ScrollView>
    </View>
  );
}

function SummaryHeading({ title, value }: { title: string; value: string }) {
  return (
    <View style={styles.summaryHeading}>
      <Text style={styles.summarySectionLabel}>{title}</Text>
      <Text style={styles.summaryMeta}>{value}</Text>
    </View>
  );
}

function CreateEventModal({
  visible,
  selectedDate,
  onClose,
  onSave,
}: {
  visible: boolean;
  selectedDate: Date;
  onClose: () => void;
  onSave: (input: TodoInput) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await onSave({ title, scope: "day", dueDate: dateKey(selectedDate), category, note });
      setTitle("");
      setCategory("");
      setNote("");
    } catch (reason) {
      fail(reason);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.createModal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>새 일정 등록</Text>
            <Pressable onPress={onClose}>
              <Text style={styles.closeText}>×</Text>
            </Pressable>
          </View>
          <Text style={styles.fieldLabel}>일정 제목 *</Text>
          <TextInput
            style={styles.fieldInput}
            value={title}
            onChangeText={setTitle}
            placeholder="무엇을 완료할까요?"
          />
          <Text style={styles.fieldLabel}>일자</Text>
          <View style={styles.readonlyField}>
            <Text style={styles.readonlyText}>{dateKey(selectedDate)}</Text>
            <Text style={styles.allDayPill}>ALL-DAY</Text>
          </View>
          <Text style={styles.fieldLabel}>카테고리</Text>
          <TextInput
            style={styles.fieldInput}
            value={category}
            onChangeText={setCategory}
            placeholder="업무, 개인, 루틴..."
          />
          <Text style={styles.fieldLabel}>메모</Text>
          <TextInput
            style={[styles.fieldInput, styles.noteInput]}
            value={note}
            onChangeText={setNote}
            multiline
            placeholder="세부 내용"
          />
          <View style={styles.modalActions}>
            <Pressable style={styles.cancelButton} onPress={onClose}>
              <Text style={styles.cancelText}>취소</Text>
            </Pressable>
            <Pressable
              style={[styles.saveButton, (!title.trim() || saving) && styles.disabled]}
              disabled={!title.trim() || saving}
              onPress={() => void save()}
            >
              <Text style={styles.saveText}>{saving ? "저장 중..." : "일정 등록"}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function EventDetail({
  selected,
  onClose,
  onToggle,
  onDelete,
}: {
  selected: SelectedEvent | null;
  onClose: () => void;
  onToggle: (todo: Todo) => void;
  onDelete: (event: SelectedEvent) => Promise<void>;
}) {
  if (!selected) return null;
  const isTodo = selected.kind === "todo";
  const title = selected.kind === "todo" ? selected.item.title : selected.item.label;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.drawerOverlay}>
        <Pressable style={styles.drawerBackdrop} onPress={onClose} />
        <View style={styles.drawer}>
          <View style={styles.drawerHeader}>
            <Text style={styles.drawerTag}>{isTodo ? "ALL-DAY TODO" : "FOCUS SESSION"}</Text>
            <Pressable onPress={onClose}>
              <Text style={styles.closeText}>×</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.drawerContent}>
            <Text style={styles.drawerTitle}>{title}</Text>
            {isTodo ? (
              <>
                <Text style={styles.drawerMeta}>◷ {selected.item.dueDate} · 종일 일정</Text>
                {selected.item.category ? (
                  <Text style={styles.drawerMeta}># {selected.item.category}</Text>
                ) : null}
                {selected.item.note ? (
                  <View style={styles.noteBox}>
                    <Text style={styles.noteBoxText}>{selected.item.note}</Text>
                  </View>
                ) : null}
              </>
            ) : (
              <>
                <Text style={styles.drawerMeta}>
                  ◷ {new Date(selected.item.startedAt).toLocaleString("ko-KR")}
                </Text>
                <Text style={styles.drawerMeta}>
                  종료 {new Date(selected.item.endedAt).toLocaleString("ko-KR")}
                </Text>
                <View style={styles.noteBox}>
                  <Text style={styles.noteBoxText}>집중 시간 기록은 읽기 전용입니다.</Text>
                </View>
              </>
            )}
          </ScrollView>
          <View style={styles.drawerFooter}>
            <Pressable style={styles.deleteButton} onPress={() => void onDelete(selected).catch(fail)}>
              <Text style={styles.deleteText}>삭제</Text>
            </Pressable>
            {isTodo && (
              <Pressable style={styles.completeButton} onPress={() => onToggle(selected.item)}>
                <Text style={styles.saveText}>{selected.item.done ? "완료 취소" : "일정 완료"}</Text>
              </Pressable>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}
