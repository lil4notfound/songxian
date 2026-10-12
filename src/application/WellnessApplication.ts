import type {
  ActiveModuleSession,
  AudioGuide,
  DeviceGateway,
  Logger,
  PreferenceRepository,
  SessionIdGenerator,
  TrainingApi,
} from './ports';
import type { ModuleId } from '../domain/modules';

export class WellnessApplication {
  private activeSession: ActiveModuleSession | null = null;

  constructor(
    readonly device: DeviceGateway,
    readonly audio: AudioGuide,
    readonly preferences: PreferenceRepository,
    readonly training: TrainingApi,
    private readonly logger: Logger,
    private readonly sessionIds: SessionIdGenerator,
  ) {}

  async initialize(): Promise<void> {
    await this.device.connect();
    const audioSettings = this.preferences.loadAudioSettings();
    this.audio.setEnabled(audioSettings.enabled);
    this.audio.setVolume(audioSettings.volume);
    this.logger.info('application.ready', { device: this.device.getConnectionState() });
  }

  createRequestId(): string {
    return this.sessionIds.create();
  }

  beginModule(moduleId: ModuleId): ActiveModuleSession {
    this.endModule('module_switch');
    this.activeSession = {
      id: this.sessionIds.create(),
      moduleId,
      startedAt: Date.now(),
    };
    this.logger.info('module.started', {
      moduleId,
      sessionId: this.activeSession.id,
    });
    return this.activeSession;
  }

  endModule(reason: 'home' | 'module_switch' | 'complete'): void {
    this.audio.stop();
    if (this.activeSession) {
      this.logger.info('module.ended', {
        reason,
        moduleId: this.activeSession.moduleId,
        sessionId: this.activeSession.id,
      });
      this.activeSession = null;
    }
  }

  updateAudio(enabled: boolean, volume: number): void {
    const settings = { enabled, volume };
    this.audio.setEnabled(enabled);
    this.audio.setVolume(volume);
    this.preferences.saveAudioSettings(settings);
  }

  health(): { status: 'ok' | 'degraded'; device: string } {
    const device = this.device.getConnectionState();
    return { status: device === 'ready' ? 'ok' : 'degraded', device };
  }
}
