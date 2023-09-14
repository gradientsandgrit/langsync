import {
  PropsWithChildren,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

function random(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function range(count: number) {
  return Array.from({ length: count }, (_, i) => i);
}

const DEFAULT_COLOR = "#FFC700";

const maxDistance = 80; // usually 100

const generateSparkle = (color: string) => {
  const sparkle = {
    id: String(random(10000, 99999)),
    createdAt: Date.now(),
    color,
    size: random(10, 20),
    style: {
      top: random(0, maxDistance) + "%",
      left: random(0, maxDistance) + "%",
    },
  };
  return sparkle;
};

const QUERY = "(prefers-reduced-motion: no-preference)";
const isRenderingOnServer = typeof window === "undefined";
const getInitialState = () => {
  // For our initial server render, we won't know if the user
  // prefers reduced motion, but it doesn't matter. This value
  // will be overwritten on the client, before any animations
  // occur.
  return isRenderingOnServer ? true : !window.matchMedia(QUERY).matches;
};
function usePrefersReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] =
    useState(getInitialState);
  useEffect(() => {
    const mediaQueryList = window.matchMedia(QUERY);
    const listener = (event: MediaQueryListEvent) => {
      setPrefersReducedMotion(!event.matches);
    };
    if (mediaQueryList.addEventListener) {
      mediaQueryList.addEventListener("change", listener);
    } else {
      mediaQueryList.addListener(listener);
    }
    return () => {
      if (mediaQueryList.removeEventListener) {
        mediaQueryList.removeEventListener("change", listener);
      } else {
        mediaQueryList.removeListener(listener);
      }
    };
  }, []);
  return prefersReducedMotion;
}

const useRandomInterval = (
  callback: () => void,
  minDelay?: number | null,
  maxDelay?: number | null,
) => {
  const timeoutId = useRef<number | null>(null);
  const savedCallback = useRef<() => void | null>(callback);
  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);
  useEffect(() => {
    let isEnabled =
      typeof minDelay === "number" && typeof maxDelay === "number";
    if (isEnabled) {
      const handleTick = () => {
        const nextTickAt = random(minDelay || 0, maxDelay || 0);
        timeoutId.current = window.setTimeout(() => {
          savedCallback.current();
          handleTick();
        }, nextTickAt);
      };
      handleTick();
    }
    return () => {
      if (timeoutId.current) {
        window.clearTimeout(timeoutId.current);
      }
    };
  }, [minDelay, maxDelay]);
  const cancel = useCallback(function () {
    if (timeoutId.current) {
      window.clearTimeout(timeoutId.current);
    }
  }, []);
  return cancel;
};

export const Sparkles = ({
  color = DEFAULT_COLOR,
  children,
  ...delegated
}: PropsWithChildren<{
  color?: string;
}>) => {
  const [sparkles, setSparkles] = useState(() => {
    return range(3).map(() => generateSparkle(color));
  });
  const prefersReducedMotion = usePrefersReducedMotion();
  useRandomInterval(
    () => {
      const sparkle = generateSparkle(color);
      const now = Date.now();
      const nextSparkles = sparkles.filter((sp) => {
        const delta = now - sp.createdAt;
        return delta < 750;
      });
      nextSparkles.push(sparkle);
      setSparkles(nextSparkles);
    },
    prefersReducedMotion ? null : 50,
    prefersReducedMotion ? null : 450,
  );
  return (
    <>
      <div className={"inline-block relative"} {...delegated}>
        {sparkles.map((sparkle) => (
          <Sparkle
            key={sparkle.id}
            color={sparkle.color}
            size={sparkle.size}
            style={sparkle.style}
          />
        ))}
        <div className={"relative z-[1] font-bold"}>{children}</div>
      </div>
    </>
  );
};

const Sparkle = ({
  size,
  color,
  style,
}: {
  size: number;
  color: string;
  style: any;
}) => {
  const animations = `
        @keyframes sparklesComeInOut {
          0% {
            transform: scale(0);
          }
          50% {
            transform: scale(1);
          }
          100% {
            transform: scale(0);
          }
        }
        
        @keyframes sparklesSpin {
          0% {
            transform: rotate(0deg);
          }
          100% {
            transform: rotate(180deg);
          }
        }
                      
        div.sparklewrapper {
          @media (prefers-reduced-motion: no-preference) {
            animation: sparklesComeInOut 700ms forwards;
          }
        }

        svg.sparklesvg {
          display: block;
          @media (prefers-reduced-motion: no-preference) {
            animation: sparklesSpin 1000ms linear;
          }
        }
      `;

  const path =
    "M26.5 25.5C19.0043 33.3697 0 34 0 34C0 34 19.1013 35.3684 26.5 43.5C33.234 50.901 34 68 34 68C34 68 36.9884 50.7065 44.5 43.5C51.6431 36.647 68 34 68 34C68 34 51.6947 32.0939 44.5 25.5C36.5605 18.2235 34 0 34 0C34 0 33.6591 17.9837 26.5 25.5Z";
  return (
    <>
      <style jsx>{animations}</style>
      <div className={"sparklewrapper absolute block"} style={style}>
        <svg
          className={"sparklesvg block"}
          width={size}
          height={size}
          viewBox="0 0 68 68"
          fill="none"
        >
          <path d={path} fill={color} />
        </svg>
      </div>
    </>
  );
};
