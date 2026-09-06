/* ─────────────────────────────────────────────────────────────
 *  Vigil.OS / Judicator Docs — OCR Module Types
 *  Defines the domain contracts, statuses, and provider interface
 * ───────────────────────────────────────────────────────────── */

export type OCRStatus =
  | "PENDING"
  | "PROCESSING"
  | "COMPLETED"
  | "FAILED"
  | "NOT_REQUIRED";

export type OCRSource =
  | "DIRECT_TEXT"       // Extracted directly from digital PDF stream
  | "OCR_IMAGE"         // Processed via image OCR (PNG/JPG/TIFF)
  | "OCR_SCANNED_PDF"   // Rendered/extracted from scanned PDF and OCR-processed
  | "NOT_REQUIRED";     // Non-document or unsupported file

export interface OCRLanguageOption {
  code: string;
  label: string;
  tesseractCode: string;
}

export const SUPPORTED_OCR_LANGUAGES: readonly OCRLanguageOption[] = [
  { code: "eng", label: "English", tesseractCode: "eng" },
  { code: "hin", label: "Hindi (हिन्दी)", tesseractCode: "hin" },
  { code: "mar", label: "Marathi (मराठी)", tesseractCode: "mar" },
] as const;

export const DEFAULT_OCR_LANGUAGE = "eng";

export interface OCRResult {
  status: OCRStatus;
  text: string;
  source: OCRSource;
  language: string;
  engine: string;
  pageCount: number;
  confidence?: number | undefined;
  processedAt: string;
  durationMs: number;
  error?: string | undefined;
}

export interface OCRProcessingInput {
  fileBuffer: Buffer;
  mimeType: string;
  filename: string;
  language?: string | undefined;
}

export interface OCRProvider {
  name: string;
  recognize(
    imageBuffer: Buffer,
    language?: string,
  ): Promise<{ text: string; confidence?: number }>;
  cleanup?(): Promise<void>;
}
