import { useEffect, useRef, useState, useCallback } from "react";

interface UsePullToRefreshOptions {
  onRefresh: () => Promise<void> | void;
  threshold?: number; // px to pull before triggering refresh
  containerRef?: React.RefObject<HTMLElement | null>;
}

interface PullToRefreshState {
  pulling: boolean;
  refreshing: boolean;
  pullDistance: number; // 0..threshold
}

/**
 * Attaches touch-based pull-to-refresh to a scrollable container.
 * Returns state so the caller can render a visual indicator.
 */
export function usePullToRefresh({
  onRefresh,
  threshold = 72,
  containerRef,
}: UsePullToRefreshOptions): PullToRefreshState {
  const [state, setState] = useState<PullToRefreshState>({
    pulling: false,
    refreshing: false,
    pullDistance: 0,
  });

  const startY = useRef(0);
  const currentY = useRef(0);
  const isPulling = useRef(false);

  const getTarget = useCallback((): EventTarget => {
    return containerRef?.current ?? window;
  }, [containerRef]);

  useEffect(() => {
    const target = getTarget();

    const onTouchStart = (e: Event) => {
      const te = e as TouchEvent;
      // Only start pull-to-refresh when scrolled to the very top
      const scrollTop =
        containerRef?.current
          ? containerRef.current.scrollTop
          : document.documentElement.scrollTop || document.body.scrollTop;
      if (scrollTop > 0) return;
      startY.current = te.touches[0].clientY;
      isPulling.current = true;
    };

    const onTouchMove = (e: Event) => {
      if (!isPulling.current) return;
      const te = e as TouchEvent;
      currentY.current = te.touches[0].clientY;
      const delta = Math.max(0, currentY.current - startY.current);
      if (delta > 0) {
        // Dampen the pull distance with a rubber-band effect
        const dampened = Math.min(threshold, delta * 0.5);
        setState(s => ({ ...s, pulling: true, pullDistance: dampened }));
      }
    };

    const onTouchEnd = async () => {
      if (!isPulling.current) return;
      isPulling.current = false;
      const delta = Math.max(0, currentY.current - startY.current);
      if (delta * 0.5 >= threshold) {
        setState({ pulling: false, refreshing: true, pullDistance: threshold });
        try {
          await onRefresh();
        } finally {
          setState({ pulling: false, refreshing: false, pullDistance: 0 });
        }
      } else {
        setState({ pulling: false, refreshing: false, pullDistance: 0 });
      }
      startY.current = 0;
      currentY.current = 0;
    };

    target.addEventListener("touchstart", onTouchStart, { passive: true });
    target.addEventListener("touchmove", onTouchMove, { passive: true });
    target.addEventListener("touchend", onTouchEnd);

    return () => {
      target.removeEventListener("touchstart", onTouchStart);
      target.removeEventListener("touchmove", onTouchMove);
      target.removeEventListener("touchend", onTouchEnd);
    };
  }, [onRefresh, threshold, getTarget, containerRef]);

  return state;
}
