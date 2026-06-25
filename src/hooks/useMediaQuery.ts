import { useEffect, useState } from "react";

/**
 * Subscribe to a CSS media query. The initial value is read synchronously from
 * `matchMedia` so the first render already reflects the real viewport — no flash
 * of the wrong layout (important for the nav rail ↔ bottom-bar swap).
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

/**
 * True on compact viewports (below Tailwind's `lg`, i.e. < 1024px). Drives the
 * switch from the desktop left rail to the touch-first bottom navigation.
 */
export function useIsNarrow(): boolean {
  return useMediaQuery("(max-width: 1023px)");
}
