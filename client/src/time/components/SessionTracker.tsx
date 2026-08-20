import { useEffect, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import type { TimeStore } from "../../time/model/store";
import { Card } from "../../shared/ui/Card";
import { showRequestError } from "../../shared/ui/showRequestError";
import { styles } from "./styles";

type Store = TimeStore;
const handleRequestError = showRequestError;

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
          <Pressable
            style={styles.stopButton}
            onPress={() => void store.stopSession().catch(handleRequestError)}
          >
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
