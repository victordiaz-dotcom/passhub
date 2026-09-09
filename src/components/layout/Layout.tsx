import type { ReactNode } from "react";
import { AppHeader } from "@/components/layout/AppHeader";

export function Layout({ children }: { children: ReactNode }) {
  return (
    <>
      <AppHeader />
      <main>{children}</main>
    </>
  );
}
