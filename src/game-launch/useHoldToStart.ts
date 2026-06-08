import { useCallback, useEffect, useRef, useState } from "react";

const COUNTDOWN_FROM = 3;
const TICK_MS = 1000;

// Hold-to-start: launching requires holding the Start button through a 3..2..1
// countdown so a stray A-press (e.g. from a controller joining the lobby) can't
// accidentally launch. Releasing before zero cancels and resets.
export function useHoldToStart(onComplete: () => void, enabled: boolean) {
  // null = not holding; otherwise the remaining count shown to the user.
  const [count, setCount] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const stop = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setCount(null);
  }, []);

  const start = useCallback(() => {
    if (!enabled || timerRef.current !== null) return;
    setCount(COUNTDOWN_FROM);
    timerRef.current = setInterval(() => {
      setCount((c) => {
        const next = (c ?? COUNTDOWN_FROM) - 1;
        if (next <= 0) {
          if (timerRef.current !== null) {
            clearInterval(timerRef.current);
            timerRef.current = null;
          }
          onCompleteRef.current();
          return null;
        }
        return next;
      });
    }, TICK_MS);
  }, [enabled]);

  // Tidy up if the component unmounts mid-hold.
  useEffect(() => stop, [stop]);

  return { count, start, stop };
}
