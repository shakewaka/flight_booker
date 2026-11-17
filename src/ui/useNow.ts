import { useEffect, useState } from 'react';

/** 現在時刻（performance.now()）を、一定間隔で更新して返す。 */
export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => performance.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(performance.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);

  return now;
}
