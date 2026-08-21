import { StyleSheet } from "react-native";

export const styles = StyleSheet.create({
  cardTitle: { fontSize: 17, fontWeight: "700", color: "#213128" },
  muted: { marginTop: 3, color: "#748078" },
  sessionLabel: { marginTop: 8, fontSize: 22, fontWeight: "700", color: "#1d3327" },
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
  primaryButton: {
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
    borderRadius: 12,
    backgroundColor: "#176b47",
  },
  primaryText: { fontWeight: "700", color: "#fff" },
  stopButton: {
    marginTop: 8,
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "#a43d35",
  },
});
