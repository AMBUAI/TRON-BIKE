import React, { useCallback, useEffect, useState } from 'react';
import { Maximize2, RotateCw } from 'lucide-react';

export function isFullscreenActive(): boolean {
  if (typeof document === 'undefined') return false;
  const doc = document as Document & {
    webkitFullscreenElement?: Element | null;
  };
  return Boolean(document.fullscreenElement || doc.webkitFullscreenElement);
}

export function isTouchMobileDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(pointer: coarse)').matches ||
    /android|iphone|ipad|ipod/i.test(window.navigator.userAgent)
  );
}

export function tryLockLandscapeOrientation() {
  try {
    const orientation = screen.orientation as ScreenOrientation & {
      lock?: (orientation: string) => Promise<void>;
    };
    if (orientation && typeof orientation.lock === 'function') {
      orientation.lock('landscape').catch(() => {
        // Browsers generally require fullscreen mode for orientation.lock
      });
    }
  } catch {
    // ignore unsupported environments
  }
}

export async function enterFullscreenAndLandscape(): Promise<boolean> {
  try {
    const el = document.documentElement as HTMLElement & {
      webkitRequestFullscreen?: () => Promise<void> | void;
      msRequestFullscreen?: () => Promise<void> | void;
    };
    if (!isFullscreenActive()) {
      if (typeof el.requestFullscreen === 'function') {
        await el.requestFullscreen({ navigationUI: 'hide' }).catch(async () => {
          await el.requestFullscreen();
        });
      } else if (typeof el.webkitRequestFullscreen === 'function') {
        await Promise.resolve(el.webkitRequestFullscreen());
      } else if (typeof el.msRequestFullscreen === 'function') {
        await Promise.resolve(el.msRequestFullscreen());
      }
    }
  } catch {
    // Fullscreen blocked or unsupported in this browser context
  }
  tryLockLandscapeOrientation();
  return isFullscreenActive();
}

export async function toggleFullscreenLandscape(): Promise<boolean> {
  if (isFullscreenActive()) {
    try {
      const doc = document as Document & {
        webkitExitFullscreen?: () => Promise<void> | void;
      };
      if (typeof document.exitFullscreen === 'function') {
        await document.exitFullscreen();
      } else if (typeof doc.webkitExitFullscreen === 'function') {
        await Promise.resolve(doc.webkitExitFullscreen());
      }
    } catch {
      // ignore
    }
    return false;
  }
  return enterFullscreenAndLandscape();
}

export function useFullscreenState() {
  const [isFullscreen, setIsFullscreen] = useState(() => isFullscreenActive());

  useEffect(() => {
    const sync = () => setIsFullscreen(isFullscreenActive());
    document.addEventListener('fullscreenchange', sync);
    document.addEventListener('webkitfullscreenchange', sync);
    return () => {
      document.removeEventListener('fullscreenchange', sync);
      document.removeEventListener('webkitfullscreenchange', sync);
    };
  }, []);

  const toggle = useCallback(() => {
    void toggleFullscreenLandscape();
  }, []);

  return { isFullscreen, toggle };
}

export const PortraitLockOverlay: React.FC = () => {
  const [isPortrait, setIsPortrait] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerHeight > window.innerWidth;
  });

  useEffect(() => {
    const check = () => {
      const vw = window.visualViewport?.width ?? window.innerWidth;
      const vh = window.visualViewport?.height ?? window.innerHeight;
      setIsPortrait(vh > vw);
      if (vw >= vh) {
        tryLockLandscapeOrientation();
      }
    };
    check();
    window.addEventListener('resize', check);
    window.addEventListener('orientationchange', check);
    window.visualViewport?.addEventListener('resize', check);
    screen.orientation?.addEventListener?.('change', check);
    return () => {
      window.removeEventListener('resize', check);
      window.removeEventListener('orientationchange', check);
      window.visualViewport?.removeEventListener('resize', check);
      screen.orientation?.removeEventListener?.('change', check);
    };
  }, []);

  if (!isPortrait) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#04060D] px-6 py-4 text-center"
      role="alert"
      aria-live="assertive"
    >
      <div className="w-16 h-16 rounded-2xl border border-cyan-400/50 bg-cyan-500/10 flex items-center justify-center mb-4">
        <RotateCw className="w-8 h-8 text-cyan-300" />
      </div>
      <h1 className="font-display text-xl sm:text-2xl font-bold tracking-wide text-white text-balance">
        Rotate Your Phone to Landscape
      </h1>
      <p className="mt-2.5 max-w-xs text-sm text-slate-300 leading-relaxed">
        TRON BIKE is built for horizontal landscape play. Turn your phone
        sideways or tap below to enter fullscreen landscape mode.
      </p>
      <button
        type="button"
        onClick={() => void enterFullscreenAndLandscape()}
        className="mt-5 min-h-[46px] inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-5 py-2.5 text-sm font-bold text-slate-950 hover:bg-cyan-400 transition"
      >
        <Maximize2 className="w-4 h-4" />
        <span>Fullscreen &amp; Lock Landscape</span>
      </button>
    </div>
  );
};
