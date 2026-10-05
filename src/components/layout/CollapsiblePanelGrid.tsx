import type { ReactNode } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

type Props = {
  open: boolean;
  id: string;
  label: string;
  onToggle: () => void;
  breakpoint?: "xl" | "2xl";
  aside: ReactNode;
  children: ReactNode;
};

type ToggleProps = Pick<Props, "onToggle"> & { open: boolean; controls: string };

export function PanelToggleButton({ open, onToggle, controls }: ToggleProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="panel-layout__toggle"
      aria-label={open ? "Ocultar panel" : "Mostrar panel"}
      title={open ? "Ocultar panel" : "Mostrar panel"}
      aria-expanded={open}
      aria-controls={controls}
    >
      {open ? <PanelLeftClose size={18} aria-hidden="true" /> : <PanelLeftOpen size={18} aria-hidden="true" />}
    </button>
  );
}

export function CollapsiblePanelGrid({ open, id, label, onToggle, breakpoint = "xl", aside, children }: Props) {
  return (
    <div className={`panel-layout panel-layout--${breakpoint} ${open ? "panel-layout--open" : "panel-layout--closed"}`}>
      <aside id={id} className="panel-layout__aside" aria-label={label}>
        <div className="panel-layout__aside-inner" aria-hidden={!open} ref={(node) => { if (node) node.inert = !open; }}>{aside}</div>
        {!open && <PanelToggleButton open={false} onToggle={onToggle} controls={id} />}
      </aside>
      <div className="panel-layout__content">{children}</div>
    </div>
  );
}
