import type { ReactNode } from "react";

type PageHeaderProps = {
  title: string;
  description: string;
  actions?: ReactNode;
};

type PageShellProps = {
  children: ReactNode;
  width?: "narrow" | "medium" | "wide" | "full";
};

export function PageShell({ children, width = "wide" }: PageShellProps) {
  const maxWidth = {
    narrow: "max-w-4xl",
    medium: "max-w-6xl",
    wide: "max-w-7xl",
    full: "max-w-none",
  }[width];
  return (
    <div className={`mx-auto w-full px-4 py-6 sm:px-6 ${width === "full" ? "max-w-none" : "max-w-7xl"}`}>
      <div className={maxWidth}>{children}</div>
    </div>
  );
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-line pb-5">
      <div className="min-w-0">
        <h1 className="font-display text-2xl font-bold text-ink">{title}</h1>
        <p className="mt-1 text-sm text-ink-soft">{description}</p>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
    </div>
  );
}
