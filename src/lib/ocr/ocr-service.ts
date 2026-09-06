/* ─────────────────────────────────────────────────────────────
 *  Vigil.OS / Judicator Docs — OCR Service Orchestrator
 *  Coordinates OCR dispatch, PDF direct text extraction, image OCR,
 *  page boundary preservation, and graceful failure isolation.
 *
 *  Provider Strategy:
 *  - "auto" (default): Google Cloud Vision primary → Tesseract fallback
 *  - "google-vision": Google Cloud Vision only
 *  - "tesseract": Local Tesseract.js only
 * ───────────────────────────────────────────────────────────── */

import type { OCRProcessingInput, OCRProvider, OCRResult, OCRStatus } from "./ocr-types";
import { DEFAULT_OCR_LANGUAGE } from "./ocr-types";
import { TesseractProvider } from "./tesseract-provider";
import { GoogleVisionProvider } from "./google-vision-provider";
import { extractFromPdf } from "./pdf-extractor";

// ── Provider Initialization ──────────────────────────────────

/**
 * Resolves the configured OCR provider mode from environment.
 * Options: "auto" | "google-vision" | "tesseract"
 */
function getProviderMode(): string {
  return (process.env["OCR_PROVIDER"] || "auto").toLowerCase().trim();
}

/**
 * Attempts to create a Google Cloud Vision provider.
 * Returns null if credentials are missing or invalid.
 */
function tryCreateGoogleVisionProvider(): GoogleVisionProvider | null {
  try {
    const apiKey = process.env["GOOGLE_CLOUD_VISION_API_KEY"];
    if (!apiKey) return null;
    return new GoogleVisionProvider(apiKey, process.env["GOOGLE_CLOUD_PROJECT_NUMBER"]);
  } catch {
    return null;
  }
}

// Initialize providers based on environment
let googleVisionProvider: GoogleVisionProvider | null = null;
let tesseractProvider: OCRProvider = new TesseractProvider();
let defaultProvider: OCRProvider;

// Lazy initialization to allow environment to load
function initProviders(): void {
  const mode = getProviderMode();

  if (mode === "google-vision" || mode === "auto") {
    googleVisionProvider = tryCreateGoogleVisionProvider();
  }

  if (mode === "google-vision" && googleVisionProvider) {
    defaultProvider = googleVisionProvider;
  } else if (mode === "tesseract") {
    defaultProvider = tesseractProvider;
  } else if (mode === "auto" && googleVisionProvider) {
    // Auto mode: Google Vision is primary, but recognize() handles fallback
    defaultProvider = googleVisionProvider;
  } else {
    // Fallback to Tesseract if Google Vision is unavailable
    defaultProvider = tesseractProvider;
  }
}

// Ensure providers are initialized on first use
let providersInitialized = false;
function ensureProviders(): void {
  if (!providersInitialized) {
    initProviders();
    providersInitialized = true;
  }
}

/**
 * Sets a custom OCR provider (useful for testing, AWS Textract, or Hyperledger notarized OCR).
 */
export function setOCRProvider(provider: OCRProvider): void {
  defaultProvider = provider;
  providersInitialized = true;
}

export function getOCRProvider(): OCRProvider {
  ensureProviders();
  return defaultProvider;
}

/**
 * Returns the name of the currently active OCR provider.
 */
export function getActiveProviderName(): string {
  ensureProviders();
  return defaultProvider.name;
}

/**
 * Normalizes and checks if a file is an eligible image for OCR.
 */
function isImageFile(mimeType: string, filename: string): boolean {
  const normMime = (mimeType || "").toLowerCase();
  const ext = (filename || "").toLowerCase().split(".").pop() ?? "";

  const imageMimes = ["image/png", "image/jpeg", "image/jpg", "image/tiff", "image/tif", "image/bmp", "image/webp"];
  const imageExts = ["png", "jpg", "jpeg", "tiff", "tif", "bmp", "webp"];

  return imageMimes.includes(normMime) || imageExts.includes(ext);
}

/**
 * Checks if a file is a PDF.
 */
function isPdfFile(mimeType: string, filename: string): boolean {
  const normMime = (mimeType || "").toLowerCase();
  const ext = (filename || "").toLowerCase().split(".").pop() ?? "";
  return normMime === "application/pdf" || ext === "pdf";
}

/**
 * Checks if a file is plaintext.
 */
function isPlaintextFile(mimeType: string, filename: string): boolean {
  const normMime = (mimeType || "").toLowerCase();
  const ext = (filename || "").toLowerCase().split(".").pop() ?? "";
  return normMime === "text/plain" || ext === "txt" || ext === "log";
}

/**
 * Performs OCR recognition with automatic fallback.
 * In "auto" mode: tries Google Cloud Vision first, falls back to Tesseract on failure.
 */
async function recognizeWithFallback(
  imageBuffer: Buffer,
  language: string,
  primaryProvider: OCRProvider,
): Promise<{ text: string; confidence?: number; engine: string }> {
  const mode = getProviderMode();

  // If mode is "auto" and we have both providers, try Google first then fallback
  if (mode === "auto" && googleVisionProvider) {
    try {
      const result = await googleVisionProvider.recognize(imageBuffer, language);
      return { ...result, engine: googleVisionProvider.name };
    } catch (visionError: any) {
      console.warn(
        `[Vigil.OS OCR] Google Cloud Vision failed, falling back to Tesseract: ${visionError.message}`
      );
      // Fallback to Tesseract
      try {
        const fallbackResult = await tesseractProvider.recognize(imageBuffer, language);
        return { ...fallbackResult, engine: `${tesseractProvider.name} (fallback)` };
      } catch (tesseractError: any) {
        throw new Error(
          `Both OCR engines failed. Vision: ${visionError.message}. Tesseract: ${tesseractError.message}`
        );
      }
    }
  }

  // Single provider mode
  const result = await primaryProvider.recognize(imageBuffer, language);
  return { ...result, engine: primaryProvider.name };
}

/**
 * Primary OCR Entry Point.
 * Processes document buffer, determines OCR necessity, extracts text,
 * and returns structured OCR metadata without touching the original file on disk.
 */
export async function processDocumentOCR(
  input: OCRProcessingInput,
  provider?: OCRProvider,
): Promise<OCRResult> {
  ensureProviders();

  const activeProvider = provider || defaultProvider;
  const startTime = Date.now();
  const lang = input.language || DEFAULT_OCR_LANGUAGE;
  const mimeType = (input.mimeType || "").toLowerCase();
  const filename = input.filename || "document";

  try {
    // ── 1. Digital PDF Handling ──────────────────────────────────
    if (isPdfFile(mimeType, filename)) {
      const pdfExtract = await extractFromPdf(input.fileBuffer);

      // If selectable text is already present, return it directly without running heavy OCR
      if (pdfExtract.hasSelectableText) {
        return {
          status: "COMPLETED",
          text: pdfExtract.text,
          source: "DIRECT_TEXT",
          language: lang,
          engine: "PDF Direct Text Engine",
          pageCount: pdfExtract.pageCount,
          processedAt: new Date().toISOString(),
          durationMs: Date.now() - startTime,
        };
      }

      // If scanned PDF with extracted image pages, execute OCR on the pages
      if (pdfExtract.extractedImages && pdfExtract.extractedImages.length > 0) {
        const pageTexts: string[] = [];
        let totalConfidence = 0;
        let confidenceCount = 0;
        let engineUsed = activeProvider.name;

        for (let i = 0; i < pdfExtract.extractedImages.length; i++) {
          const imgBuf = pdfExtract.extractedImages[i];
          if (!imgBuf) continue;
          try {
            const pageOcr = await recognizeWithFallback(imgBuf, lang, activeProvider);
            engineUsed = pageOcr.engine;
            if (pageOcr.text.trim()) {
              pageTexts.push(`--- Page ${i + 1} ---\n${pageOcr.text.trim()}`);
            }
            if (typeof pageOcr.confidence === "number") {
              totalConfidence += pageOcr.confidence;
              confidenceCount++;
            }
          } catch {
            // Proceed with next page if one fails
          }
        }

        const combinedText = pageTexts.join("\n\n").trim();
        const avgConfidence = confidenceCount > 0 ? Math.round(totalConfidence / confidenceCount) : undefined;

        if (combinedText.length > 0) {
          return {
            status: "COMPLETED",
            text: combinedText,
            source: "OCR_SCANNED_PDF",
            language: lang,
            engine: engineUsed,
            pageCount: pdfExtract.extractedImages.length,
            confidence: avgConfidence,
            processedAt: new Date().toISOString(),
            durationMs: Date.now() - startTime,
          };
        }
      }

      // If PDF text was minimal but present
      if (pdfExtract.text.trim()) {
        return {
          status: "COMPLETED",
          text: pdfExtract.text.trim(),
          source: "DIRECT_TEXT",
          language: lang,
          engine: "PDF Direct Text Engine",
          pageCount: pdfExtract.pageCount,
          processedAt: new Date().toISOString(),
          durationMs: Date.now() - startTime,
        };
      }

      // Completely empty or unreadable scanned PDF
      return {
        status: "COMPLETED",
        text: "[Empty or Non-Extractable Scanned Document Content]",
        source: "OCR_SCANNED_PDF",
        language: lang,
        engine: activeProvider.name,
        pageCount: pdfExtract.pageCount,
        processedAt: new Date().toISOString(),
        durationMs: Date.now() - startTime,
      };
    }

    // ── 2. Image OCR (PNG, JPG, JPEG, TIFF) ──────────────────────
    if (isImageFile(mimeType, filename)) {
      const ocrRes = await recognizeWithFallback(input.fileBuffer, lang, activeProvider);

      return {
        status: "COMPLETED",
        text: ocrRes.text,
        source: "OCR_IMAGE",
        language: lang,
        engine: ocrRes.engine,
        pageCount: 1,
        confidence: ocrRes.confidence,
        processedAt: new Date().toISOString(),
        durationMs: Date.now() - startTime,
      };
    }

    // ── 3. Plaintext Document Ingestion ──────────────────────────
    if (isPlaintextFile(mimeType, filename)) {
      const text = input.fileBuffer.toString("utf-8").trim();
      return {
        status: "COMPLETED",
        text,
        source: "DIRECT_TEXT",
        language: lang,
        engine: "Plaintext Ingestion Engine",
        pageCount: 1,
        processedAt: new Date().toISOString(),
        durationMs: Date.now() - startTime,
      };
    }

    // ── 4. Non-document / Unsupported File ───────────────────────
    return {
      status: "NOT_REQUIRED",
      text: "",
      source: "NOT_REQUIRED",
      language: lang,
      engine: "None",
      pageCount: 0,
      processedAt: new Date().toISOString(),
      durationMs: Date.now() - startTime,
    };
  } catch (err: any) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    // Security: Do not leak filesystem paths or sensitive content in error
    const sanitizedError = errorMsg.replace(/\b([A-Z]:\\[^\s]+|\/[^\s]+)/g, "[secure-path]");

    return {
      status: "FAILED",
      text: "",
      source: "NOT_REQUIRED",
      language: lang,
      engine: activeProvider.name,
      pageCount: 0,
      processedAt: new Date().toISOString(),
      durationMs: Date.now() - startTime,
      error: sanitizedError,
    };
  }
}
