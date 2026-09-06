/* ─────────────────────────────────────────────────────────────
 *  Vigil.OS / Judicator Docs — PDF Text & Image Extractor
 *  Extracts direct selectable text from digital PDFs, or extracts
 *  page images for scanned PDFs to feed into OCR.
 * ───────────────────────────────────────────────────────────── */

import { PDFParse } from "pdf-parse";

export interface PDFExtractionResult {
  hasSelectableText: boolean;
  text: string;
  pageCount: number;
  extractedImages?: Buffer[];
}

/**
 * Inspects a PDF buffer to extract selectable text directly.
 * If the PDF is scanned or image-based (no selectable text),
 * it returns hasSelectableText: false and extracts any embedded images for OCR.
 */
export async function extractFromPdf(pdfBuffer: Buffer): Promise<PDFExtractionResult> {
  if (!pdfBuffer || pdfBuffer.length === 0) {
    return {
      hasSelectableText: false,
      text: "",
      pageCount: 0,
    };
  }

  let parser: any = null;
  try {
    parser = new PDFParse({ data: pdfBuffer });
    const textResult = await parser.getText();

    const rawText = textResult?.text ?? "";
    const pageCount = textResult?.total ?? (Array.isArray(textResult?.pages) ? textResult.pages.length : 1);

    // Format text with clean page boundaries if multiple pages exist
    let formattedText = "";
    if (Array.isArray(textResult?.pages) && textResult.pages.length > 0) {
      formattedText = textResult.pages
        .map((p: any) => {
          const pageNum = p.num ?? 1;
          const pageContent = (p.text ?? "").trim();
          return pageContent ? `--- Page ${pageNum} ---\n${pageContent}` : "";
        })
        .filter(Boolean)
        .join("\n\n");
    } else {
      formattedText = rawText.trim();
    }

    // Check if the PDF has meaningful selectable text (not just whitespace, watermark, or empty pages)
    const alphanumericCount = (formattedText.match(/[a-zA-Z0-9\u0900-\u097F]/g) || []).length;
    const hasSelectableText = alphanumericCount >= 20;

    if (hasSelectableText) {
      return {
        hasSelectableText: true,
        text: formattedText,
        pageCount: Math.max(1, pageCount),
      };
    }

    // Scanned PDF detected: attempt image extraction for OCR
    const extractedImages = await extractEmbeddedImages(pdfBuffer, parser);

    return {
      hasSelectableText: false,
      text: formattedText, // Could be empty or minimal
      pageCount: Math.max(1, pageCount),
      extractedImages,
    };
  } catch (error) {
    // If parsing fails, attempt raw fallback extraction
    const rawImages = extractRawJpegStreams(pdfBuffer);
    return {
      hasSelectableText: false,
      text: "",
      pageCount: 1,
      extractedImages: rawImages,
    };
  } finally {
    if (parser && typeof parser.destroy === "function") {
      try {
        await parser.destroy();
      } catch {
        // Safe disposal
      }
    }
  }
}

/**
 * Attempts to extract embedded page images using PDF parser or raw streams.
 */
async function extractEmbeddedImages(pdfBuffer: Buffer, parser?: any): Promise<Buffer[]> {
  const images: Buffer[] = [];

  // Strategy 1: Use parser.getImage if available
  if (parser && typeof parser.getImage === "function") {
    try {
      const imgResult = await parser.getImage({ imageBuffer: true });
      if (Array.isArray(imgResult?.pages)) {
        for (const pg of imgResult.pages) {
          if (Array.isArray(pg.images)) {
            for (const img of pg.images) {
              if (img.data && (img.data instanceof Uint8Array || Buffer.isBuffer(img.data))) {
                images.push(Buffer.from(img.data));
              }
            }
          }
        }
      }
    } catch {
      // Fallback to raw stream scanning
    }
  }

  // Strategy 2: Extract raw JPEG / DCTDecode streams from PDF
  if (images.length === 0) {
    const rawJpegs = extractRawJpegStreams(pdfBuffer);
    images.push(...rawJpegs);
  }

  return images;
}

/**
 * Scans a PDF buffer for embedded JPEG images (/DCTDecode filter).
 * Most scanned legal documents store page scans as raw DCTDecode streams.
 */
export function extractRawJpegStreams(buffer: Buffer): Buffer[] {
  const images: Buffer[] = [];
  const str = buffer.toString("latin1");
  const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;

  let match: RegExpExecArray | null;
  while ((match = streamRegex.exec(str)) !== null) {
    const streamContent = match[1];
    if (!streamContent) continue;
    // Check if the stream starts with JPEG SOI marker 0xFFD8
    if (
      streamContent.charCodeAt(0) === 0xff &&
      streamContent.charCodeAt(1) === 0xd8
    ) {
      images.push(Buffer.from(streamContent, "latin1"));
    }
  }

  return images;
}
