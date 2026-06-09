import { useRef } from "react";

/** Returns true only on the component's first mount (first render cycle). */
export function useFirstMount(): boolean {
  const ref = useRef(true);
  if (ref.current) {
    ref.current = false;
    return true;
  }
  return false;
}
