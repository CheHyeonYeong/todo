import { randomUUID } from "node:crypto";

import { runtimeConfig } from "./shared/config/runtime-config.js";
import { AppClock } from "./shared/kernel/app-clock.js";
import { createPool, quoteTableNames } from "./shared/persistence/postgres-pool.js";
import { SchemaInstaller } from "./shared/persistence/schema-installer.js";
import { StorageHealth } from "./shared/persistence/storage-health.js";
import { FileUnitOfWork, PostgresUnitOfWork } from "./shared/persistence/unit-of-work.js";
import { WorkspaceFileStore } from "./shared/persistence/workspace-file-store.js";
import { ApiController } from "./shared/interfaces/http/api-controller.js";
import { HealthRouter } from "./shared/interfaces/http/health-router.js";
import { NodeHttpServer } from "./shared/interfaces/http/node-http-server.js";
import { StaticFileController } from "./shared/interfaces/http/static-file-controller.js";

import { IdentityService } from "./identity/application/identity-service.js";
import { SupabaseAuthAdapter } from "./identity/infrastructure/supabase-auth-adapter.js";
import { SessionRouter } from "./identity/interfaces/http/session-router.js";

import { PlanningService } from "./todo/application/planning-service.js";
import { FileTodoRepository } from "./todo/infrastructure/file-todo-repository.js";
import { PostgresTodoRepository } from "./todo/infrastructure/postgres-todo-repository.js";
import { todoSchema } from "./todo/infrastructure/todo-schema.js";
import { TodoRouter } from "./todo/interfaces/http/todo-router.js";

import { NotesService } from "./notes/application/notes-service.js";
import { FileMemoRepository } from "./notes/infrastructure/file-memo-repository.js";
import { PostgresMemoRepository } from "./notes/infrastructure/postgres-memo-repository.js";
import { memoSchema } from "./notes/infrastructure/memo-schema.js";
import { MemoRouter } from "./notes/interfaces/http/memo-router.js";

import { RoutineService } from "./routines/application/routine-service.js";
import { RoutineMaterializer } from "./routines/domain/routine-materializer.js";
import { FileRoutineRepository } from "./routines/infrastructure/file-routine-repository.js";
import { PostgresRoutineRepository } from "./routines/infrastructure/postgres-routine-repository.js";
import { routineSchema } from "./routines/infrastructure/routine-schema.js";
import { RoutineRouter } from "./routines/interfaces/http/routine-router.js";

import { TimeTrackingService } from "./time/application/time-tracking-service.js";
import { FileTimeSessionRepository } from "./time/infrastructure/file-session-repository.js";
import { PostgresTimeSessionRepository } from "./time/infrastructure/postgres-session-repository.js";
import { sessionSchema } from "./time/infrastructure/session-schema.js";
import { TimeSessionRouter } from "./time/interfaces/http/time-session-router.js";

import { WorkspaceService } from "./workspace/application/workspace-service.js";
import { FileWorkspaceRepository } from "./workspace/infrastructure/file-workspace-repository.js";
import { PostgresWorkspaceRepository } from "./workspace/infrastructure/postgres-workspace-repository.js";
import { WorkspaceRouter } from "./workspace/interfaces/http/workspace-router.js";

import { ArchiveService } from "./archiving/application/archive-service.js";
import { ArchivePolicy } from "./archiving/domain/archive-policy.js";
import { ArchiveScheduler } from "./archiving/infrastructure/archive-scheduler.js";
import { FileArchiveJournal } from "./archiving/infrastructure/file-archive-journal.js";
import { FileArchiveRepository } from "./archiving/infrastructure/file-archive-repository.js";
import { PostgresArchiveRepository } from "./archiving/infrastructure/postgres-archive-repository.js";
import { SmtpArchiveMailer } from "./archiving/infrastructure/smtp-archive-mailer.js";
import { SupabaseUserDirectory } from "./archiving/infrastructure/supabase-user-directory.js";

/**
 * 컴포지션 루트: 어떤 어댑터를 쓸지 정하는 유일한 자리.
 * 여기 말고는 "Postgres인가 파일인가"를 아는 코드가 없다.
 */
export function buildServer(config = runtimeConfig) {
  const clock = new AppClock({ timeZone: config.appTimeZone });
  const pool = createPool(config.storage.databaseUrl);
  const tables = quoteTableNames(config.storage.tables);
  const store = new WorkspaceFileStore(config.storage.dataFile);
  const usePostgres = Boolean(pool);

  // 각 컨텍스트가 자기 테이블 DDL만 내놓고, 실행 순서는 설치기가 맞춘다.
  const schema = new SchemaInstaller(pool, [
    memoSchema(tables),
    todoSchema(tables),
    sessionSchema(tables),
    routineSchema(tables),
  ]);

  const unitOfWork = usePostgres ? new PostgresUnitOfWork(pool, schema) : new FileUnitOfWork(store);
  const todos = usePostgres ? new PostgresTodoRepository(tables) : new FileTodoRepository();
  const memos = usePostgres ? new PostgresMemoRepository(tables) : new FileMemoRepository();
  const sessions = usePostgres ? new PostgresTimeSessionRepository(tables) : new FileTimeSessionRepository();
  const routines = usePostgres ? new PostgresRoutineRepository(tables) : new FileRoutineRepository();
  const workspaces = usePostgres
    ? new PostgresWorkspaceRepository(pool, tables, schema)
    : new FileWorkspaceRepository(store);

  const identity = new IdentityService(
    new SupabaseAuthAdapter({ url: config.supabase.url, anonKey: config.supabase.anonKey }),
  );
  const planning = new PlanningService({ unitOfWork, todos });
  const notes = new NotesService({ unitOfWork, memos, todos });
  const timeTracking = new TimeTrackingService({ unitOfWork, sessions });
  const routineService = new RoutineService({ unitOfWork, routines, todos });
  const workspace = new WorkspaceService({
    workspaces,
    materializer: new RoutineMaterializer({ idFactory: randomUUID }),
    clock,
  });

  const httpServer = new NodeHttpServer({
    apiController: new ApiController({
      identity,
      publicRouters: [new HealthRouter(new StorageHealth(pool)), new SessionRouter(identity)],
      routers: [
        new MemoRouter(notes),
        new TodoRouter(planning),
        new TimeSessionRouter(timeTracking),
        new RoutineRouter(routineService),
        new WorkspaceRouter(workspace),
      ],
      maxBodyBytes: config.http.maxBodyBytes,
    }),
    staticController: new StaticFileController(config.http.publicDir),
    allowedOrigins: config.http.allowedOrigins,
  });

  return {
    config,
    httpServer,
    archiveScheduler: config.archive.enabled
      ? new ArchiveScheduler({
          service: buildArchiveService({ config, clock, pool, tables, store, workspaces, usePostgres }),
          checkIntervalMs: config.archive.checkIntervalMs,
        })
      : null,
  };
}

function buildArchiveService({ config, clock, pool, tables, store, workspaces, usePostgres }) {
  return new ArchiveService({
    policy: new ArchivePolicy({ afterMonths: config.archive.afterMonths }),
    repository: usePostgres
      ? new PostgresArchiveRepository(pool, tables, workspaces)
      : new FileArchiveRepository(store, workspaces),
    mailer: new SmtpArchiveMailer(config.archive.smtp),
    directory: new SupabaseUserDirectory({
      url: config.supabase.url,
      serviceRoleKey: config.supabase.serviceRoleKey,
      fallbackEmail: config.archive.fallbackEmail,
    }),
    journal: new FileArchiveJournal(config.archive.stateFile),
    clock,
    months: config.archive.months,
  });
}
