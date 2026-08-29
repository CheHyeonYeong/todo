import { apiFetch } from "../api";

export async function request(path: string, init?: RequestInit) {
  const response = await apiFetch(path, init);
  if (!response.ok) throw new Error(`요청 실패 (${response.status})`);
  return response;
}
