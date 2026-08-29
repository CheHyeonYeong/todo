import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { Scope } from "../../types";
import { dayKeyOf } from "../../domain/calendar";
import { Card } from "../../shared/ui/Card";
import type { TodoActions } from "../hooks/useTodoActions";
import { styles } from "./TodoCalendar.styles";

const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
const scopeOptions: { value: Scope; label: string }[] = [
  { value: "day", label: "오늘" },
  { value: "week", label: "이번 주" },
  { value: "month", label: "이번 달" },
];

export function TodoCalendar({ todos }: { todos: TodoActions["todos"] }) {
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
  const todayKey = new Date().toISOString().slice(0, 10);
  const dayKey = (day: number) => dayKeyOf(year, month, day);
  const showCurrentMonth = () => {
    const now = new Date();
    setCursor(new Date(now.getFullYear(), now.getMonth(), 1));
  };
  const showPreviousMonth = () => setCursor(new Date(year, month - 1, 1));
  const showNextMonth = () => setCursor(new Date(year, month + 1, 1));
  return (
    <>
      <View style={styles.sectionHeader}>
        <View>
          <Text style={styles.cardTitle}>월간 일정</Text>
          <Text style={styles.muted}>할 일의 마감일을 날짜별로 확인하세요.</Text>
        </View>
        <Pressable style={styles.todayButton} onPress={showCurrentMonth}>
          <Text style={styles.secondaryText}>오늘</Text>
        </Pressable>
      </View>
      <Card>
        <View style={styles.calendarHeader}>
          <Pressable onPress={showPreviousMonth}>
            <Text style={styles.calendarArrow}>‹</Text>
          </Pressable>
          <Text style={styles.calendarTitle}>
            {year}년 {month + 1}월
          </Text>
          <Pressable onPress={showNextMonth}>
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
            const items = day ? todos.filter((todo) => todo.dueDate === key) : [];
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
        {todos
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
