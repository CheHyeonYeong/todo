import { useMemo, useState } from "react";
import { Alert, Pressable, Text, TextInput, View } from "react-native";
import type { Todo } from "../../types";
import type { useAppData } from "../../useAppData";
import { dateKey } from "../../domain/calendar";
import { completionPatch } from "../../domain/todo";
import { Card } from "../../shared/ui/Card";
import { styles } from "./TodoItem.styles";

type Store = ReturnType<typeof useAppData>;

function fail(reason: unknown) {
  Alert.alert("저장 오류", reason instanceof Error ? reason.message : "잠시 후 다시 시도해주세요.");
}

export function TodoItem({
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
  const children = useMemo(
    () =>
      store.data.todos
        .filter((item) => item.parentId === todo.id)
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
    [store.data.todos, todo.id],
  );
  const overdue = Boolean(todo.dueDate && !todo.done && todo.dueDate < dateKey(new Date()));
  const toggle = () => void store.patchTodo(todo.id, completionPatch(!todo.done, new Date())).catch(fail);
  const remove = () =>
    Alert.alert("할 일 삭제", `“${todo.title}”을 삭제할까요?`, [
      { text: "취소", style: "cancel" },
      {
        text: "삭제",
        style: "destructive",
        onPress: () => void store.deleteTodo(todo.id).catch(fail),
      },
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
      await store.addTodo({
        title: subDraft,
        scope: todo.scope,
        parentId: todo.id,
      });
      setSubDraft("");
      setExpanded(true);
    } catch (reason) {
      fail(reason);
    }
  };
  const toggleDetails = () => setExpanded((value) => !value);
  const startEditing = () => setEditing(true);
  const toggleEditing = () => setEditing((value) => !value);
  const toggleChild = (child: Todo) =>
    void store.patchTodo(child.id, completionPatch(!child.done, new Date())).catch(fail);
  const deleteChild = (childId: string) => void store.deleteTodo(childId).catch(fail);

  return (
    <Card>
      <View style={styles.todoRow}>
        <Pressable style={[styles.checkbox, todo.done && styles.checkboxDone]} onPress={toggle}>
          <Text style={styles.check}>{todo.done ? "✓" : ""}</Text>
        </Pressable>
        <Pressable style={styles.flex} onPress={toggleDetails} onLongPress={startEditing}>
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
        <Pressable onPress={toggleEditing}>
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
                onPress={() => toggleChild(child)}
              >
                <Text style={styles.check}>{child.done ? "✓" : ""}</Text>
              </Pressable>
              <Text style={[styles.flex, child.done && styles.done]}>{child.title}</Text>
              <Pressable onPress={() => deleteChild(child.id)}>
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
