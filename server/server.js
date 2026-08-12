import { buildServer } from "./composition-root.js";

const { config, httpServer, archiveScheduler } = buildServer();

if (archiveScheduler) {
  archiveScheduler.start();
  console.log(
    `archive: enabled (months: ${config.archive.months.join(",")}, cutoff: ${config.archive.afterMonths} months)`,
  );
}

httpServer.listen(config.http.port, "0.0.0.0", () => {
  console.log(`Todo listening on http://0.0.0.0:${config.http.port}`);
});
