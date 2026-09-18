"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const DISMISSAL_KEY = "northern-direct:install-dismissed";

type InstallChoice = { outcome: "accepted" | "dismissed" };
type BrowserInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice?: Promise<InstallChoice>;
};
type InstallState = "unsupported" | "prompt-available" | "prompting" | "manual-ios" | "installed" | "dismissed";

/** Returns whether the application is already running as an installed app. */
function isStandalone(): boolean {
  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean };
  return navigatorWithStandalone.standalone === true || window.matchMedia?.("(display-mode: standalone)").matches === true;
}

/** Returns whether the browser is Safari on an iOS or iPadOS device. */
function isIOSSafari(): boolean {
  const userAgent = navigator.userAgent;
  const iOSDevice = /iPad|iPhone|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && navigator.maxTouchPoints > 1);
  const SafariEngine = /AppleWebKit/.test(userAgent) && /Safari/.test(userAgent);
  const otherIOSBrowser = /CriOS|FxiOS|EdgiOS|OPiOS|GSA/.test(userAgent);
  return iOSDevice && navigator.vendor === "Apple Computer, Inc." && SafariEngine && !otherIOSBrowser;
}

/**
 * Owns browser-specific progressive web app installation state.
 *
 * Parameters
 * ----------
 * eligible : boolean
 *     Whether the product-level eligibility rule has been reached.
 *
 * Returns
 * -------
 * object
 *     The current installation state and actions for requesting or dismissing it.
 */
function useInstallLifecycle(eligible: boolean) {
  const [state, setState] = useState<InstallState>("unsupported");
  const [ready, setReady] = useState(false);
  const [promptEvent, setPromptEvent] = useState<BrowserInstallPromptEvent | null>(null);
  const mounted = useRef(true);

  const dismiss = useCallback(() => {
    setPromptEvent(null);
    setState("dismissed");
    try {
      window.sessionStorage.setItem(DISMISSAL_KEY, "1");
    } catch {
      // Session storage can be disabled; the current page still respects dismissal.
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    const initialize = window.setTimeout(() => {
      let dismissed = false;
      try {
        dismissed = window.sessionStorage.getItem(DISMISSAL_KEY) === "1";
      } catch {
        // Session storage is optional, so an unavailable store must not block the UI.
      }
      if (dismissed) {
        setPromptEvent(null);
        setState("dismissed");
      } else {
        setState((current) => {
          if (current === "prompt-available" || current === "installed" || current === "dismissed") return current;
          if (isStandalone()) return "installed";
          return isIOSSafari() ? "manual-ios" : "unsupported";
        });
      }
      setReady(true);
    }, 0);
    return () => {
      mounted.current = false;
      window.clearTimeout(initialize);
    };
  }, []);

  useEffect(() => {
    const standaloneQuery = window.matchMedia?.("(display-mode: standalone)");
    const markInstalled = () => {
      setPromptEvent(null);
      setState("installed");
    };
    const handleDisplayModeChange = (event: MediaQueryListEvent) => {
      if (event.matches) markInstalled();
    };
    const capturePrompt = (event: Event) => {
      event.preventDefault();
      if (isStandalone()) {
        markInstalled();
        return;
      }
      setPromptEvent(event as BrowserInstallPromptEvent);
      setState((current) => current === "dismissed" || current === "installed" ? current : "prompt-available");
    };
    window.addEventListener("beforeinstallprompt", capturePrompt);
    window.addEventListener("appinstalled", markInstalled);
    if (standaloneQuery?.addEventListener) standaloneQuery.addEventListener("change", handleDisplayModeChange);
    else standaloneQuery?.addListener?.(handleDisplayModeChange);
    return () => {
      window.removeEventListener("beforeinstallprompt", capturePrompt);
      window.removeEventListener("appinstalled", markInstalled);
      if (standaloneQuery?.removeEventListener) standaloneQuery.removeEventListener("change", handleDisplayModeChange);
      else standaloneQuery?.removeListener?.(handleDisplayModeChange);
    };
  }, []);

  const requestInstall = useCallback(async () => {
    if (!promptEvent || state !== "prompt-available") return;
    const capturedEvent = promptEvent;
    // The browser event can only be used once, so remove its UI route before awaiting it.
    setPromptEvent(null);
    setState("prompting");
    try {
      await capturedEvent.prompt();
      const choice = await capturedEvent.userChoice;
      if (!mounted.current) return;
      if (choice?.outcome === "accepted") setState("installed");
      else dismiss();
    } catch {
      if (mounted.current) dismiss();
    }
  }, [dismiss, promptEvent, state]);

  return { state, ready, requestInstall, dismiss };
}

/**
 * Displays an accurate, accessible PWA installation route only when the user is eligible.
 *
 * It offers Chromium's captured prompt, conservative Safari-on-iOS instructions, or no
 * installation claim for unsupported browsers. The live TfL data remains online-only.
 *
 * Parameters
 * ----------
 * eligible : boolean
 *     Whether the caller's product-level eligibility rule has been reached.
 *
 * Returns
 * -------
 * React.ReactNode
 *     The installation hint, or `null` when there is no truthful route to install.
 */
export default function InstallHint({ eligible }: { eligible: boolean }) {
  const { state, ready, requestInstall, dismiss } = useInstallLifecycle(eligible);

  if (!eligible || !ready || state === "unsupported" || state === "installed" || state === "dismissed") return null;

  return <aside className="install-hint" aria-label="Install Northern Direct">
    {state === "manual-ios" ? <p>In Safari, tap Share, then Add to Home Screen.</p> : <p>Add Northern Direct to your home screen for quicker access.</p>}
    {state === "prompt-available" && <button onClick={() => void requestInstall()}>Install</button>}
    {state === "prompting" && <button disabled aria-busy="true">Installing…</button>}
    <button onClick={dismiss}>Dismiss</button>
  </aside>;
}
