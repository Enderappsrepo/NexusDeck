import { useCallback, useRef, useState } from "react";

const PULL_THRESHOLD = 72;

export function usePullToRefresh(onRefresh: () => Promise<void>, enabled = true) {
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(0);
  const armed = useRef(false);

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (!enabled || refreshing) return;
      if (window.scrollY > 4) return;
      startY.current = e.touches[0]?.clientY ?? 0;
      armed.current = true;
    },
    [enabled, refreshing]
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!armed.current || refreshing) return;
      const y = e.touches[0]?.clientY ?? 0;
      const delta = Math.max(0, y - startY.current);
      setPullDistance(Math.min(delta, 120));
    },
    [refreshing]
  );

  const onTouchEnd = useCallback(() => {
    if (!armed.current) return;
    armed.current = false;
    if (pullDistance >= PULL_THRESHOLD && !refreshing) {
      setRefreshing(true);
      void onRefresh().finally(() => {
        setRefreshing(false);
        setPullDistance(0);
      });
    } else {
      setPullDistance(0);
    }
  }, [onRefresh, pullDistance, refreshing]);

  return {
    pullDistance,
    refreshing,
    pullProps: enabled
      ? { onTouchStart, onTouchMove, onTouchEnd }
      : ({} as React.HTMLAttributes<HTMLElement>),
  };
}
