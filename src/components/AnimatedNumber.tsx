import { useEffect, useRef, useState } from "react";
import { useCountUp } from "../hooks/useCountUp";

interface Props {
  value: number;
  format: (n: number) => string;
  flash?: boolean;
  style?: React.CSSProperties;
}

/** Räknar mjukt upp/ner till nytt värde och blinkar grönt/rött vid förändring. */
export function AnimatedNumber({ value, format, flash = true, style }: Props) {
  const display = useCountUp(value);
  const [flashColor, setFlashColor] = useState<string | null>(null);
  const prev = useRef(value);

  useEffect(() => {
    const d = value - prev.current;
    prev.current = value;
    if (!flash || Math.abs(d) < 0.5) return;
    setFlashColor(d > 0 ? "#7CFFA0" : "#FF9A9A");
    const id = setTimeout(() => setFlashColor(null), 650);
    return () => clearTimeout(id);
  }, [value, flash]);

  return (
    <span style={{ transition: "color 0.35s ease", ...style, ...(flashColor ? { color: flashColor } : {}) }}>
      {format(display)}
    </span>
  );
}
