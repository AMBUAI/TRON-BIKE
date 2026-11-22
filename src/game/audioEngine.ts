import type { AudioSettings } from '../../shared/types';

const SETTINGS_KEY = 'tronbike_audio_settings_v1';

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  masterVolume: 0.8,
  musicVolume: 0.55,
  sfxVolume: 0.85,
  musicEnabled: true,
  sfxEnabled: true,
  defaultCamera: 'third',
};

export function loadAudioSettings(): AudioSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_AUDIO_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<AudioSettings>;
    return {
      masterVolume:
        typeof parsed.masterVolume === 'number'
          ? Math.max(0, Math.min(1, parsed.masterVolume))
          : DEFAULT_AUDIO_SETTINGS.masterVolume,
      musicVolume:
        typeof parsed.musicVolume === 'number'
          ? Math.max(0, Math.min(1, parsed.musicVolume))
          : DEFAULT_AUDIO_SETTINGS.musicVolume,
      sfxVolume:
        typeof parsed.sfxVolume === 'number'
          ? Math.max(0, Math.min(1, parsed.sfxVolume))
          : DEFAULT_AUDIO_SETTINGS.sfxVolume,
      musicEnabled:
        typeof parsed.musicEnabled === 'boolean'
          ? parsed.musicEnabled
          : DEFAULT_AUDIO_SETTINGS.musicEnabled,
      sfxEnabled:
        typeof parsed.sfxEnabled === 'boolean'
          ? parsed.sfxEnabled
          : DEFAULT_AUDIO_SETTINGS.sfxEnabled,
      defaultCamera: parsed.defaultCamera === 'first' ? 'first' : 'third',
    };
  } catch {
    return { ...DEFAULT_AUDIO_SETTINGS };
  }
}

export function saveAudioSettings(settings: AudioSettings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // ignore storage errors
  }
}

class TronAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;

  private engineOsc1: OscillatorNode | null = null;
  private engineOsc2: OscillatorNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private engineGain: GainNode | null = null;

  private bgmTimer: number | null = null;
  private bgmStep = 0;
  private bgmActive = false;
  private bgmIntensity: 'menu' | 'match' = 'menu';

  private settings: AudioSettings = loadAudioSettings();

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();

      this.masterGain = this.ctx.createGain();
      this.musicGain = this.ctx.createGain();
      this.sfxGain = this.ctx.createGain();

      this.musicGain.connect(this.masterGain);
      this.sfxGain.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);
      this.applyVolumes();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public unlock() {
    this.ensureContext();
    if (this.settings.musicEnabled && !this.bgmActive) {
      this.startMusic(this.bgmIntensity);
    }
  }

  public getSettings(): AudioSettings {
    return { ...this.settings };
  }

  public updateSettings(next: AudioSettings) {
    this.settings = { ...next };
    saveAudioSettings(this.settings);
    this.applyVolumes();

    if (!this.settings.musicEnabled) {
      this.stopMusic();
    } else if (!this.bgmActive && this.ctx) {
      this.startMusic(this.bgmIntensity);
    }
  }

  private applyVolumes() {
    if (!this.ctx || !this.masterGain || !this.musicGain || !this.sfxGain) {
      return;
    }
    const t = this.ctx.currentTime;
    this.masterGain.gain.setTargetAtTime(this.settings.masterVolume, t, 0.03);
    this.musicGain.gain.setTargetAtTime(
      this.settings.musicEnabled ? this.settings.musicVolume * 0.48 : 0,
      t,
      0.04
    );
    this.sfxGain.gain.setTargetAtTime(
      this.settings.sfxEnabled ? this.settings.sfxVolume : 0,
      t,
      0.03
    );
  }

  public startMusic(mode: 'menu' | 'match') {
    this.bgmIntensity = mode;
    if (!this.settings.musicEnabled) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    if (this.bgmTimer !== null) {
      window.clearInterval(this.bgmTimer);
      this.bgmTimer = null;
    }

    this.bgmActive = true;
    const tempoMs = mode === 'match' ? 145 : 195;

    // D minor futuristic arpeggio & driving synthwave bass
    const bassNotes = [73.42, 73.42, 73.42, 87.31, 65.41, 65.41, 82.41, 98.0]; // D2, F2, C2, E2, G2
    const arpNotes = [
      293.66, 349.23, 440.0, 587.33, 440.0, 349.23, 523.25, 440.0,
      261.63, 329.63, 392.0, 523.25, 392.0, 329.63, 440.0, 349.23,
    ];

    this.bgmTimer = window.setInterval(() => {
      if (!this.ctx || !this.musicGain || !this.settings.musicEnabled) return;
      if (this.ctx.state !== 'running') return;

      const now = this.ctx.currentTime;
      const step = this.bgmStep++;

      // Deep driving synth bass on 8th notes
      const bassFreq = bassNotes[Math.floor(step / 2) % bassNotes.length];
      this.playSynthNote(
        bassFreq,
        'sawtooth',
        now,
        0.13,
        this.bgmIntensity === 'match' ? 0.22 : 0.14,
        320
      );

      // Electronic pulse kick on every 4th step during matches
      if (this.bgmIntensity === 'match' && step % 4 === 0) {
        this.playKick(now, 0.24);
      } else if (step % 8 === 0) {
        this.playKick(now, 0.14);
      }

      // Hypnotic arpeggio shimmer
      if (step % 2 === 0 || this.bgmIntensity === 'match') {
        const arpFreq = arpNotes[step % arpNotes.length];
        this.playSynthNote(
          arpFreq,
          'triangle',
          now,
          0.11,
          this.bgmIntensity === 'match' ? 0.11 : 0.08,
          1800
        );
      }

      // Subtle atmospheric pad every 16 steps
      if (step % 16 === 0) {
        this.playPadChord(now);
      }
    }, tempoMs);
  }

  public stopMusic() {
    this.bgmActive = false;
    if (this.bgmTimer !== null) {
      window.clearInterval(this.bgmTimer);
      this.bgmTimer = null;
    }
  }

  private playSynthNote(
    freq: number,
    type: OscillatorType,
    time: number,
    duration: number,
    gainVal: number,
    cutoff: number
  ) {
    if (!this.ctx || !this.musicGain) return;
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, time);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cutoff, time);
    filter.Q.value = 3.5;

    gain.gain.setValueAtTime(0.001, time);
    gain.gain.exponentialRampToValueAtTime(gainVal, time + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.musicGain);

    osc.start(time);
    osc.stop(time + duration + 0.02);
  }

  private playKick(time: number, level: number) {
    if (!this.ctx || !this.musicGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(115, time);
    osc.frequency.exponentialRampToValueAtTime(36, time + 0.11);
    gain.gain.setValueAtTime(level, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.13);
    osc.connect(gain);
    gain.connect(this.musicGain);
    osc.start(time);
    osc.stop(time + 0.15);
  }

  private playPadChord(time: number) {
    if (!this.ctx || !this.musicGain) return;
    const freqs = [146.83, 220.0, 261.63]; // Dm7 atmospheric pad
    for (const f of freqs) {
      const osc = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(f, time);
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(620, time);
      gain.gain.setValueAtTime(0.001, time);
      gain.gain.linearRampToValueAtTime(0.035, time + 0.4);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 2.0);
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.musicGain);
      osc.start(time);
      osc.stop(time + 2.1);
    }
  }

  // Continuous Bike Engine Hum
  public startEngineHum() {
    if (!this.settings.sfxEnabled) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;
    if (this.engineOsc1) return;

    const now = ctx.currentTime;
    this.engineOsc1 = ctx.createOscillator();
    this.engineOsc2 = ctx.createOscillator();
    this.engineFilter = ctx.createBiquadFilter();
    this.engineGain = ctx.createGain();

    this.engineOsc1.type = 'sawtooth';
    this.engineOsc1.frequency.setValueAtTime(92, now);

    this.engineOsc2.type = 'triangle';
    this.engineOsc2.frequency.setValueAtTime(184.5, now);

    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.setValueAtTime(340, now);
    this.engineFilter.Q.value = 4;

    this.engineGain.gain.setValueAtTime(0.001, now);
    this.engineGain.gain.linearRampToValueAtTime(0.09, now + 0.3);

    this.engineOsc1.connect(this.engineFilter);
    this.engineOsc2.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.sfxGain);

    this.engineOsc1.start(now);
    this.engineOsc2.start(now);
  }

  public modEngineTurn() {
    if (!this.ctx || !this.engineOsc1 || !this.engineOsc2 || !this.engineFilter) {
      return;
    }
    const now = this.ctx.currentTime;
    this.engineOsc1.frequency.cancelScheduledValues(now);
    this.engineOsc1.frequency.setValueAtTime(108, now);
    this.engineOsc1.frequency.exponentialRampToValueAtTime(92, now + 0.22);

    this.engineFilter.frequency.cancelScheduledValues(now);
    this.engineFilter.frequency.setValueAtTime(620, now);
    this.engineFilter.frequency.exponentialRampToValueAtTime(340, now + 0.22);
  }

  public stopEngineHum() {
    if (!this.ctx || !this.engineGain) return;
    const now = this.ctx.currentTime;
    try {
      this.engineGain.gain.setTargetAtTime(0.0001, now, 0.05);
      this.engineOsc1?.stop(now + 0.15);
      this.engineOsc2?.stop(now + 0.15);
    } catch {
      // ignore
    }
    this.engineOsc1 = null;
    this.engineOsc2 = null;
    this.engineFilter = null;
    this.engineGain = null;
  }

  public playUiTap() {
    if (!this.settings.sfxEnabled) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(760, now);
    osc.frequency.exponentialRampToValueAtTime(1120, now + 0.05);
    gain.gain.setValueAtTime(0.09, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.07);
  }

  public playTurn() {
    if (!this.settings.sfxEnabled) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(420, now);
    osc.frequency.exponentialRampToValueAtTime(860, now + 0.09);
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.12);

    this.modEngineTurn();
  }

  public playCountdown(val: number) {
    if (!this.settings.sfxEnabled) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;
    const now = ctx.currentTime;

    if (val > 0) {
      const freqs: Record<number, number> = { 3: 440, 2: 523.25, 1: 659.25 };
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(freqs[val] ?? 440, now);
      gain.gain.setValueAtTime(0.14, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(now);
      osc.stop(now + 0.26);
    } else {
      // GO! Energetic chord surge + light-trail activation
      const chord = [587.33, 880, 1174.66];
      for (const f of chord) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(f * 0.75, now);
        osc.frequency.exponentialRampToValueAtTime(f, now + 0.12);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(now);
        osc.stop(now + 0.48);
      }
    }
  }

  public playElimination(isBoundary: boolean) {
    if (!this.settings.sfxEnabled) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;
    const now = ctx.currentTime;

    // Noise burst for digital derez / shatter
    const bufferSize = Math.floor(ctx.sampleRate * 0.45);
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.14));
    }

    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = isBoundary ? 'bandpass' : 'lowpass';
    filter.frequency.setValueAtTime(isBoundary ? 1400 : 950, now);
    filter.frequency.exponentialRampToValueAtTime(140, now + 0.42);

    const nGain = ctx.createGain();
    nGain.gain.setValueAtTime(0.35, now);
    nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

    noise.connect(filter);
    filter.connect(nGain);
    nGain.connect(this.sfxGain);
    noise.start(now);

    // Sub impact drop
    const sub = ctx.createOscillator();
    const subGain = ctx.createGain();
    sub.type = 'sawtooth';
    sub.frequency.setValueAtTime(isBoundary ? 240 : 160, now);
    sub.frequency.exponentialRampToValueAtTime(34, now + 0.42);
    subGain.gain.setValueAtTime(0.28, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.44);
    sub.connect(subGain);
    subGain.connect(this.sfxGain);
    sub.start(now);
    sub.stop(now + 0.46);
  }

  public playVictoryWheelie() {
    if (!this.settings.sfxEnabled) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;
    const now = ctx.currentTime;

    // Wheelie engine rev sweep
    const rev = ctx.createOscillator();
    const revGain = ctx.createGain();
    rev.type = 'sawtooth';
    rev.frequency.setValueAtTime(110, now);
    rev.frequency.exponentialRampToValueAtTime(320, now + 0.7);
    rev.frequency.exponentialRampToValueAtTime(180, now + 1.5);
    revGain.gain.setValueAtTime(0.14, now);
    revGain.gain.exponentialRampToValueAtTime(0.001, now + 1.55);
    rev.connect(revGain);
    revGain.connect(this.sfxGain);
    rev.start(now);
    rev.stop(now + 1.6);

    // Heroic victorious synth fanfare
    const sfxDest = this.sfxGain;
    const notes = [587.33, 739.99, 880.0, 1174.66];
    notes.forEach((f, idx) => {
      const start = now + idx * 0.14;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f, start);
      gain.gain.setValueAtTime(0.001, start);
      gain.gain.linearRampToValueAtTime(0.2, start + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.9);
      osc.connect(gain);
      gain.connect(sfxDest);
      osc.start(start);
      osc.stop(start + 0.95);
    });
  }

  public playDefeat() {
    if (!this.settings.sfxEnabled) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;
    const sfxDest = this.sfxGain;
    const now = ctx.currentTime;

    const notes = [392.0, 349.23, 293.66, 220.0];
    notes.forEach((f, idx) => {
      const start = now + idx * 0.16;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(f, start);
      gain.gain.setValueAtTime(0.11, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.35);
      osc.connect(gain);
      gain.connect(sfxDest);
      osc.start(start);
      osc.stop(start + 0.38);
    });
  }
}

export const audioEngine = new TronAudioEngine();
