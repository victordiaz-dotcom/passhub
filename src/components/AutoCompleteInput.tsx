import { useRef } from "react";

type AutoCompleteInputProps = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
};

// Autocompletado "en línea" al estilo barra de direcciones: mientras se
// escribe, si hay una sugerencia que empieza igual, se completa sola y el
// resto queda seleccionado — sin mostrar una lista desplegable de opciones.
// Seguir escribiendo reemplaza esa selección letra por letra (comportamiento
// nativo del input), así que se corrige/afina solo sin lógica extra.
export function AutoCompleteInput({
  id,
  value,
  onChange,
  suggestions,
  required,
  disabled,
  placeholder,
  className,
}: AutoCompleteInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const deletingRef = useRef(false);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    deletingRef.current = e.key === "Backspace" || e.key === "Delete";
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const typed = e.target.value;

    if (deletingRef.current || !typed) {
      onChange(typed);
      return;
    }

    const match = suggestions.find(
      (s) => s.toLowerCase().startsWith(typed.toLowerCase()) && s.toLowerCase() !== typed.toLowerCase()
    );

    if (!match) {
      onChange(typed);
      return;
    }

    onChange(match);
    requestAnimationFrame(() => {
      inputRef.current?.setSelectionRange(typed.length, match.length);
    });
  }

  return (
    <input
      ref={inputRef}
      id={id}
      type="text"
      required={required}
      disabled={disabled}
      placeholder={placeholder}
      autoComplete="off"
      value={value}
      onKeyDown={handleKeyDown}
      onChange={handleChange}
      className={className}
    />
  );
}
