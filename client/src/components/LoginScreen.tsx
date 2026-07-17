import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAppData } from "@/hooks/useAppData";

function GoogleLogo() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 48 48">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

export function LoginScreen({ checking }: { checking: boolean }) {
  const { login, loginError } = useAppData();

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-hidden bg-gradient-to-br from-slate-50 via-emerald-50/60 to-emerald-100/50 dark:from-slate-950 dark:via-emerald-950/60 dark:to-emerald-900/40 p-5">
      <div className="pointer-events-none absolute -top-32 -right-20 size-[420px] rounded-full bg-emerald-500/15 blur-[90px]" />
      <div className="pointer-events-none absolute -bottom-36 -left-24 size-[420px] rounded-full bg-slate-900/10 blur-[90px]" />
      <Card className="w-full max-w-sm border-border/60 bg-white/90 dark:bg-card/90 shadow-xl backdrop-blur">
        <CardContent className="flex flex-col items-center px-7 py-9 text-center">
          <img src="/icons/icon-192.png" alt="" width={76} height={76} className="rounded-[20px] shadow-lg" />
          <h1 className="mt-5 text-xl font-bold leading-snug">오늘 할 일, 시간까지 한눈에</h1>
          <p className="mt-2 mb-6 text-sm font-semibold text-muted-foreground">
            할 일 · 메모 · 뽀모도로 · 타임테이블
          </p>
          {checking ? (
            <div className="flex min-h-12 items-center gap-2.5 font-semibold text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              확인 중…
            </div>
          ) : (
            <>
              <Button variant="outline" size="lg" className="w-full gap-2.5 font-bold" onClick={login}>
                <GoogleLogo />
                Google로 계속하기
              </Button>
              {loginError && <p className="mt-3 text-sm font-semibold text-destructive">{loginError}</p>}
              <p className="mt-4 text-xs font-medium text-muted-foreground">
                로그인하면 폰과 PC 어디서든 같은 데이터가 이어집니다.
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
