import { useEffect, useState } from "react";

/**
 * Returns `value` after it has stayed unchanged for `delay` ms.
 * Useful for live search inputs so we don't hit the server on every keystroke.
 */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}
