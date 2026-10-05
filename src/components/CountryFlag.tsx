import type { CSSProperties } from "react";

type CountryFlagProps = {
  code: string;
  className?: string;
  style?: CSSProperties;
};

// Banderas dibujadas con SVG: no dependen de la fuente de emojis del sistema.
export function CountryFlag({ code, className = "h-4 w-6", style }: CountryFlagProps) {
  if (!["MX", "ES", "FR", "IT", "CO", "EU"].includes(code)) return null;
  return (
    <svg viewBox="0 0 24 16" className={`inline-block shrink-0 rounded-[2px] ${className}`} style={style} aria-hidden="true" focusable="false">
      {code === "MX" && <>
        <path fill="#006847" d="M0 0h8v16H0z"/><path fill="#fff" d="M8 0h8v16H8z"/><path fill="#ce1126" d="M16 0h8v16h-8z"/>
        <path fill="#6b4b2a" d="M11 5h2l1 2-.9 2.1-1.1.9-1.2-.9L10 7z"/><path fill="none" stroke="#39764a" strokeWidth=".7" d="M9.7 9.3c1 2 3.6 2.6 4.7 0"/>
      </>}
      {code === "ES" && <>
        <path fill="#aa151b" d="M0 0h24v16H0z"/><path fill="#f1bf00" d="M0 4h24v8H0z"/>
        <path fill="#aa151b" d="M7 6h3v4H7z"/><path fill="#fff" d="M7.7 6.6h1.6v2.5H7.7z"/><path fill="#aa151b" d="M8 5.4h2v.7H8z"/>
      </>}
      {code === "FR" && <><path fill="#002395" d="M0 0h8v16H0z"/><path fill="#fff" d="M8 0h8v16H8z"/><path fill="#ed2939" d="M16 0h8v16h-8z"/></>}
      {code === "IT" && <><path fill="#009246" d="M0 0h8v16H0z"/><path fill="#fff" d="M8 0h8v16H8z"/><path fill="#ce2b37" d="M16 0h8v16h-8z"/></>}
      {code === "CO" && <><path fill="#fcd116" d="M0 0h24v8H0z"/><path fill="#003893" d="M0 8h24v4H0z"/><path fill="#ce1126" d="M0 12h24v4H0z"/></>}
      {code === "EU" && <>
        <path fill="#003399" d="M0 0h24v16H0z"/>
        {Array.from({ length: 12 }, (_, index) => {
          const angle = (index * Math.PI) / 6 - Math.PI / 2;
          const cx = 12 + 4.5 * Math.cos(angle);
          const cy = 8 + 4.5 * Math.sin(angle);
          const points = Array.from({ length: 10 }, (_, point) => {
            const radius = point % 2 === 0 ? .8 : .33;
            const starAngle = point * Math.PI / 5 - Math.PI / 2;
            return `${cx + radius * Math.cos(starAngle)},${cy + radius * Math.sin(starAngle)}`;
          }).join(" ");
          return <polygon key={index} points={points} fill="#ffcc00"/>;
        })}
      </>}
    </svg>
  );
}
