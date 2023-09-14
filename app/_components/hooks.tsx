import { DependencyList, useEffect, useRef, useState } from "react";

// Only changes every <delay> ms
export function useDebounce<T>(value: T, delay: number) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timeout);
  }, [value, delay]);
  return debouncedValue;
}

// Only runs every <delay> ms
export function useDelayedEffect(
  callback: () => void,
  delay: number,
  inputs: DependencyList,
) {
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    // Clear the previous timeout whenever the inputs change
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Set a new timeout to trigger the callback after the specified delay
    timeoutRef.current = window.setTimeout(() => {
      callback();
    }, delay);

    // Clean up the timeout when the component unmounts or inputs change again
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, inputs); // Only re-run effect if inputs change

  // This is an empty array because we only want to run this effect once
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  // This hook doesn't return anything
}
