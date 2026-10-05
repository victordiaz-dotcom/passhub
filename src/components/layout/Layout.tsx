import { useLayoutEffect, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { AppHeader } from "@/components/layout/AppHeader";
import { APP_VERSION } from "@/lib/version";

export function Layout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();

  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader />
      <main className="flex-1">{children}</main>
      <footer className="px-6 py-2 text-right text-[10px] text-ink-soft" aria-label="Versión de PassHub">
        {APP_VERSION}
      </footer>
    </div>
  );
}
