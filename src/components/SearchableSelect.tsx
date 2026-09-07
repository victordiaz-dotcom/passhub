import { useState } from "react";

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

  const selectedLabel = options.find((option) => option.id === value)?.label ?? "";
  const displayValue = open ? query : selectedLabel;

  const filtered = query
    ? options.filter((option) => option.label.toLowerCase().includes(query.toLowerCase()))
    : options;

  function handleSelect(option: Option) {
    onChange(option.id);
    setQuery("");
    setOpen(false);
  }

  return (
    <div className="relative">
      <input
        id={id}
        type="text"
        autoComplete="off"
        required={required && !value}
        disabled={disabled}
        placeholder={placeholder}
        value={displayValue}
        onFocus={() => {
          setQuery("");
          setOpen(true);
        }}
        onBlur={() => {
          setOpen(false);
          setQuery("");
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
        onChange={(e) => setQuery(e.target.value)}
        className={className}
      />
      {open && (
        <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-md border border-line bg-card shadow-md">
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-sm text-ink-soft">Sin resultados</li>
          ) : (
            filtered.map((option) => (
              <li key={option.id}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleSelect(option)}
                  className="block w-full px-3 py-2 text-left text-sm text-ink hover:bg-accent-tint"
                >
                  {option.label}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
