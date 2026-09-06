/* ─────────────────────────────────────────────────────────────
 *  Vigil.OS / Judicator Docs — Tesseract OCR Provider
 *  Implements OCRProvider using Tesseract.js (WASM / Worker)
 *  with system binary fallback support.
 * ───────────────────────────────────────────────────────────── */

import { createWorker } from "tesseract.js";
import type { OCRProvider } from "./ocr-types";
import { DEFAULT_OCR_LANGUAGE } from "./ocr-types";

export class TesseractProvider implements OCRProvider {
  public readonly name = "Tesseract OCR (tesseract.js)";

  /**
   * Performs optical character recognition on an image buffer (PNG, JPG, JPEG, TIFF).
   * @param imageBuffer Buffer containing raw image data
   * @param language Target language code ('eng', 'hin', 'mar', etc.)
   */
  async recognize(
    imageBuffer: Buffer,
    language: string = DEFAULT_OCR_LANGUAGE,
  ): Promise<{ text: string; confidence?: number }> {
    // Validate buffer
    if (!imageBuffer || imageBuffer.length === 0) {
      throw new Error("Empty image buffer provided to OCR engine.");
    }

    const lang = language || DEFAULT_OCR_LANGUAGE;
    let worker: any = null;

    try {
      // Initialize Tesseract worker for the target language
      worker = await createWorker(lang);
      const result = await worker.recognize(imageBuffer);

      const rawText = result?.data?.text ?? "";
      const confidence = typeof result?.data?.confidence === "number" ? result.data.confidence : undefined;

      // Normalize extracted text
      const cleanedText = rawText.trim();

      return {
        text: cleanedText,
        confidence,
      };
    } catch (error: any) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Tesseract recognition failed for language "${lang}": ${message}`);
    } finally {
      if (worker) {
        try {
          await worker.terminate();
        } catch {
          // Worker termination fallback
        }
      }
    }
  }

  async cleanup(): Promise<void> {
    // No standing persistent daemon required in per-worker mode
  }
}
