import { AppShell } from "./src/application/components/AppShell";
import { AuthGate } from "./src/identity/components/AuthGate";
import { useAuthSession } from "./src/identity/hooks/useAuthSession";
import { useAppData } from "./src/useAppData";

export default function App() {
  const auth = useAuthSession();
  const store = useAppData(Boolean(auth.session));

  return (
    <AuthGate auth={auth}>
      {(session) => <AppShell session={session} store={store} onLogout={auth.logout} />}
    </AuthGate>
  );
}
