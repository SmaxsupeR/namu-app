// JS side of the native Supertonic module (Android only). On other platforms and in
// tests the module is absent and NamuTts is null, so the app falls back to the system voice.
import { NativeModule, requireOptionalNativeModule } from 'expo';

export interface DeviceInfo {
  sdk: number;
  abis: string;
  cores: number;
  totalRamMb: number;
  availRamMb: number;
  lowRamDevice: boolean;
  lowMemory: boolean;
}

export interface Conditions {
  /** 0–100, or -1 when unknown. */
  battery: number;
  charging: boolean;
  powerSave: boolean;
  /** Android thermal status: 0 none … 3 severe, 4+ critical; -1 unknown. */
  thermal: number;
  availRamMb: number;
  lowMemory: boolean;
}

export interface Memory {
  rssMb: number;
  peakMb: number;
  nativeHeapMb: number;
}

export interface DownloadProgressEvent {
  dest: string;
  bytes: number;
  total: number;
}

type Events = {
  onDownloadProgress: (e: DownloadProgressEvent) => void;
  onEngineReleased: (e: { reason: string; level: number }) => void;
};

export declare class NamuTtsNative extends NativeModule<Events> {
  storageDir(): string;
  deviceInfo(): Promise<DeviceInfo>;
  memory(): Promise<Memory>;
  conditions(): Promise<Conditions>;
  freeSpaceMb(dir: string): Promise<number>;
  sha256(file: string): Promise<string>;
  /** Downloads with resume (HTTP Range); resolves with the bytes on disk. */
  download(url: string, dest: string, expectedSize: number): Promise<number>;
  cancelDownload(): void;
  fileSize(file: string): Promise<number>;
  exists(file: string): Promise<boolean>;
  readText(file: string): Promise<string | null>;
  writeTextAtomic(file: string, text: string): Promise<boolean>;
  moveDir(from: string, to: string): Promise<boolean>;
  deleteTree(file: string): Promise<boolean>;
  copyFile(from: string, to: string): Promise<number>;
  concatFiles(parts: string[], to: string): Promise<number>;
  dictAudio(db: string, text: string, out: string): Promise<boolean>;
  dictAudioHas(db: string, text: string): Promise<boolean>;
  gunzip(from: string, to: string): Promise<number>;
  listDir(dir: string): Promise<string[]>;
  dirSize(dir: string): Promise<number>;
  isLoaded(dir: string, fold: boolean): Promise<boolean>;
  load(dir: string, threads: number, fold: boolean): Promise<{ loadMs: number; memory: Memory }>;
  synthToFile(text: string, voice: string, steps: number, speed: number, seed: number, outBase: string, compress: boolean): Promise<{ audioSec: number; totalMs: number; format: 'wav' | 'm4a' }>;
  aacUsable(): boolean;
  markAacBroken(): void;
  release(): Promise<Memory>;
  /** speed: 1 is normal; other values change the tempo, not the pitch. */
  playFile(file: string, speed?: number): Promise<number>;
  stopPlayback(): void;
}

export const NamuTts = requireOptionalNativeModule<NamuTtsNative>('NamuTts');
