import React, { useState } from 'react';
import {
  Bike,
  Car,
  Check,
  Copy,
  KeyRound,
  Share2,
  UserCheck,
  X,
} from 'lucide-react';
import {
  CHARACTER_OPTIONS,
  NEON_PALETTE,
  type CharacterModelId,
  type PlayerAccount,
  type VehicleType,
} from '../../shared/types';
import { AVATAR_COUNT, AvatarBadge } from './Avatars';
import { ProfilePreviewCanvas } from './ProfilePreviewCanvas';

interface ProfileModalProps {
  account: PlayerAccount;
  onSaveProfile: (
    username: string,
    avatarId: number,
    characterId: CharacterModelId,
    preferredColorId: string,
    vehicleType: VehicleType
  ) => Promise<void>;
  onRecoverAccount: (playerId: string, recoverySecret: string) => Promise<void>;
  onClose: () => void;
}

export const ProfileModal: React.FC<ProfileModalProps> = ({
  account,
  onSaveProfile,
  onRecoverAccount,
  onClose,
}) => {
  const [username, setUsername] = useState(account.username);
  const [avatarId, setAvatarId] = useState(account.avatarId);
  const [characterId, setCharacterId] = useState<CharacterModelId>(
    account.characterId ?? 'tron1'
  );
  const [preferredColorId, setPreferredColorId] = useState(
    account.preferredColorId ?? 'cyan'
  );
  const [vehicleType, setVehicleType] = useState<VehicleType>(
    account.vehicleType ?? 'bike'
  );

  const [saving, setSaving] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [showRestore, setShowRestore] = useState(false);
  const [restoreId, setRestoreId] = useState('');
  const [restoreSecret, setRestoreSecret] = useState('');

  const selectedColor =
    NEON_PALETTE.find((c) => c.id === preferredColorId) ?? NEON_PALETTE[0];

  const handleCopyId = async () => {
    try {
      await navigator.clipboard.writeText(account.id);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 1800);
    } catch {
      setStatusMsg(`Your Player ID: ${account.id}`);
    }
  };

  const handleShareId = async () => {
    const shareText = `Add me on TRON BIKE! My Player ID is ${account.id}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'TRON BIKE Player ID',
          text: shareText,
        });
        return;
      } catch {
        // fallback to copy
      }
    }
    await handleCopyId();
    setStatusMsg('Player ID copied to clipboard for sharing');
  };

  const handleCopyRecovery = async () => {
    const combined = `${account.id}:${account.recoverySecret}`;
    try {
      await navigator.clipboard.writeText(combined);
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 1800);
    } catch {
      setStatusMsg(`Recovery Key: ${combined}`);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setStatusMsg(null);
    setSaving(true);
    try {
      await onSaveProfile(
        username,
        avatarId,
        characterId,
        preferredColorId,
        vehicleType
      );
      setStatusMsg('Profile & loadout saved');
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Failed to update profile'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleRestore = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setStatusMsg(null);
    let pid = restoreId.trim().toUpperCase();
    let sec = restoreSecret.trim();
    if (pid.includes(':') && !sec) {
      const parts = pid.split(':');
      pid = parts[0].trim().toUpperCase();
      sec = parts.slice(1).join(':').trim();
    }
    if (!pid || !sec) {
      setErrorMsg('Enter both your 12-character Player ID and Recovery Key');
      return;
    }
    setSaving(true);
    try {
      await onRecoverAccount(pid, sec);
      setStatusMsg('Account restored successfully');
      setShowRestore(false);
      setRestoreId('');
      setRestoreSecret('');
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Could not restore account'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 h-[100dvh] z-50 flex items-center justify-center bg-black/80 p-2 sm:p-4">
      <div className="flex flex-col w-full max-w-4xl max-h-[94dvh] rounded-xl border border-cyan-500/35 bg-[#080D1B] text-slate-100">
        <div className="flex items-center justify-between gap-4 px-4 py-2.5 sm:px-5 sm:py-3 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-2.5">
            <UserCheck className="w-5 h-5 text-cyan-400 shrink-0" />
            <h2 className="font-display text-base sm:text-lg font-bold tracking-wide text-white">
              Rider Profile
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close profile"
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg border border-white/15 text-slate-300 hover:bg-white/10 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scroll p-3 sm:p-5 grid grid-cols-1 sm:grid-cols-2 gap-3.5 sm:gap-4">
          {/* Left: Live 3D Loadout Preview, Identity & Career Stats */}
          <div className="space-y-4">
            <div className="rounded-lg border border-white/10 bg-[#0D1528] p-3 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-300">
                  Live 3D Loadout Preview
                </span>
                <span
                  className="font-semibold"
                  style={{ color: selectedColor.hex }}
                >
                  {selectedColor.name} ·{' '}
                  {vehicleType === 'car' ? 'Neon Car' : 'Light Cycle'}
                </span>
              </div>
              <ProfilePreviewCanvas
                characterId={characterId}
                colorHex={selectedColor.hex}
                vehicleType={vehicleType}
              />
            </div>

            <div className="rounded-lg border border-white/10 bg-[#0D1528] p-4">
              <div className="flex items-center gap-3.5">
                <AvatarBadge
                  avatarId={avatarId}
                  size={52}
                  borderColor={selectedColor.hex}
                />
                <div className="min-w-0">
                  <div className="text-xs text-slate-400">Unique Player ID</div>
                  <div className="font-mono-tabular text-lg font-bold tracking-wider text-cyan-300 truncate">
                    {account.id}
                  </div>
                </div>
              </div>

              <div className="mt-3.5 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleCopyId()}
                  className="flex-1 min-h-[44px] inline-flex items-center justify-center gap-2 rounded-lg border border-cyan-400/40 bg-cyan-500/15 px-3 py-2 text-xs font-semibold text-cyan-200 hover:bg-cyan-500/25 transition"
                >
                  {copiedId ? (
                    <Check className="w-4 h-4" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                  <span>{copiedId ? 'Copied' : 'Copy ID'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => void handleShareId()}
                  className="flex-1 min-h-[44px] inline-flex items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold text-white hover:bg-white/10 transition"
                >
                  <Share2 className="w-4 h-4" />
                  <span>Share ID</span>
                </button>
              </div>
            </div>

            {/* Career Match Statistics */}
            <div className="rounded-lg border border-white/10 bg-[#0D1528] p-4">
              <div className="text-xs font-semibold text-slate-400 mb-3">
                Match Statistics
              </div>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <div className="font-mono-tabular text-xl font-bold text-white">
                    {account.matchesPlayed}
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">Matches</div>
                </div>
                <div>
                  <div className="font-mono-tabular text-xl font-bold text-cyan-300">
                    {account.matchesWon}
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">Victories</div>
                </div>
                <div>
                  <div className="font-mono-tabular text-xl font-bold text-pink-400">
                    {account.eliminations}
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    Eliminations
                  </div>
                </div>
              </div>
            </div>

            {/* Account Recovery */}
            <div className="rounded-lg border border-white/10 bg-[#0D1528] p-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-xs font-semibold text-slate-300">
                  <KeyRound className="w-4 h-4 text-amber-400" />
                  Account Recovery Key
                </span>
                <button
                  type="button"
                  onClick={() => void handleCopyRecovery()}
                  className="text-xs font-semibold text-cyan-300 hover:text-cyan-200 underline"
                >
                  {copiedKey ? 'Copied Key' : 'Copy Backup Key'}
                </button>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Keep your Recovery Key private to restore this Player ID on
                another device.
              </p>
              <button
                type="button"
                onClick={() => setShowRestore((v) => !v)}
                className="text-xs font-semibold text-amber-300 hover:text-amber-200 underline"
              >
                {showRestore
                  ? 'Cancel Account Restore'
                  : 'Restore Existing Account'}
              </button>

              {showRestore && (
                <form onSubmit={handleRestore} className="pt-2 space-y-2">
                  <input
                    type="text"
                    placeholder="12-char Player ID (or ID:KEY)"
                    value={restoreId}
                    onChange={(e) => setRestoreId(e.target.value)}
                    className="w-full min-h-[42px] rounded-lg border border-white/15 bg-[#060913] px-3 text-base sm:text-xs font-mono-tabular text-white focus:border-cyan-400 outline-none"
                  />
                  <input
                    type="password"
                    placeholder="Recovery Key"
                    value={restoreSecret}
                    onChange={(e) => setRestoreSecret(e.target.value)}
                    className="w-full min-h-[42px] rounded-lg border border-white/15 bg-[#060913] px-3 text-base sm:text-xs font-mono-tabular text-white focus:border-cyan-400 outline-none"
                  />
                  <button
                    type="submit"
                    disabled={saving}
                    className="w-full min-h-[42px] rounded-lg bg-amber-500 text-slate-950 text-xs font-bold hover:bg-amber-400 transition"
                  >
                    Restore Identity
                  </button>
                </form>
              )}
            </div>
          </div>

          {/* Right: Username, Avatar, Character Suit, Color, and Vehicle (beneath Color) */}
          <form
            onSubmit={handleSave}
            className="rounded-lg border border-white/10 bg-[#0D1528] p-4 flex flex-col justify-between space-y-4"
          >
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="rider-username"
                  className="block text-xs font-semibold text-slate-300 mb-1.5"
                >
                  Display Username (2–16 characters)
                </label>
                <input
                  id="rider-username"
                  type="text"
                  maxLength={16}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full min-h-[44px] rounded-lg border border-white/15 bg-[#060913] px-3.5 text-base sm:text-sm font-semibold text-white focus:border-cyan-400 outline-none"
                />
              </div>

              <div>
                <div className="text-xs font-semibold text-slate-300 mb-2">
                  Select Rider Helmet
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {Array.from({ length: AVATAR_COUNT }).map((_, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setAvatarId(idx)}
                      className={`p-1.5 rounded-lg border flex items-center justify-center transition ${
                        avatarId === idx
                          ? 'border-cyan-400 bg-cyan-500/20 scale-[1.03]'
                          : 'border-white/10 bg-[#060913] hover:border-white/30'
                      }`}
                    >
                      <AvatarBadge avatarId={idx} size={48} />
                    </button>
                  ))}
                </div>
              </div>

              {/* 3D Character Suit Selection */}
              <div>
                <div className="text-xs font-semibold text-slate-300 mb-2">
                  Select 3D Character Suit
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {CHARACTER_OPTIONS.map((char) => {
                    const active = characterId === char.id;
                    return (
                      <button
                        key={char.id}
                        type="button"
                        onClick={() => setCharacterId(char.id)}
                        className={`min-h-[54px] px-2 py-2 rounded-lg border text-left transition ${
                          active
                            ? 'border-cyan-400 bg-cyan-500/20 text-white'
                            : 'border-white/10 bg-[#060913] text-slate-300 hover:border-white/30'
                        }`}
                      >
                        <div className="font-display text-xs font-bold leading-tight">
                          {char.name}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          {char.baseColorName} Base
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Color Selection */}
              <div>
                <div className="text-xs font-semibold text-slate-300 mb-2">
                  Select Color
                </div>
                <div className="grid grid-cols-7 gap-2">
                  {NEON_PALETTE.map((col) => {
                    const active = preferredColorId === col.id;
                    return (
                      <button
                        key={col.id}
                        type="button"
                        title={col.name}
                        aria-label={col.name}
                        onClick={() => setPreferredColorId(col.id)}
                        className={`min-h-[44px] rounded-lg border flex flex-col items-center justify-center transition ${
                          active
                            ? 'border-white bg-white/15 scale-105'
                            : 'border-white/15 bg-[#060913] hover:border-white/40'
                        }`}
                      >
                        <span
                          className="w-5 h-5 rounded-sm border border-white/25"
                          style={{ backgroundColor: col.hex }}
                        />
                      </button>
                    );
                  })}
                </div>
                <div className="text-[11px] text-slate-400 mt-1.5">
                  Active color:{' '}
                  <span
                    className="font-semibold"
                    style={{ color: selectedColor.hex }}
                  >
                    {selectedColor.name}
                  </span>{' '}
                  (applies to character suit &amp; light trail)
                </div>
              </div>

              {/* Vehicle Selection — positioned directly beneath the Color option */}
              <div>
                <div className="text-xs font-semibold text-slate-300 mb-2">
                  Select Vehicle
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setVehicleType('bike')}
                    className={`min-h-[54px] px-3 py-2 rounded-lg border flex items-center gap-2.5 transition ${
                      vehicleType === 'bike'
                        ? 'border-cyan-400 bg-cyan-500/20 text-white'
                        : 'border-white/10 bg-[#060913] text-slate-300 hover:border-white/30'
                    }`}
                  >
                    <Bike className="w-5 h-5 text-cyan-300 shrink-0" />
                    <div className="text-left">
                      <div className="font-display text-xs font-bold">
                        Light Cycle
                      </div>
                      <div className="text-[11px] text-slate-400">
                        2-Wheel Bike
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setVehicleType('car')}
                    className={`min-h-[54px] px-3 py-2 rounded-lg border flex items-center gap-2.5 transition ${
                      vehicleType === 'car'
                        ? 'border-cyan-400 bg-cyan-500/20 text-white'
                        : 'border-white/10 bg-[#060913] text-slate-300 hover:border-white/30'
                    }`}
                  >
                    <Car className="w-5 h-5 text-cyan-300 shrink-0" />
                    <div className="text-left">
                      <div className="font-display text-xs font-bold">
                        Neon Car
                      </div>
                      <div className="text-[11px] text-slate-400">
                        4-Wheel Interceptor
                      </div>
                    </div>
                  </button>
                </div>
              </div>
            </div>

            <div className="space-y-2.5 pt-2">
              {errorMsg && (
                <div className="text-xs text-rose-400 font-medium">
                  {errorMsg}
                </div>
              )}
              {statusMsg && (
                <div className="text-xs text-cyan-300 font-medium">
                  {statusMsg}
                </div>
              )}
              <button
                type="submit"
                disabled={saving}
                className="w-full min-h-[46px] rounded-lg bg-cyan-500 text-slate-950 font-bold text-sm hover:bg-cyan-400 disabled:opacity-50 transition"
              >
                {saving ? 'Saving...' : 'Save Profile'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
