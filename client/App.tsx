import { AppShell } from "./src/application/components/AppShell";
import { AuthGate } from "./src/identity/components/AuthGate";
import { useAuthSession } from "./src/identity/hooks/useAuthSession";
import { useAppData } from "./src/useAppData";

export default function App() {
  const { session, isCheckingSession, signInWithGoogle, signOut } = useAuthSession();
  const workspaceData = useAppData(Boolean(session));

  if (!session) return <AuthGate isCheckingSession={isCheckingSession} onSignIn={signInWithGoogle} />;
  return <AppShell session={session} workspaceData={workspaceData} onSignOut={signOut} />;
}
