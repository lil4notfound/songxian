import type { AudioSettings, PreferenceRepository } from '../../application/ports';

const AUDIO_KEY = 'songxian.audio.v1';
const POSTURE_REFERENCE_KEY = 'songxian.posture-reference.v1';

export class BrowserPreferenceRepository implements PreferenceRepository {
  loadAudioSettings(): AudioSettings {
    const stored = window.localStorage.getItem(AUDIO_KEY);
    if (!stored) return { enabled: true, volume: 0.75 };
    try {
      const parsed = JSON.parse(stored) as Partial<AudioSettings>;
      return {
        enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : true,
        volume: typeof parsed.volume === 'number' ? parsed.volume : 0.75,
      };
    } catch {
      return { enabled: true, volume: 0.75 };
    }
  }

  saveAudioSettings(settings: AudioSettings): void {
    window.localStorage.setItem(AUDIO_KEY, JSON.stringify(settings));
  }

  hasPostureReference(): boolean {
    return window.localStorage.getItem(POSTURE_REFERENCE_KEY) === 'ready';
  }

  savePostureReference(): void {
    window.localStorage.setItem(POSTURE_REFERENCE_KEY, 'ready');
  }

  clearPostureReference(): void {
    window.localStorage.removeItem(POSTURE_REFERENCE_KEY);
  }
}
