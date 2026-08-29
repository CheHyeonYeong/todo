import { AppShell } from "./src/application/components/AppShell";
import { AuthGate } from "./src/identity/components/AuthGate";
import { useAuthSession } from "./src/identity/hooks/useAuthSession";
import { useAppData } from "./src/useAppData";

export default function App() {
  const { session, checking, login, logout } = useAuthSession();
  const store = useAppData(Boolean(session));

  if (!session) return <AuthGate checking={checking} onLogin={login} />;
  return <AppShell session={session} workspaceData={store} onLogout={logout} />;
}
