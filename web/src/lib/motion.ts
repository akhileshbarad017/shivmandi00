import type { Transition, Variants } from 'motion/react';

export const EASE = [0.22, 1, 0.36, 1] as const;
export const DUR = 0.22;

export const baseTransition: Transition = { duration: DUR, ease: EASE };

/** Routed page: subtle fade + rise. */
export const pageVariants: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: baseTransition },
  exit: { opacity: 0, y: -6, transition: { duration: 0.15, ease: EASE } },
};

/** Parent that cascades its children in. */
export const listContainer: Variants = {
  initial: {},
  animate: { transition: { staggerChildren: 0.04, delayChildren: 0.02 } },
};

/** Child item inside a `listContainer`. */
export const listItem: Variants = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.2, ease: EASE } },
};

/** Dialogs / popovers. */
export const popIn: Variants = {
  initial: { opacity: 0, y: 20, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.2, ease: EASE } },
  exit: { opacity: 0, y: 14, scale: 0.98, transition: { duration: 0.15, ease: EASE } },
};

export const stagger = (index: number, step = 0.04) => ({
  delay: Math.min(index, 10) * step,
});
