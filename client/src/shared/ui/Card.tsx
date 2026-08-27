import { StyleSheet, View } from "react-native";

export function Card({ children }: { children: React.ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    gap: 11,
    padding: 15,
    borderWidth: 1,
    borderColor: "#dfe6df",
    borderRadius: 18,
    backgroundColor: "#fff",
  },
});
