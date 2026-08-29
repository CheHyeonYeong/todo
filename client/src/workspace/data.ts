import type { Dispatch, SetStateAction } from "react";
import { apiFetch } from "../api";
import type { AppData } from "../types";

export type SetWorkspaceData = Dispatch<SetStateAction<AppData>>;
export type ReloadWorkspace = () => Promise<void>;

export function uid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    return (char === "x" ? random : (random & 0x3) | 0x8).toString(16);
  });
}

export async function request(path: string, init?: RequestInit) {
  const response = await apiFetch(path, init);
  if (!response.ok) throw new Error(`요청 실패 (${response.status})`);
  return response;
}
