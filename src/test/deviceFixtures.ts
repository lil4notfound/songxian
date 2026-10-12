// 本文件中的设备与校准数据为脱敏样例，仅用于测试。
import { DEVICE_CHANNELS, type ChannelMap, type RawChannelValues } from '../contracts/device';
import { createCalibrationProfile, type CalibrationSamples } from '../domain/calibration';
export const repeated = (raw: RawChannelValues, count = 20) =>
  Array.from({ length: count }, () => [...raw] as RawChannelValues);
export const rawMap = (raw: RawChannelValues): ChannelMap =>
  Object.fromEntries(DEVICE_CHANNELS.map((ch, i) => [ch, raw[i]!])) as ChannelMap;
export const makeSamples = (): CalibrationSamples => ({
  empty: repeated([0, 0, 0, 0, 0]),
  seated: repeated([1000, 1000, 700, 700, 0]),
  rest: repeated([1000, 1000, 700, 700, 0]),
  lean_left: repeated([1700, 600, 700, 700, 0]),
  lean_right: repeated([600, 1700, 700, 700, 0]),
  lean_forward: repeated([1000, 1000, 500, 500, 0]),
  lean_back: repeated([1000, 1000, 700, 700, 900]),
  cross_left: repeated([1150, 850, 150, 1000, 0]),
  cross_right: repeated([850, 1150, 1000, 150, 0]),
  pelvic_floor: Array.from({ length: 5 }, () => ({
    contract: repeated([1200, 1190, 700, 700, 0]),
    release: repeated([1000, 1000, 700, 700, 0]),
  })),
  anal: Array.from({ length: 5 }, () => ({
    contract: repeated([800, 820, 700, 700, 0]),
    release: repeated([1000, 1000, 700, 700, 0]),
  })),
});
export const makeProfile = () => createCalibrationProfile('device-1', 'layout-1', makeSamples());
