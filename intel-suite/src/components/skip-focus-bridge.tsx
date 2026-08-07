import { useEffect } from "react";

const MAIN_CONTENT_ID = "portal-main-content";

export function SkipFocusBridge() {
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const link = target.closest<HTMLAnchorElement>(
        `a[href="#${MAIN_CONTENT_ID}"]`,
      );
      if (!link) return;

      const main = document.getElementById(MAIN_CONTENT_ID);
      if (!main) return;

      event.preventDefault();
      main.focus({ preventScroll: true });
      main.scrollIntoView({ block: "start", behavior: "auto" });
      if (window.location.hash !== `#${MAIN_CONTENT_ID}`) {
        window.history.replaceState(
          window.history.state,
          "",
          `${window.location.pathname}${window.location.search}#${MAIN_CONTENT_ID}`,
        );
      }
    };

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  return null;
}
