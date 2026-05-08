import { useEffect, useRef, useState } from 'react';

/**
 * Returns a ref + boolean that flips to true once the element scrolls within
 * `rootMargin` of the viewport. Once flipped, stays true (one-shot) so heavy
 * children (e.g. <video preload="metadata">) only mount when actually needed.
 */
export function useInView<T extends HTMLElement = HTMLDivElement>(
  rootMargin = '300px',
): [React.RefObject<T>, boolean] {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || inView) return;
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setInView(true);
            io.disconnect();
            break;
          }
        }
      },
      { rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [inView, rootMargin]);

  return [ref, inView];
}
