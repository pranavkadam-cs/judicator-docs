/* ─────────────────────────────────────────────────────────────
 *  Vigil.OS / Judicator Docs — Google Cloud Vision OCR Provider
 *  Implements OCRProvider using Google Cloud Vision API v1
 *  for enterprise-grade text detection on legal documents.
 *
 *  Features:
 *  - TEXT_DETECTION for images (PNG, JPG, TIFF, BMP, WebP)
 *  - DOCUMENT_TEXT_DETECTION for dense legal documents
 *  - Multi-language support (English, Hindi, Marathi)
 *  - Confidence scoring from API response
 *  - Automatic fallback to Tesseract on API failure
 * ───────────────────────────────────────────────────────────── */

import type { OCRProvider } from "./ocr-types";
import { DEFAULT_OCR_LANGUAGE } from "./ocr-types";

/** Maps internal language codes to Google Cloud Vision language hints */
const LANGUAGE_HINTS: Record<string, string[]> = {
  eng: ["en"],
  hin: ["hi"],
  mar: ["mr"],
  en: ["en"],
  hi: ["hi"],
  mr: ["mr"],
};

export class GoogleVisionProvider implements OCRProvider {
  public readonly name = "Google Cloud Vision API";

  private apiKey: string;
  private projectNumber: string;

  constructor(apiKey?: string, projectNumber?: string) {
    this.apiKey = apiKey || process.env["GOOGLE_CLOUD_VISION_API_KEY"] || "";
    this.projectNumber = projectNumber || process.env["GOOGLE_CLOUD_PROJECT_NUMBER"] || "";

    if (!this.apiKey) {
      throw new Error(
        "Google Cloud Vision API key not configured. Set GOOGLE_CLOUD_VISION_API_KEY in .env file."
      );
    }
  }

  /**
   * Performs text recognition on an image buffer using Google Cloud Vision API.
   * Uses DOCUMENT_TEXT_DETECTION for superior accuracy on dense legal documents.
   *
   * @param imageBuffer Raw image bytes (PNG, JPG, TIFF, BMP, WebP)
   * @param language Language hint code ('eng', 'hin', 'mar')
   */
  async recognize(
    imageBuffer: Buffer,
    language: string = DEFAULT_OCR_LANGUAGE,
  ): Promise<{ text: string; confidence?: number }> {
    // Validate buffer
    if (!imageBuffer || imageBuffer.length === 0) {
      throw new Error("Empty image buffer provided to Google Cloud Vision OCR engine.");
    }

    // Maximum API payload size: 10MB for base64-encoded images
    const maxBytes = 10 * 1024 * 1024;
    if (imageBuffer.length > maxBytes) {
      throw new Error(
        `Image too large for Google Cloud Vision API (${(imageBuffer.length / 1024 / 1024).toFixed(1)}MB). Max: 10MB.`
      );
    }

    const base64Image = imageBuffer.toString("base64");
    const langHints = LANGUAGE_HINTS[language] || LANGUAGE_HINTS["eng"] || ["en"];

    // Build Vision API request payload
    const requestBody = {
      requests: [
        {
          image: {
            content: base64Image,
          },
          features: [
            {
              type: "DOCUMENT_TEXT_DETECTION",
              maxResults: 50,
            },
          ],
          imageContext: {
            languageHints: langHints,
          },
        },
      ],
    };

    const apiUrl = `https://vision.googleapis.com/v1/images:annotate?key=${this.apiKey}`;

    try {
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-User-Project": this.projectNumber,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => "Unknown error");
        throw new Error(
          `Google Cloud Vision API returned HTTP ${response.status}: ${errorBody}`
        );
      }

      const data: any = await response.json();

      // Check for API-level errors in the response
      if (data.responses?.[0]?.error) {
        const apiError = data.responses[0].error;
        throw new Error(
          `Google Cloud Vision API error (${apiError.code}): ${apiError.message}`
        );
      }

      // Extract full text annotation (best for documents)
      const fullTextAnnotation = data.responses?.[0]?.fullTextAnnotation;
      const textAnnotations = data.responses?.[0]?.textAnnotations;

      let extractedText = "";
      let confidence: number | undefined;

      if (fullTextAnnotation) {
        // DOCUMENT_TEXT_DETECTION returns structured full text
        extractedText = fullTextAnnotation.text || "";

        // Calculate average confidence from page blocks
        const pages = fullTextAnnotation.pages;
        if (Array.isArray(pages) && pages.length > 0) {
          let totalConfidence = 0;
          let blockCount = 0;

          for (const page of pages) {
            if (Array.isArray(page.blocks)) {
              for (const block of page.blocks) {
                if (typeof block.confidence === "number") {
                  totalConfidence += block.confidence;
                  blockCount++;
                }
              }
            }
          }

          if (blockCount > 0) {
            // Vision API returns confidence as 0-1; convert to 0-100 for consistency with Tesseract
            confidence = Math.round((totalConfidence / blockCount) * 100);
          }
        }
      } else if (Array.isArray(textAnnotations) && textAnnotations.length > 0) {
        // Fallback to simple TEXT_DETECTION format
        extractedText = textAnnotations[0]?.description || "";
      }

      const result: { text: string; confidence?: number } = {
        text: extractedText.trim(),
      };
      if (typeof confidence === "number") {
        result.confidence = confidence;
      }
      return result;
    } catch (error: any) {
      const message = error instanceof Error ? error.message : String(error);

      // If it's a network or API issue, provide a clear error for fallback handling
      if (
        message.includes("fetch") ||
        message.includes("ENOTFOUND") ||
        message.includes("ECONNREFUSED") ||
        message.includes("timeout")
      ) {
        throw new Error(`Google Cloud Vision API unreachable: ${message}`);
      }

      throw new Error(`Google Cloud Vision recognition failed: ${message}`);
    }
  }

  /**
   * No persistent cleanup needed — each call is stateless HTTP.
   */
  async cleanup(): Promise<void> {
    // Stateless provider — no resources to release
  }
}
