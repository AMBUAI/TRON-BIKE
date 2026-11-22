import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  Eye,
  Maximize2,
  Minimize2,
  Navigation,
} from 'lucide-react';
import type { DeathAnnouncement, RoomStateSnapshot } from '../../shared/types';
import type { CameraMode } from '../game/TronEngine';
import { useFullscreenState } from './PortraitLockOverlay';

interface GameplayHUDProps {
  room: RoomStateSnapshot;
  myPlayerId: string;
  cameraMode: CameraMode;
  announcement: DeathAnnouncement | null;
  onToggleCamera: () => void;
  onTurn: (dir: 'left' | 'right') => void;
  onSpectatorLook: (dyaw: number, dpitch: number) => void;
  onSpectatorMove: (fwd: number, strafe: number, vertical: number) => void;
  onSpectatorJumpNext: () => void;
}

export const GameplayHUD: React.FC<GameplayHUDProps> = ({
  room,
  myPlayerId,
  cameraMode,
  announcement,
  onToggleCamera,
  onTurn,
  onSpectatorLook,
  onSpectatorMove,
  onSpectatorJumpNext,
}) => {
  const { isFullscreen, toggle: toggleFullscreen } = useFullscreenState();
  const myBike = room.bikes.find((b) => b.playerId === myPlayerId);
  const isAlive = Boolean(myBike?.alive);
  const isPlaying = room.phase === 'playing';
  const isCountdown = room.phase === 'countdown';
  const isVictory = room.phase === 'victory_stunt';
  const isSpectator = isPlaying && myBike && !myBike.alive;

  // Touch Swipe Tracking for Bike Steering
  const swipeState = useRef<{
    active: boolean;
    anchorX: number;
    anchorY: number;
    turnedThisTouch: boolean;
  }>({
    active: false,
    anchorX: 0,
    anchorY: 0,
    turnedThisTouch: false,
  });

  // Spectator Drag-to-Look Tracking
  const specDrag = useRef<{
    active: boolean;
    lastX: number;
    lastY: number;
  }>({ active: false, lastX: 0, lastY: 0 });

  const [specPad, setSpecPad] = useState({ fwd: 0, strafe: 0, vert: 0 });

  useEffect(() => {
    if (isSpectator) {
      onSpectatorMove(specPad.fwd, specPad.strafe, specPad.vert);
    } else {
      onSpectatorMove(0, 0, 0);
    }
  }, [isSpectator, specPad, onSpectatorMove]);

  // Keyboard shortcuts for accessibility / desktop testing
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isPlaying && isAlive) {
        if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
          e.preventDefault();
          onTurn('left');
        } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
          e.preventDefault();
          onTurn('right');
        }
      }
      if ((isPlaying || isCountdown) && (e.key === 'c' || e.key === 'C' || e.key === 'v' || e.key === 'V')) {
        onToggleCamera();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isPlaying, isCountdown, isAlive, onTurn, onToggleCamera]);

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 0) return;
    const t = e.touches[0];
    if (isPlaying && isAlive) {
      swipeState.current = {
        active: true,
        anchorX: t.clientX,
        anchorY: t.clientY,
        turnedThisTouch: false,
      };
    } else if (isSpectator) {
      specDrag.current = {
        active: true,
        lastX: t.clientX,
        lastY: t.clientY,
      };
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 0) return;
    const t = e.touches[0];

    if (isPlaying && isAlive && swipeState.current.active) {
      const dx = t.clientX - swipeState.current.anchorX;
      const dy = t.clientY - swipeState.current.anchorY;
      const threshold = swipeState.current.turnedThisTouch ? 42 : 24;

      if (Math.abs(dx) >= threshold && Math.abs(dx) > Math.abs(dy) * 0.75) {
        onTurn(dx < 0 ? 'left' : 'right');
        swipeState.current.anchorX = t.clientX;
        swipeState.current.anchorY = t.clientY;
        swipeState.current.turnedThisTouch = true;
      }
    } else if (isSpectator && specDrag.current.active) {
      const dx = t.clientX - specDrag.current.lastX;
      const dy = t.clientY - specDrag.current.lastY;
      specDrag.current.lastX = t.clientX;
      specDrag.current.lastY = t.clientY;
      onSpectatorLook(-dx * 0.0055, -dy * 0.0045);
    }
  };

  const handleTouchEnd = () => {
    swipeState.current.active = false;
    specDrag.current.active = false;
  };

  // Pointer drag support for non-touch testing
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'touch') return;
    if (isPlaying && isAlive) {
      swipeState.current = {
        active: true,
        anchorX: e.clientX,
        anchorY: e.clientY,
        turnedThisTouch: false,
      };
    } else if (isSpectator) {
      specDrag.current = { active: true, lastX: e.clientX, lastY: e.clientY };
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'touch') return;
    if (isPlaying && isAlive && swipeState.current.active) {
      const dx = e.clientX - swipeState.current.anchorX;
      const dy = e.clientY - swipeState.current.anchorY;
      const threshold = swipeState.current.turnedThisTouch ? 44 : 26;
      if (Math.abs(dx) >= threshold && Math.abs(dx) > Math.abs(dy) * 0.75) {
        onTurn(dx < 0 ? 'left' : 'right');
        swipeState.current.anchorX = e.clientX;
        swipeState.current.anchorY = e.clientY;
        swipeState.current.turnedThisTouch = true;
      }
    } else if (isSpectator && specDrag.current.active) {
      const dx = e.clientX - specDrag.current.lastX;
      const dy = e.clientY - specDrag.current.lastY;
      specDrag.current.lastX = e.clientX;
      specDrag.current.lastY = e.clientY;
      onSpectatorLook(-dx * 0.0055, -dy * 0.0045);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'touch') return;
    swipeState.current.active = false;
    specDrag.current.active = false;
  };

  const winnerBike = room.results?.winnerId
    ? room.bikes.find((b) => b.playerId === room.results?.winnerId)
    : null;

  return (
    <div
      className="fixed inset-0 z-20 select-none touch-none"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {/* Top-Left Compact Alive Roster (safe-area aware for landscape notches) */}
      <div className="pointer-events-none absolute top-[max(0.5rem,env(safe-area-inset-top))] left-[max(0.6rem,env(safe-area-inset-left))] flex flex-col gap-1">
        <div className="inline-flex items-center gap-1.5 self-start rounded-lg border border-white/15 bg-[#060B16]/85 px-2.5 py-1 text-[11px] sm:text-xs font-bold text-white">
          <span className="font-mono-tabular text-cyan-300">
            {room.aliveCount}/{room.bikes.length}
          </span>
          <span>ALIVE</span>
        </div>

        <div className="flex flex-wrap gap-1 max-w-[230px] sm:max-w-md">
          {room.bikes.map((b) => (
            <div
              key={b.playerId}
              className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] sm:text-[11px] font-semibold ${
                b.alive
                  ? 'border-white/15 bg-[#060B16]/80 text-white'
                  : 'border-white/5 bg-[#060B16]/50 text-slate-500 line-through'
              }`}
            >
              <span
                className="w-2 h-2 rounded-sm shrink-0"
                style={{
                  backgroundColor: b.color.hex,
                  opacity: b.alive ? 1 : 0.35,
                }}
              />
              <span className="truncate max-w-[64px] sm:max-w-[85px]">{b.username}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Top-Right Camera Switcher & Fullscreen (completely isolated from swipe steering) */}
      {(isPlaying || isCountdown) && isAlive && (
        <div
          className="absolute top-[max(0.5rem,env(safe-area-inset-top))] right-[max(0.6rem,env(safe-area-inset-right))] z-30 pointer-events-auto flex items-center gap-2"
          onTouchStart={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
          onTouchEnd={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggleFullscreen();
            }}
            aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl border border-white/20 bg-[#070D1D]/90 text-slate-200 hover:border-cyan-400/50 active:scale-95 transition"
          >
            {isFullscreen ? (
              <Minimize2 className="w-4 h-4 text-cyan-300" />
            ) : (
              <Maximize2 className="w-4 h-4 text-cyan-300" />
            )}
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleCamera();
            }}
            aria-label="Switch camera view"
            className="min-h-[44px] min-w-[44px] inline-flex items-center gap-2 rounded-xl border border-cyan-400/50 bg-[#070D1D]/90 px-3 py-2 text-xs font-bold text-cyan-200 hover:bg-cyan-500/20 active:scale-95 transition"
          >
            <Eye className="w-5 h-5 text-cyan-300 shrink-0" />
            <span className="hidden md:inline font-display">
              {cameraMode === 'first' ? '1ST PERSON' : '3RD PERSON'}
            </span>
          </button>
        </div>
      )}

      {/* Top-Center Live Death Announcement Banner */}
      {announcement && (
        <div className="pointer-events-none absolute top-[max(0.65rem,env(safe-area-inset-top))] left-1/2 -translate-x-1/2 z-30 w-[86%] max-w-md text-center">
          {announcement.type === 'simultaneous' ? (
            <div className="rounded-xl border-2 border-pink-500 bg-[#1B0617]/95 px-4 py-2.5 shadow-lg">
              <div className="font-display text-sm sm:text-xl font-black tracking-wider text-pink-300">
                THEY KISSED THEIR DEATH
              </div>
              {announcement.subline && (
                <div className="mt-1 font-display text-xs sm:text-sm font-bold text-white">
                  {announcement.subline}
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-rose-500/60 bg-[#120810]/90 px-3.5 py-1.5">
              <div className="font-display text-xs sm:text-sm font-bold text-white">
                {announcement.headline}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Synchronized Countdown 3 -> 2 -> 1 -> GO! */}
      {isCountdown && room.countdownValue !== null && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-4 text-center">
          <div className="font-display text-6xl sm:text-8xl font-black tracking-widest text-cyan-300 drop-shadow-[0_0_24px_rgba(0,240,255,0.65)]">
            {room.countdownValue > 0 ? room.countdownValue : 'GO!'}
          </div>
          <div className="mt-1.5 text-xs sm:text-sm font-semibold tracking-wide text-slate-200">
            {myBike
              ? `Swipe Left or Right after GO · Color: ${myBike.color.name}`
              : 'Prepare to ride'}
          </div>
        </div>
      )}

      {/* Subtle Swipe Hint during early seconds of playing */}
      {isPlaying && isAlive && (
        <div className="pointer-events-none absolute bottom-[max(0.45rem,env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] sm:text-[11px] font-medium text-slate-300/75 bg-[#060B16]/70 px-2.5 py-1 rounded-md border border-white/10">
          Swipe Left / Right to Steer · Tap Eye Icon for Camera
        </div>
      )}

      {/* Free-Camera Spectator Controls */}
      {isSpectator && (
        <>
          <div className="pointer-events-none absolute top-[max(0.5rem,env(safe-area-inset-top))] right-[max(0.6rem,env(safe-area-inset-right))] rounded-lg border border-amber-400/40 bg-[#140E05]/90 px-3 py-1.5 text-right">
            <div className="font-display text-[11px] sm:text-xs font-bold text-amber-300">
              SPECTATOR MODE
            </div>
            <div className="text-[10px] sm:text-[11px] text-slate-300">
              Drag to look · Free Camera
            </div>
          </div>

          {/* Bottom-left Free Camera Flight Pad */}
          <div
            className="absolute bottom-[max(0.5rem,env(safe-area-inset-bottom))] left-[max(0.6rem,env(safe-area-inset-left))] z-30 pointer-events-auto flex items-end gap-1.5"
            onTouchStart={(e) => e.stopPropagation()}
            onTouchMove={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="grid grid-cols-3 gap-1 bg-[#060B16]/85 p-1 rounded-xl border border-white/15">
              <div />
              <button
                type="button"
                aria-label="Move forward"
                onPointerDown={() => setSpecPad((p) => ({ ...p, fwd: 1 }))}
                onPointerUp={() => setSpecPad((p) => ({ ...p, fwd: 0 }))}
                onPointerLeave={() => setSpecPad((p) => ({ ...p, fwd: 0 }))}
                className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg bg-white/10 text-white active:bg-cyan-500 active:text-slate-950"
              >
                <ArrowUp className="w-4 h-4" />
              </button>
              <div />
              <button
                type="button"
                aria-label="Strafe left"
                onPointerDown={() => setSpecPad((p) => ({ ...p, strafe: -1 }))}
                onPointerUp={() => setSpecPad((p) => ({ ...p, strafe: 0 }))}
                onPointerLeave={() => setSpecPad((p) => ({ ...p, strafe: 0 }))}
                className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg bg-white/10 text-white active:bg-cyan-500 active:text-slate-950"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                aria-label="Move backward"
                onPointerDown={() => setSpecPad((p) => ({ ...p, fwd: -1 }))}
                onPointerUp={() => setSpecPad((p) => ({ ...p, fwd: 0 }))}
                onPointerLeave={() => setSpecPad((p) => ({ ...p, fwd: 0 }))}
                className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg bg-white/10 text-white active:bg-cyan-500 active:text-slate-950"
              >
                <ArrowDown className="w-4 h-4" />
              </button>
              <button
                type="button"
                aria-label="Strafe right"
                onPointerDown={() => setSpecPad((p) => ({ ...p, strafe: 1 }))}
                onPointerUp={() => setSpecPad((p) => ({ ...p, strafe: 0 }))}
                onPointerLeave={() => setSpecPad((p) => ({ ...p, strafe: 0 }))}
                className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg bg-white/10 text-white active:bg-cyan-500 active:text-slate-950"
              >
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-col gap-1 bg-[#060B16]/85 p-1 rounded-xl border border-white/15">
              <button
                type="button"
                aria-label="Fly higher"
                onPointerDown={() => setSpecPad((p) => ({ ...p, vert: 1 }))}
                onPointerUp={() => setSpecPad((p) => ({ ...p, vert: 0 }))}
                onPointerLeave={() => setSpecPad((p) => ({ ...p, vert: 0 }))}
                className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg bg-white/10 text-white active:bg-cyan-500 active:text-slate-950"
              >
                <ChevronUp className="w-4 h-4" />
              </button>
              <button
                type="button"
                aria-label="Fly lower"
                onPointerDown={() => setSpecPad((p) => ({ ...p, vert: -1 }))}
                onPointerUp={() => setSpecPad((p) => ({ ...p, vert: 0 }))}
                onPointerLeave={() => setSpecPad((p) => ({ ...p, vert: 0 }))}
                className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg bg-white/10 text-white active:bg-cyan-500 active:text-slate-950"
              >
                <ChevronDown className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div
            className="absolute bottom-[max(0.5rem,env(safe-area-inset-bottom))] right-[max(0.6rem,env(safe-area-inset-right))] z-30 pointer-events-auto"
            onTouchStart={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={onSpectatorJumpNext}
              className="min-h-[42px] inline-flex items-center gap-2 rounded-xl border border-cyan-400/50 bg-[#070D1D]/90 px-3.5 text-xs font-bold text-cyan-200 hover:bg-cyan-500/20 transition"
            >
              <Navigation className="w-4 h-4" />
              <span>Find Active Rider</span>
            </button>
          </div>
        </>
      )}

      {/* Cinematic Winner Stunt Overlay */}
      {isVictory && room.results && (
        <div className="pointer-events-none absolute top-4 left-1/2 -translate-x-1/2 z-30 text-center w-[92%] max-w-xl">
          <div
            style={{
              borderColor: winnerBike?.color.hex ?? '#00F0FF',
            }}
            className="rounded-xl border-2 bg-[#060B18]/90 px-6 py-3"
          >
            <div className="font-display text-xs sm:text-sm font-bold tracking-[0.2em] text-amber-300">
              LAST SURVIVOR — WINNER
            </div>
            <div className="mt-1 font-display text-2xl sm:text-3xl font-black text-white">
              {room.results.winnerUsername}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
