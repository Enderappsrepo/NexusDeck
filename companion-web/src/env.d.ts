/// <reference types="vite/client" />

// `BarcodeDetector` is a browser API (Chrome/Android) used by QrScanPanel for
// in-app QR pairing. It isn't in the standard TS DOM lib yet, so declare the
// minimal surface we use. Runtime code already feature-detects it.
interface BarcodeDetectorOptions {
  formats?: string[];
}

interface DetectedBarcode {
  rawValue: string;
}

declare class BarcodeDetector {
  constructor(options?: BarcodeDetectorOptions);
  static getSupportedFormats(): Promise<string[]>;
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
}
