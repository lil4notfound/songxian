import { WellnessApplication } from '../application/WellnessApplication';
import { BrowserSpeechGuide } from '../infrastructure/audio/BrowserSpeechGuide';
import { MockDeviceGateway } from '../infrastructure/device/MockDeviceGateway';
import { LiveDeviceGateway } from '../infrastructure/device/LiveDeviceGateway';
import { BrowserSessionIdGenerator } from '../infrastructure/identity/BrowserSessionIdGenerator';
import { ConsoleLogger } from '../infrastructure/observability/ConsoleLogger';
import { BrowserPreferenceRepository } from '../infrastructure/storage/BrowserPreferenceRepository';
import { HttpTrainingApi } from '../infrastructure/api/HttpTrainingApi';
import { env } from '../infrastructure/config/env';

const preferences = new BrowserPreferenceRepository();
const device = env.VITE_DEVICE_MODE === 'live' ? new LiveDeviceGateway() : new MockDeviceGateway();

export const application = new WellnessApplication(
  device,
  new BrowserSpeechGuide(preferences.loadAudioSettings()),
  preferences,
  new HttpTrainingApi(),
  new ConsoleLogger(),
  new BrowserSessionIdGenerator(),
);
