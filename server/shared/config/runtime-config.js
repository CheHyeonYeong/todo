import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// server/ 디렉터리. 설정 파일이 어디로 옮겨가도 경로 기준은 여기 하나뿐이다.
const serverRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const dataFile = process.env.DATA_FILE || join(serverRoot, "..", "data", "store.json");
const smtp = {
  host: process.env.SMTP_HOST || "",
  port: Number(process.env.SMTP_PORT || 465),
  user: process.env.SMTP_USER || "",
  pass: process.env.SMTP_PASS || "",
};
const archiveAfterMonths = Number(process.env.ARCHIVE_AFTER_MONTHS || 6);
const archiveMonths = (process.env.ARCHIVE_MONTHS || "6,12")
  .split(",")
  .map((month) => Number(month.trim()))
  .filter((month) => Number.isInteger(month) && month >= 1 && month <= 12);
const archiveFallbackEmail = process.env.ARCHIVE_EMAIL_TO || "";
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

export const runtimeConfig = {
  http: {
    port: Number(process.env.PORT || 3000),
    publicDir: process.env.PUBLIC_DIR || join(serverRoot, "public"),
    maxBodyBytes: 1024 * 1024 * 2,
    allowedOrigins: (process.env.ALLOWED_ORIGINS || "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  },
  storage: {
    databaseUrl: process.env.DATABASE_URL || "",
    dataFile,
    tables: {
      todos: process.env.TODOS_TABLE || "todos",
      memos: process.env.MEMOS_TABLE || "memos",
      sessions: process.env.SESSIONS_TABLE || "sessions",
      routines: process.env.ROUTINES_TABLE || "routines",
    },
  },
  // 루틴의 "오늘"은 서버 시간대가 아니라 사용자 시간대 기준이어야 한다.
  appTimeZone: process.env.APP_TIMEZONE || "Asia/Seoul",
  supabase: {
    url: (process.env.SUPABASE_URL || "").replace(/\/$/, ""),
    anonKey: process.env.SUPABASE_ANON_KEY || "",
    serviceRoleKey: supabaseServiceRoleKey,
  },
  /* 오래된 완료 할 일 보관(이메일 export 후 삭제) 설정. SMTP가 없으면 기능이 꺼진다.
     ARCHIVE_MONTHS에 지정된 달(기본 6월·12월)에 한 번씩만 실행되는 반기 배치. */
  archive: {
    smtp,
    afterMonths: archiveAfterMonths,
    months: archiveMonths,
    fallbackEmail: archiveFallbackEmail,
    checkIntervalMs: Number(process.env.ARCHIVE_CHECK_INTERVAL_MS || 6 * 60 * 60 * 1000),
    // 이번 달에 이미 실행했는지 기억하는 마커 파일 (한 달에 한 번만 메일이 가도록)
    stateFile: process.env.ARCHIVE_STATE_FILE || join(dirname(dataFile), ".archive-last-run"),
    enabled:
      Boolean(smtp.host && smtp.user && smtp.pass) &&
      archiveAfterMonths > 0 &&
      archiveMonths.length > 0 &&
      Boolean(archiveFallbackEmail || supabaseServiceRoleKey),
  },
};
