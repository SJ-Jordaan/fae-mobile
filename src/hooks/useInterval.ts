import React from 'react';

export const useInterval = (callback: () => void, delay: number | null) => {
  const intervalRef = React.useRef(0);
  const callbackRef = React.useRef(callback);

  React.useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  React.useEffect(() => {
    if (typeof delay === 'number') {
      intervalRef.current = window.setInterval(
        () => callbackRef.current(),
        delay,
      );

      return () => window.clearInterval(intervalRef.current);
    }
  }, [delay]);

  return intervalRef;
};
