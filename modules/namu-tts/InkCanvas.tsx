// The native handwriting canvas (Android). Elsewhere (web, tests) InkCanvas is null.
import { requireNativeView } from 'expo';
import type { Ref } from 'react';
import { Platform, type ViewProps } from 'react-native';
import { NamuTts } from './index';

export interface InkCanvasRef {
  clear(): Promise<void>;
  undo(): Promise<void>;
  /** Strokes written so far, each x0, y0, x1, y1, … in pixels. */
  strokes(): Promise<number[][]>;
}

export type InkCanvasProps = ViewProps & {
  inkColor?: string;
  onStrokesChanged?: (e: { nativeEvent: { count: number } }) => void;
  ref?: Ref<InkCanvasRef>;
};

export const InkCanvas: React.ComponentType<InkCanvasProps> | null =
  Platform.OS === 'android' && NamuTts ? requireNativeView<InkCanvasProps>('NamuTts') : null;
