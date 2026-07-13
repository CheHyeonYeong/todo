const API_BASE_KEY = "free-adhd-memo:api-base";

const urlParams = new URLSearchParams(window.location.search);
const requestedApiBase = urlParams.get("api");
if (requestedApiBase) {
  localStorage.setItem(API_BASE_KEY, requestedApiBase);
  urlParams.delete("api");
  const nextQuery = urlParams.toString();
  window.history.replaceState({}, "", `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}`);
}

export const API_BASE_URL = (localStorage.getItem(API_BASE_KEY) || "https://158-179-193-175.nip.io").replace(/\/$/, "");
export const SUPABASE_URL = "https://mkvgbffihswfjzgegwlx.supabase.co";
export const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rdmdiZmZpaHN3Zmp6Z2Vnd2x4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5NzA5NzksImV4cCI6MjA5ODU0Njk3OX0.MrKmcsAMCU9fepyD97HMuSSImARjtchiCAaGRzgqsQ8";
