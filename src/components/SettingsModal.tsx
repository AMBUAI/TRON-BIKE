import React from 'react';
import {
  BookOpen,
  Eye,
  Maximize2,
  Minimize2,
  Music,
  SlidersHorizontal,
  Volume2,
  X,
} from 'lucide-react';
import type { AudioSettings } from '../../shared/types';
import { useFullscreenState } from './PortraitLockOverlay';

interface SettingsModalProps {
  settings: AudioSettings;
  onChange: (next: AudioSettings) => void;
  onOpenRuleBook: () => void;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  settings,
  onChange,
  onOpenRuleBook,
  onClose,
}) => {
  const { isFullscreen, toggle: toggleFullscreen } = useFullscreenState();

  return (
    <div className="fixed inset-0 h-[100dvh] z-50 flex items-center justify-center bg-black/80 p-2 sm:p-4">
      <div className="flex flex-col w-full max-w-2xl max-h-[94dvh] rounded-xl border border-cyan-500/35 bg-[#080D1B] text-slate-100">
        <div className="flex items-center justify-between gap-4 px-4 py-2.5 sm:px-5 sm:py-3 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-2.5">
            <SlidersHorizontal className="w-5 h-5 text-cyan-400 shrink-0" />
            <h2 className="font-display text-base sm:text-lg font-bold tracking-wide text-white">
              Settings
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg border border-white/15 text-slate-300 hover:bg-white/10 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scroll p-3.5 sm:p-5 space-y-3.5">
          {/* Audio Toggles */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() =>
                onChange({ ...settings, musicEnabled: !settings.musicEnabled })
              }
              className={`min-h-[48px] flex items-center justify-between px-4 py-2.5 rounded-lg border transition ${
                settings.musicEnabled
                  ? 'border-cyan-400/50 bg-cyan-500/15 text-white'
                  : 'border-white/10 bg-[#0D1528] text-slate-400'
              }`}
            >
              <span className="flex items-center gap-2.5 text-sm font-medium">
                <Music className="w-4 h-4 text-cyan-300" />
                Background Music
              </span>
              <span className="font-mono-tabular text-xs font-bold">
                {settings.musicEnabled ? 'ON' : 'OFF'}
              </span>
            </button>

            <button
              type="button"
              onClick={() =>
                onChange({ ...settings, sfxEnabled: !settings.sfxEnabled })
              }
              className={`min-h-[48px] flex items-center justify-between px-4 py-2.5 rounded-lg border transition ${
                settings.sfxEnabled
                  ? 'border-cyan-400/50 bg-cyan-500/15 text-white'
                  : 'border-white/10 bg-[#0D1528] text-slate-400'
              }`}
            >
              <span className="flex items-center gap-2.5 text-sm font-medium">
                <Volume2 className="w-4 h-4 text-cyan-300" />
                Sound Effects
              </span>
              <span className="font-mono-tabular text-xs font-bold">
                {settings.sfxEnabled ? 'ON' : 'OFF'}
              </span>
            </button>
          </div>

          {/* Volume Sliders */}
          <div className="rounded-lg border border-white/10 bg-[#0D1528] p-4 space-y-3.5">
            <div>
              <div className="flex items-center justify-between text-xs font-medium text-slate-300 mb-1.5">
                <span>Master Volume</span>
                <span className="font-mono-tabular text-cyan-300">
                  {Math.round(settings.masterVolume * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(settings.masterVolume * 100)}
                onChange={(e) =>
                  onChange({
                    ...settings,
                    masterVolume: Number(e.target.value) / 100,
                  })
                }
                className="w-full accent-cyan-400 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex items-center justify-between text-xs font-medium text-slate-300 mb-1.5">
                <span>Music Volume</span>
                <span className="font-mono-tabular text-cyan-300">
                  {Math.round(settings.musicVolume * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(settings.musicVolume * 100)}
                onChange={(e) =>
                  onChange({
                    ...settings,
                    musicVolume: Number(e.target.value) / 100,
                  })
                }
                className="w-full accent-cyan-400 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex items-center justify-between text-xs font-medium text-slate-300 mb-1.5">
                <span>Sound Effects Volume</span>
                <span className="font-mono-tabular text-cyan-300">
                  {Math.round(settings.sfxVolume * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(settings.sfxVolume * 100)}
                onChange={(e) =>
                  onChange({
                    ...settings,
                    sfxVolume: Number(e.target.value) / 100,
                  })
                }
                className="w-full accent-cyan-400 cursor-pointer"
              />
            </div>
          </div>

          {/* Default Camera Preference */}
          <div className="rounded-lg border border-white/10 bg-[#0D1528] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <Eye className="w-4 h-4 text-cyan-300 shrink-0" />
              <div>
                <div className="text-sm font-medium text-white">
                  Default Camera View
                </div>
                <div className="text-xs text-slate-400">
                  Switch anytime in-match using the Eye icon
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1 p-1 rounded-lg bg-[#050812] border border-white/10 shrink-0">
              <button
                type="button"
                onClick={() =>
                  onChange({ ...settings, defaultCamera: 'third' })
                }
                className={`min-h-[38px] px-3 py-1.5 rounded-md text-xs font-semibold transition whitespace-nowrap ${
                  settings.defaultCamera === 'third'
                    ? 'bg-cyan-500 text-slate-950'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Third-Person
              </button>
              <button
                type="button"
                onClick={() =>
                  onChange({ ...settings, defaultCamera: 'first' })
                }
                className={`min-h-[38px] px-3 py-1.5 rounded-md text-xs font-semibold transition whitespace-nowrap ${
                  settings.defaultCamera === 'first'
                    ? 'bg-cyan-500 text-slate-950'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                First-Person
              </button>
            </div>
          </div>

          {/* Rule Book & Full Screen */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1">
            <button
              type="button"
              onClick={onOpenRuleBook}
              className="min-h-[44px] inline-flex items-center gap-2 rounded-lg border border-white/15 bg-[#0D1528] px-4 py-2 text-xs sm:text-sm font-semibold text-white hover:bg-white/10 transition"
            >
              <BookOpen className="w-4 h-4 text-cyan-400" />
              <span>Rule Book</span>
            </button>

            <button
              type="button"
              onClick={toggleFullscreen}
              className="min-h-[44px] inline-flex items-center justify-center gap-2 rounded-lg border border-cyan-400/50 bg-cyan-500/15 px-4 py-2 text-xs sm:text-sm font-semibold text-cyan-200 hover:bg-cyan-500/25 active:scale-[0.98] transition whitespace-nowrap shrink-0"
            >
              {isFullscreen ? (
                <Minimize2 className="w-4 h-4 text-cyan-300 shrink-0" />
              ) : (
                <Maximize2 className="w-4 h-4 text-cyan-300 shrink-0" />
              )}
              <span>{isFullscreen ? 'Exit Full Screen' : 'Full Screen'}</span>
            </button>
          </div>
        </div>

        <div className="px-4 py-2.5 sm:px-5 sm:py-3 border-t border-white/10 flex items-center justify-between gap-3 shrink-0">
          <span className="font-display text-[10px] sm:text-xs tracking-wider text-slate-400">
            Developed by <span className="text-cyan-300 font-bold">PRAKALP STUDIOS</span>
          </span>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] px-6 rounded-lg bg-cyan-500 text-slate-950 font-semibold text-sm hover:bg-cyan-400 transition shrink-0"
          >
            Return to Menu
          </button>
        </div>
      </div>
    </div>
  );
};
