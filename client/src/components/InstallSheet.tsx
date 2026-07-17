import { useEffect, useState } from "react";
import { Check, Copy, Download, Smartphone, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

const CLI_INSTALL = "npm install -g https://todo-cohe.vercel.app/cli.tgz";
const RELEASES_URL = "https://github.com/CheHyeonYeong/todo/releases/latest";

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/* 크롬 계열은 beforeinstallprompt로 설치 버튼을 띄울 수 있고, iOS 사파리는 직접 안내해야 한다. */
export function useInstallPrompt() {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(
    () => window.matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone === true,
  );

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPrompt(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = async () => {
    if (!prompt) return;
    await prompt.prompt();
    await prompt.userChoice;
    setPrompt(null);
  };

  return { canInstall: Boolean(prompt), installed, install };
}

function CopyLine({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2 rounded-lg bg-muted p-2.5">
      <code className="min-w-0 flex-1 overflow-x-auto text-xs whitespace-nowrap">{command}</code>
      <Button
        variant="ghost"
        size="icon"
        className="size-7 shrink-0"
        title="복사"
        onClick={() => {
          navigator.clipboard.writeText(command).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          });
        }}
      >
        {copied ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
      </Button>
    </div>
  );
}

export function InstallSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { canInstall, installed, install } = useInstallPrompt();
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto p-4 sm:max-w-md">
        <SheetHeader className="p-0 pb-3">
          <SheetTitle className="text-xs font-bold tracking-wide text-muted-foreground uppercase">
            설치
          </SheetTitle>
        </SheetHeader>

        <section className="mb-6">
          <h3 className="mb-1.5 flex items-center gap-1.5 text-sm font-bold">
            <Smartphone className="size-4" />앱으로 설치
          </h3>
          <p className="mb-2.5 text-xs leading-relaxed text-muted-foreground">
            홈 화면에 추가하면 주소창 없이 앱처럼 열리고, 오프라인에서도 목록을 볼 수 있습니다.
          </p>
          {installed ? (
            <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">이미 앱으로 실행 중입니다.</p>
          ) : canInstall ? (
            <Button className="w-full font-bold" onClick={install}>
              <Download className="size-4" />앱 설치
            </Button>
          ) : isIos ? (
            <p className="text-xs leading-relaxed text-muted-foreground">
              사파리 하단의 <strong>공유</strong> 버튼을 누르고 <strong>홈 화면에 추가</strong>를 선택하세요.
            </p>
          ) : (
            <p className="text-xs leading-relaxed text-muted-foreground">
              주소창 오른쪽의 <strong>설치</strong> 아이콘을 누르거나, 브라우저 메뉴에서{" "}
              <strong>앱 설치</strong>를 선택하세요.
            </p>
          )}
        </section>

        <section>
          <h3 className="mb-1.5 flex items-center gap-1.5 text-sm font-bold">
            <Terminal className="size-4" />터미널에서 쓰기
          </h3>
          <p className="mb-2.5 text-xs leading-relaxed text-muted-foreground">
            같은 계정, 같은 데이터를 터미널에서 다룹니다. 인자 없이 <code>todo</code>를 치면 TUI가 열립니다.
          </p>
          <CopyLine command={CLI_INSTALL} />
          <div className="mt-2.5 space-y-1.5">
            <CopyLine command="todo login" />
            <CopyLine command="todo add &quot;보고서 마무리&quot; -d 2026-07-15 -c 업무" />
          </div>
          <p className="mt-2.5 text-xs leading-relaxed text-muted-foreground">
            Windows·macOS·Linux 바이너리는{" "}
            <a
              href={RELEASES_URL}
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-emerald-700 dark:text-emerald-300 underline"
            >
              릴리스 페이지
            </a>
            에서 직접 받을 수도 있습니다.
          </p>
        </section>
      </SheetContent>
    </Sheet>
  );
}
