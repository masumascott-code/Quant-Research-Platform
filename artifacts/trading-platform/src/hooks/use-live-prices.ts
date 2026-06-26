import { useEffect, useRef, useState } from "react";

export interface PriceUpdate {
  symbol: string;
  price: number;
  timestamp: number;
}

/** Polls /api/live/prices every 2 seconds and returns a map of { SYMBOL -> PriceUpdate }.
 *  Uses a ref-based interval so it never stacks, and bails out on unmount. */
export function useLivePrices() {
  const [prices, setPrices] = useState<Record<string, PriceUpdate>>({});
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let unmounted = false;

    async function poll() {
      if (unmounted) return;
      abortRef.current = new AbortController();
      try {
        const res = await fetch("/api/live/prices", { signal: abortRef.current.signal });
        if (!unmounted && res.ok) {
          const data: Record<string, PriceUpdate> = await res.json();
          if (Object.keys(data).length > 0) {
            setPrices(data);
          }
        }
      } catch (_) {
        // fetch aborted or network error — just retry
      }
      if (!unmounted) {
        timerRef.current = setTimeout(poll, 2_000);
      }
    }

    poll();

    return () => {
      unmounted = true;
      abortRef.current?.abort();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return prices;
}
