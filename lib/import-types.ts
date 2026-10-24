import type { ClassificationResult } from './classify';

export interface QrProvenance {
  id: string;
  payload: string;
  url?: string;
  resolvedUrl?: string;
}
export interface ImportPreviewItem {
  id: string;
  source: 'image' | 'qr';
  result: ClassificationResult;
  qr?: QrProvenance;
  error?: string;
}
