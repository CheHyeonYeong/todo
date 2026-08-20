import { StyleSheet } from "react-native";

export const styles = StyleSheet.create({
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
  empty: { paddingVertical: 45, textAlign: "center", color: "#8a958e" },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  cardTitle: { fontSize: 17, fontWeight: "700", color: "#213128" },
  chip: {
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 99,
    backgroundColor: "#eaf4ed",
    fontSize: 11,
    color: "#256543",
  },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 9,
    borderTopWidth: 1,
    borderTopColor: "#edf0ed",
  },
  flex: { flex: 1 },
  todoTitle: { fontSize: 15, fontWeight: "600", color: "#26372d" },
  meta: { fontSize: 11, color: "#7b867f" },
  danger: { color: "#a43d35" },
});
