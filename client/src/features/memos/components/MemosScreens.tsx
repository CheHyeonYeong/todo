import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import type { useMemos } from "../useMemos";
import { Card, fail, scopeOptions, styles, weekdays } from "../../shared";

type Store = ReturnType<typeof useMemos>;

export function MemoScreen({ store }: { store: Store }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const active = store.data.memos.find((memo) => memo.id === selected);
  useEffect(() => {
    if (active) {
      setTitle(active.title || "");
      setBody(active.body);
    }
  }, [active?.id]);
  const clear = () => {
    setSelected(null);
    setTitle("");
    setBody("");
  };
  const save = async () => {
    if (!title.trim() && !body.trim()) return;
    try {
      if (selected) await store.patchMemo(selected, { title: title.trim(), body: body.trim() });
      else await store.addMemo(title, body);
      clear();
    } catch (reason) {
      fail(reason);
    }
  };
  const visible = [...store.data.memos]
    .filter(
      (memo) =>
        !query.trim() ||
        [memo.title, memo.body, ...(memo.tags || [])].some((value) =>
          value?.toLowerCase().includes(query.trim().toLowerCase()),
        ),
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <View>
        <Text style={styles.heading}>메모</Text>
        <Text style={styles.muted}>
          생각을 붙잡고 #태그로 모아보세요. `- [ ]` 또는 `todo:` 줄은 할 일로도 만들어집니다.
        </Text>
      </View>
      <Card>
        <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="제목" />
        <TextInput
          style={[styles.input, styles.memoInput]}
          value={body}
          onChangeText={setBody}
          placeholder="내용을 입력하세요"
          multiline
          textAlignVertical="top"
        />
        <View style={styles.row}>
          <Pressable style={[styles.primaryButton, styles.flex]} onPress={() => void save()}>
            <Text style={styles.primaryText}>{selected ? "수정 저장" : "메모 저장"}</Text>
          </Pressable>
          {selected && (
            <Pressable style={styles.secondaryButton} onPress={clear}>
              <Text style={styles.secondaryText}>취소</Text>
            </Pressable>
          )}
        </View>
      </Card>
      <TextInput
        style={styles.input}
        value={query}
        onChangeText={setQuery}
        placeholder="메모 검색 (제목 · 본문 · #태그)"
      />
      {visible.map((memo) => (
        <Pressable key={memo.id} onPress={() => setSelected(memo.id)}>
          <Card>
            <View style={styles.sectionHeader}>
              <View style={styles.flex}>
                <Text style={styles.cardTitle}>{memo.title || "제목 없는 메모"}</Text>
                <Text style={styles.memoBody} numberOfLines={4}>
                  {memo.body}
                </Text>
                <View style={styles.metaRow}>
                  {memo.tags.map((tag) => (
                    <Text key={tag} style={styles.chip}>
                      #{tag}
                    </Text>
                  ))}
                </View>
              </View>
              <Pressable
                onPress={() =>
                  Alert.alert("메모 삭제", "이 메모를 삭제할까요?", [
                    { text: "취소" },
                    {
                      text: "삭제",
                      style: "destructive",
                      onPress: () => void store.deleteMemo(memo.id).catch(fail),
                    },
                  ])
                }
              >
                <Text style={styles.danger}>삭제</Text>
              </Pressable>
            </View>
          </Card>
        </Pressable>
      ))}
      {!visible.length && (
        <Text style={styles.empty}>{query ? "검색 결과가 없습니다." : "아직 메모가 없습니다."}</Text>
      )}
    </ScrollView>
  );
}
