import { useEffect, useRef, useState } from 'react';
import { animate, useReducedMotion } from 'motion/react';
import { formatINR } from '@/lib/format';

interface AnimatedNumberProps {
  value: number;
  format?: (value: number) => string;
  className?: string;
}

/** Counts up to `value`. Jumps instantly when the user prefers reduced motion. */
export function AnimatedNumber({ value, format = formatINR, className }: AnimatedNumberProps) {
  const reduce = useReducedMotion();
  const [display, setDisplay] = useState(() => format(reduce ? value : 0));
  const previous = useRef(0);

  useEffect(() => {
    if (reduce) {
      setDisplay(format(value));
      previous.current = value;
      return;
    }
    const controls = animate(previous.current, value, {
      duration: 0.6,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (latest) => setDisplay(format(latest)),
    });
    previous.current = value;
    return () => controls.stop();
    // `format` is a stable module-level function in practice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, reduce, format]);

  return <span className={className}>{display}</span>;
}
