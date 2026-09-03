import { StyleSheet } from "react-native";

export const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    padding: 28,
    backgroundColor: "#f5f7f4",
  },
  logo: { fontSize: 48, fontWeight: "900", color: "#173829" },
  tagline: {
    maxWidth: 300,
    marginBottom: 18,
    textAlign: "center",
    fontSize: 16,
    lineHeight: 24,
    color: "#6d7a72",
  },
  muted: { color: "#78837c" },
  loginButton: {
    minWidth: 240,
    alignItems: "center",
    paddingVertical: 16,
    borderRadius: 15,
    backgroundColor: "#176b47",
  },
  loginText: { fontSize: 16, fontWeight: "700", color: "#fff" },
});
