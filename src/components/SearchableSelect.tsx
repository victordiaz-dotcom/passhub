import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

type Option = { id: string; label: string };

export function SearchableSelect({
  id,
  options,
  value,
  onChange,
  placeholder,
  required,
  disabled,
  className,
}: {
  id?: string;
  options: Option[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  className: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [menuAbove, setMenuAbove] = useState(false);
  const [menuHeight, setMenuHeight] = useState(320);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const selectedLabel = options.find((option) => option.id === value)?.label ?? "";
  const displayValue = open ? query : selectedLabel;

  const filtered = query
    ? options.filter((option) => option.label.toLowerCase().includes(query.toLowerCase()))
    : options;
  const visibleOptions = filtered.slice(0, 5);

  useLayoutEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const rect = inputRef.current?.getBoundingClientRect();
      if (!rect) return;
      const viewport = window.visualViewport;
      const top = viewport?.offsetTop ?? 0;
      const bottom = top + (viewport?.height ?? window.innerHeight);
      const below = bottom - rect.bottom - 8;
      const above = rect.top - top - 8;
      const showAbove = below < 260 && above > below;
      setMenuAbove(showAbove);
      setMenuHeight(Math.max(96, Math.min(320, showAbove ? above : below)));
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    window.visualViewport?.addEventListener("resize", updatePosition);
    window.visualViewport?.addEventListener("scroll", updatePosition);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      window.visualViewport?.removeEventListener("resize", updatePosition);
      window.visualViewport?.removeEventListener("scroll", updatePosition);
    };
  }, [open]);

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  function handleSelect(option: Option) {
    onChange(option.id);
    setQuery("");
    setActiveIndex(-1);
    setOpen(false);
  }

  return (
    <div className="relative min-w-0">
      <input
        ref={inputRef}
        id={id}
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
        autoComplete="off"
        required={required && !value}
        disabled={disabled}
        placeholder={placeholder}
        value={displayValue}
        onFocus={() => {
          setQuery("");
          setActiveIndex(-1);
          setOpen(true);
        }}
        onClick={() => {
          if (!open) {
            setQuery("");
            setActiveIndex(-1);
            setOpen(true);
          }
        }}
        onBlur={() => {
          setOpen(false);
          setQuery("");
          setActiveIndex(-1);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setOpen(false);
            setQuery("");
          } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            if (!open) setOpen(true);
            setActiveIndex((index) => {
              if (!visibleOptions.length) return -1;
              if (event.key === "ArrowDown") return (index + 1) % visibleOptions.length;
              return index <= 0 ? visibleOptions.length - 1 : index - 1;
            });
          } else if (event.key === "Enter" && open && activeIndex >= 0 && visibleOptions[activeIndex]) {
            event.preventDefault();
            handleSelect(visibleOptions[activeIndex]);
          }
        }}
        onChange={(event) => {
          setQuery(event.target.value);
          setActiveIndex(-1);
          setOpen(true);
        }}
        className={`${className} w-full min-w-0 pr-9`}
      />
      <ChevronDown aria-hidden="true" size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-soft" />
      {open && (
        <ul
          id={listId}
          className={`mac-select-menu absolute z-30 w-full min-w-0 overflow-y-auto p-1 ${menuAbove ? "bottom-full mb-1" : "top-full mt-1"}`}
          style={{ maxHeight: menuHeight }}
          role="listbox"
          aria-label="Colaboradores"
        >
          {filtered.length === 0 ? (
            <li className="mac-select-menu__hint px-3 py-2 text-sm">Sin resultados</li>
          ) : (
            visibleOptions.map((option, index) => (
              <li key={option.id}>
                <button
                  id={`${listId}-${index}`}
                  type="button"
                  role="option"
                  aria-selected={option.id === value}
                  onPointerDown={(event) => {
                    event.preventDefault();
                    if (event.pointerType !== "mouse") handleSelect(option);
                  }}
                  onClick={() => handleSelect(option)}
                  onMouseEnter={() => setActiveIndex(index)}
                  className={`mac-select-menu__option ${activeIndex === index ? "mac-select-menu__option--active" : ""}`}
                >
                  {option.label}
                </button>
              </li>
            ))
          )}
          {filtered.length > visibleOptions.length && <li className="mac-select-menu__hint px-3 py-2 text-xs">Escribe para encontrar más resultados</li>}
        </ul>
      )}
    </div>
  );
}
