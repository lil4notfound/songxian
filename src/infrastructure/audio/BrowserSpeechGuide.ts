import type { AudioGuide, AudioSettings } from '../../application/ports';

const AUDIO_CLIPS: Readonly<Record<string, string>> = {
  '坐稳，保持自然呼吸': 'training-prepare.wav',
  轻轻上提: 'training-contract.wav',
  保持: 'training-hold.wav',
  慢慢松开: 'training-release.wav',
  完全放松: 'training-rest.wav',
  重新坐好: 'training-reprepare.wav',
  '完成，放松': 'training-complete.wav',
  轻轻收住: 'training-anal-contract.wav',
  '检查连接和坐垫接触，再试一次。': 'posture-connection.wav',
  '先坐稳，保持两秒，我们再观察。': 'posture-adjusting.wav',
  '双脚放稳，身体轻轻向右调整，让两侧支撑更均衡。': 'posture-left.wav',
  '双脚放稳，身体轻轻向左调整，让两侧支撑更均衡。': 'posture-right.wav',
  '当前支撑接近你的舒适参考，可以保持舒服，自然呼吸。': 'posture-balanced.wav',
};

const getClipUrl = (text: string): string | null => {
  const fileName = AUDIO_CLIPS[text];
  return fileName ? `${import.meta.env.BASE_URL}audio/${fileName}` : null;
};

export class BrowserSpeechGuide implements AudioGuide {
  private unlocked = false;
  isUnlocked(): boolean {
    return this.unlocked;
  }
  unlock(): void {
    if (this.unlocked) return;
    this.unlocked = true;
    if (
      !this.settings.enabled ||
      !('speechSynthesis' in window) ||
      !('SpeechSynthesisUtterance' in window)
    )
      return;
    const silence = new SpeechSynthesisUtterance(' ');
    silence.volume = 0;
    window.speechSynthesis.speak(silence);
    window.speechSynthesis.cancel();
  }
  private settings: AudioSettings;
  private currentAudio: HTMLAudioElement | null = null;
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private preferredVoice: SpeechSynthesisVoice | null = null;

  constructor(initialSettings: AudioSettings) {
    this.settings = initialSettings;
    this.refreshVoice();
    if ('speechSynthesis' in window) {
      window.speechSynthesis.addEventListener?.('voiceschanged', this.refreshVoice);
    }
  }

  async speak(text: string): Promise<void> {
    if (!this.settings.enabled) return;
    this.stop();

    const clipUrl = getClipUrl(text);
    if (clipUrl && 'Audio' in window) {
      const audio = new Audio(clipUrl);
      audio.preload = 'auto';
      audio.volume = this.settings.volume;
      audio.onended = () => {
        if (this.currentAudio === audio) this.currentAudio = null;
      };
      this.currentAudio = audio;

      try {
        await audio.play();
        return;
      } catch {
        if (this.currentAudio === audio) this.currentAudio = null;
      }
    }

    this.speakWithSystemVoice(text);
  }

  stop(): void {
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio.currentTime = 0;
      this.currentAudio = null;
    }

    if ('speechSynthesis' in window && this.currentUtterance) {
      window.speechSynthesis.cancel();
      this.currentUtterance = null;
    }
  }

  setEnabled(enabled: boolean): void {
    this.settings = { ...this.settings, enabled };
    if (!enabled) this.stop();
  }

  setVolume(volume: number): void {
    const nextVolume = Math.min(1, Math.max(0, volume));
    this.settings = { ...this.settings, volume: nextVolume };
    if (this.currentAudio) this.currentAudio.volume = nextVolume;
  }

  getSettings(): AudioSettings {
    return { ...this.settings };
  }

  private readonly refreshVoice = (): void => {
    if (!('speechSynthesis' in window)) return;
    const voices = window.speechSynthesis.getVoices();
    this.preferredVoice =
      voices.find((voice) => voice.lang.toLowerCase() === 'zh-cn') ??
      voices.find((voice) => voice.lang.toLowerCase().startsWith('zh')) ??
      null;
  };

  private speakWithSystemVoice(text: string): void {
    if (!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) return;

    this.refreshVoice();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'zh-CN';
    utterance.rate = 1.05;
    utterance.pitch = 0.95;
    utterance.volume = this.settings.volume;
    if (this.preferredVoice) utterance.voice = this.preferredVoice;
    utterance.onend = () => {
      if (this.currentUtterance === utterance) this.currentUtterance = null;
    };
    utterance.onerror = () => {
      if (this.currentUtterance === utterance) this.currentUtterance = null;
    };
    this.currentUtterance = utterance;
    window.speechSynthesis.speak(utterance);
    window.speechSynthesis.resume();
  }
}
