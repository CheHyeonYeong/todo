import { useEffect, useMemo, useState } from "react";
import { Alert, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Card } from "../../shared/ui/Card";
import type { Memo } from "../../types";
import { styles } from "./MemoScreen.styles";

const fail = (reason: unknown) =>
  Alert.alert("저장 오류", reason instanceof Error ? reason.message : "잠시 후 다시 시도해주세요.");

const confirm = (message: string) =>
  Platform.OS === "web" && typeof window !== "undefined" ? window.confirm(message) : true;

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
  const selectMemo = (id: string) => setSelectedMemoId(id);
  const saveMemo = async () => {
    if (!title.trim() && !body.trim()) return;
    try {
      if (selectedMemoId) await onPatchMemo(selectedMemoId, { title: title.trim(), body: body.trim() });
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
  const deleteMemo = async (id: string) => {
    await onDeleteMemo(id);
    if (selectedMemoId === id) resetDraft();
  };
  const confirmDeleteMemo = (id: string) =>
    Platform.OS === "web"
      ? confirm("이 메모를 삭제할까요?") && void deleteMemo(id).catch(fail)
      : Alert.alert("메모 삭제", "이 메모를 삭제할까요?", [
          { text: "취소" },
          { text: "삭제", style: "destructive", onPress: () => void deleteMemo(id).catch(fail) },
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
        <Card key={memo.id}>
          <View style={styles.sectionHeader}>
            <Pressable style={styles.flex} onPress={() => selectMemo(memo.id)}>
              <View>
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
            </Pressable>
            <Pressable onPress={() => confirmDeleteMemo(memo.id)}>
              <Text style={styles.danger}>삭제</Text>
            </Pressable>
          </View>
        </Card>
      ))}
      {!visibleMemos.length && (
        <Text style={styles.empty}>{query ? "검색 결과가 없습니다." : "아직 메모가 없습니다."}</Text>
      )}
    </ScrollView>
  );
}
