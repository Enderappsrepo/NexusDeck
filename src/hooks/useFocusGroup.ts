import { useEffect, useRef } from "react";

/**
 * Registers a focus group container. Focus navigation respects group bounds
 * when moving with arrow keys within the same group.
 */
export function useFocusGroup(groupId: string) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.setAttribute("data-focus-group", groupId);
    return () => el.removeAttribute("data-focus-group");
  }, [groupId]);

  return ref;
}
