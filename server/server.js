import { TodoApplicationService } from "./application/todo-application-service.js";
import { PersistenceGatewayAdapter, runtimeConfig } from "./infrastructure/persistence-gateway.js";
import { SupabaseAuthAdapter } from "./infrastructure/supabase-auth-adapter.js";
import { ApiController, NodeHttpServer, StaticFileController } from "./interfaces/http/node-http-server.js";

const application = new TodoApplicationService(
  new PersistenceGatewayAdapter(),
  new SupabaseAuthAdapter({ url: runtimeConfig.supabaseUrl, anonKey: runtimeConfig.supabaseAnonKey }),
);
const server = new NodeHttpServer({
  apiController: new ApiController(application, { maxBodyBytes: runtimeConfig.maxBodyBytes }),
  staticController: new StaticFileController(runtimeConfig.publicDir),
  allowedOrigins: runtimeConfig.allowedOrigins,
});

server.listen(runtimeConfig.port, "0.0.0.0", () => {
  console.log(`Todo listening on http://0.0.0.0:${runtimeConfig.port}`);
});
