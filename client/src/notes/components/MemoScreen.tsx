import { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Card } from "../../shared/ui/Card";
import type { Memo } from "../../types";

const fail = (reason: unknown) =>
  Alert.alert("저장 오류", reason instanceof Error ? reason.message : "잠시 후 다시 시도해주세요.");

export function MemoScreen({
  memos,
  onAddMemo,
  onPatchMemo,
  onDeleteMemo,
}: {
  memos: Memo[];
  onAddMemo: (title: string, body: string) => Promise<void>;
  onPatchMemo: (id: string, patch: Partial<Memo>) => Promise<void>;
  onDeleteMemo: (id: string) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [selectedMemoId, setSelectedMemoId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const selectedMemo = memos.find((memo) => memo.id === selectedMemoId);
  useEffect(() => {
    if (selectedMemo) {
      setTitle(selectedMemo.title || "");
      setBody(selectedMemo.body);
    }
  }, [selectedMemo?.id]);
  const resetDraft = () => {
    setSelectedMemoId(null);
    setTitle("");
    setBody("");
  };
  const saveMemo = async () => {
    if (!title.trim() && !body.trim()) return;
    try {
      if (selectedMemoId)
        await onPatchMemo(selectedMemoId, { title: title.trim(), body: body.trim() });
      else await onAddMemo(title, body);
      resetDraft();
    } catch (reason) {
      fail(reason);
    }
  };
  const visibleMemos = useMemo(
    () =>
      [...memos]
        .filter(
          (memo) =>
            !query.trim() ||
            [memo.title, memo.body, ...memo.tags].some((value) =>
              value?.toLowerCase().includes(query.trim().toLowerCase()),
            ),
        )
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [query, memos],
  );
  const confirmDeleteMemo = (id: string) =>
    Alert.alert("메모 삭제", "이 메모를 삭제할까요?", [
      { text: "취소" },
      { text: "삭제", style: "destructive", onPress: () => void onDeleteMemo(id).catch(fail) },
    ]);
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
          <Pressable style={[styles.primaryButton, styles.flex]} onPress={() => void saveMemo()}>
            <Text style={styles.primaryText}>{selectedMemoId ? "수정 저장" : "메모 저장"}</Text>
          </Pressable>
          {selectedMemoId && (
            <Pressable style={styles.secondaryButton} onPress={resetDraft}>
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
      {visibleMemos.map((memo) => (
        <Pressable key={memo.id} onPress={() => setSelectedMemoId(memo.id)}>
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
              <Pressable onPress={() => confirmDeleteMemo(memo.id)}>
                <Text style={styles.danger}>삭제</Text>
              </Pressable>
            </View>
          </Card>
        </Pressable>
      ))}
      {!visibleMemos.length && (
        <Text style={styles.empty}>{query ? "검색 결과가 없습니다." : "아직 메모가 없습니다."}</Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: {
    width: "100%",
    maxWidth: 1180,
    alignSelf: "center",
    gap: 14,
    paddingHorizontal: 28,
    paddingTop: 22,
    paddingBottom: 100,
  },
  heading: { fontSize: 30, fontWeight: "800", color: "#17251e" },
  muted: { marginTop: 3, color: "#748078" },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  cardTitle: { fontSize: 17, fontWeight: "700", color: "#213128" },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  flex: { flex: 1 },
  input: {
    minHeight: 46,
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#d9e1da",
    borderRadius: 12,
    backgroundColor: "#fbfcfb",
    color: "#17251e",
  },
  memoInput: { minHeight: 150, textAlignVertical: "top" },
  primaryButton: {
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
    borderRadius: 12,
    backgroundColor: "#176b47",
  },
  primaryText: { fontWeight: "700", color: "#fff" },
  secondaryButton: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 15,
    borderWidth: 1,
    borderColor: "#bad0c1",
    borderRadius: 12,
    backgroundColor: "#eef6f1",
  },
  secondaryText: { fontWeight: "700", color: "#176b47" },
  memoBody: { marginTop: 5, lineHeight: 20, color: "#59665e" },
  metaRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6, marginTop: 5 },
  chip: {
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 99,
    backgroundColor: "#eaf4ed",
    fontSize: 11,
    color: "#256543",
  },
  danger: { color: "#a43d35" },
  empty: { paddingVertical: 45, textAlign: "center", color: "#8a958e" },
});
