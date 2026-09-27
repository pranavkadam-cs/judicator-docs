import { useRef } from "react";
import type { CaseDocument, CaseFile, AuditEvent } from "@/lib/dms-types";
import { shortHash } from "@/lib/dms-types";
import { formatDate, formatBytes } from "@/components/dms/primitives";
import { Printer, ShieldCheck, Link2, FileText, Scale, Clock } from "lucide-react";

type Props = {
  document: CaseDocument;
  caseFile?: CaseFile | undefined;
  auditEvents: AuditEvent[];
  onClose: () => void;
};

export function IntegrityCertificate({ document: doc, caseFile, auditEvents, onClose }: Props) {
  const certRef = useRef<HTMLDivElement>(null);
  const current = doc.versions.find((v) => v.version === doc.currentVersion) ?? doc.versions[0];
  const docAudit = auditEvents.filter(
    (e) => e.targetId === doc.id || e.target === doc.name || e.target === doc.refId,
  );
  const certId = `CERT-${doc.refId}-${Date.now().toString(36).toUpperCase()}`;
  const issueDate = new Date().toISOString();

  function handlePrint() {
    const content = certRef.current;
    if (!content) return;
    const win = window.open("", "_blank", "width=900,height=1100");
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><title>Vigil.OS — Integrity Certificate ${doc.refId}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; color: #1a1a2e; background: #fff; padding: 40px; line-height: 1.5; }
  .cert-header { text-align: center; border-bottom: 3px double #334155; padding-bottom: 24px; margin-bottom: 24px; }
  .cert-header h1 { font-size: 28px; font-weight: 800; letter-spacing: 4px; text-transform: uppercase; color: #0f172a; }
  .cert-header .subtitle { font-size: 14px; color: #64748b; margin-top: 4px; letter-spacing: 1px; }
  .cert-id { font-family: monospace; font-size: 11px; color: #94a3b8; margin-top: 8px; }
  .section { margin-bottom: 20px; }
  .section-title { font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 2px; color: #475569; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; margin-bottom: 12px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .field-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: #94a3b8; }
  .field-value { font-size: 13px; font-weight: 600; color: #1e293b; margin-top: 2px; }
  .hash-box { background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 4px; padding: 12px; font-family: monospace; font-size: 11px; word-break: break-all; letter-spacing: 0.5px; color: #0f172a; font-weight: 600; margin-top: 6px; }
  .hash-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: #64748b; }
  .timeline-item { display: flex; gap: 12px; padding: 8px 0; border-bottom: 1px solid #f1f5f9; font-size: 12px; }
  .timeline-item:last-child { border-bottom: none; }
  .timeline-dot { width: 8px; height: 8px; border-radius: 50%; background: #3b82f6; margin-top: 5px; flex-shrink: 0; }
  .timeline-action { font-weight: 700; font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #475569; }
  .timeline-detail { color: #64748b; font-size: 11px; }
  .timeline-time { font-family: monospace; font-size: 10px; color: #94a3b8; }
  .footer { margin-top: 32px; border-top: 2px solid #e2e8f0; padding-top: 16px; text-align: center; }
  .footer .sig-line { width: 200px; border-bottom: 1px solid #94a3b8; margin: 24px auto 4px; }
  .footer .sig-label { font-size: 10px; color: #94a3b8; text-transform: uppercase; letter-spacing: 1.5px; }
  .integrity-badge { display: inline-block; background: #dcfce7; color: #166534; border: 1px solid #86efac; border-radius: 4px; padding: 4px 12px; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 1.5px; }
  .tamper-badge { background: #fef2f2; color: #991b1b; border-color: #fca5a5; }
  .version-row { display: grid; grid-template-columns: 80px 1fr 120px; gap: 8px; padding: 6px 0; border-bottom: 1px solid #f1f5f9; font-size: 11px; }
  .version-row:last-child { border-bottom: none; }
  @media print { body { padding: 20px; } }
</style>
</head><body>${content.innerHTML}
<script>window.onload = function() { window.print(); }</script>
</body></html>`);
    win.document.close();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="relative max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-sm border border-border bg-background shadow-2xl">
        {/* Toolbar */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-surface px-5 py-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-seal" />
            <span className="font-mono text-xs font-bold uppercase tracking-wider text-foreground">
              Document Integrity Certificate
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 rounded-sm bg-primary px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-wider text-primary-foreground hover:opacity-90 cursor-pointer"
            >
              <Printer className="size-3.5" />
              Print / Save PDF
            </button>
            <button
              onClick={onClose}
              className="rounded-sm border border-border bg-background px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-wider text-foreground hover:bg-accent cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>

        {/* Certificate Content */}
        <div ref={certRef} className="p-8 space-y-6 text-foreground">
          {/* Header */}
          <div className="cert-header" style={{ textAlign: "center", borderBottom: "3px double #334155", paddingBottom: "24px" }}>
            <h1 style={{ fontSize: "24px", fontWeight: 800, letterSpacing: "4px", textTransform: "uppercase" }}>⚖️ Vigil.OS</h1>
            <div className="subtitle" style={{ fontSize: "14px", color: "#64748b", marginTop: "4px", letterSpacing: "1px" }}>
              Document Integrity &amp; Chain of Custody Certificate
            </div>
            <div className="cert-id" style={{ fontFamily: "monospace", fontSize: "11px", color: "#94a3b8", marginTop: "8px" }}>
              Certificate ID: {certId} · Issued: {formatDate(issueDate)}
            </div>
          </div>

          {/* Integrity Status */}
          <div style={{ textAlign: "center", padding: "12px" }}>
            <span
              className={doc.status === "TAMPER_ALERT" ? "tamper-badge" : "integrity-badge"}
              style={{
                display: "inline-block",
                background: doc.status === "TAMPER_ALERT" ? "#fef2f2" : "#dcfce7",
                color: doc.status === "TAMPER_ALERT" ? "#991b1b" : "#166534",
                border: `1px solid ${doc.status === "TAMPER_ALERT" ? "#fca5a5" : "#86efac"}`,
                borderRadius: "4px",
                padding: "6px 16px",
                fontSize: "12px",
                fontWeight: 800,
                textTransform: "uppercase",
                letterSpacing: "2px",
              }}
            >
              {doc.status === "TAMPER_ALERT" ? "⚠ INTEGRITY COMPROMISED" : "✓ INTEGRITY VERIFIED"}
            </span>
          </div>

          {/* Document Metadata */}
          <div className="section">
            <div className="section-title" style={{ fontSize: "12px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "2px", color: "#475569", borderBottom: "1px solid #e2e8f0", paddingBottom: "6px", marginBottom: "12px" }}>
              Document Metadata
            </div>
            <div className="grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <div>
                <div className="field-label" style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.5px", color: "#94a3b8" }}>Document Name</div>
                <div className="field-value" style={{ fontSize: "13px", fontWeight: 600, color: "#1e293b", marginTop: "2px" }}>{doc.name}</div>
              </div>
              <div>
                <div className="field-label" style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.5px", color: "#94a3b8" }}>Reference ID</div>
                <div className="field-value" style={{ fontSize: "13px", fontWeight: 600, color: "#1e293b", marginTop: "2px" }}>{doc.refId}</div>
              </div>
              <div>
                <div className="field-label" style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.5px", color: "#94a3b8" }}>Category</div>
                <div className="field-value" style={{ fontSize: "13px", fontWeight: 600, color: "#1e293b", marginTop: "2px" }}>{doc.category}</div>
              </div>
              <div>
                <div className="field-label" style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.5px", color: "#94a3b8" }}>Classification</div>
                <div className="field-value" style={{ fontSize: "13px", fontWeight: 600, color: "#1e293b", marginTop: "2px" }}>{doc.classification}</div>
              </div>
              <div>
                <div className="field-label" style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.5px", color: "#94a3b8" }}>Case Dossier</div>
                <div className="field-value" style={{ fontSize: "13px", fontWeight: 600, color: "#1e293b", marginTop: "2px" }}>
                  {caseFile ? `${caseFile.caseNumber} — ${caseFile.title}` : doc.caseId}
                </div>
              </div>
              <div>
                <div className="field-label" style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.5px", color: "#94a3b8" }}>Workflow Status</div>
                <div className="field-value" style={{ fontSize: "13px", fontWeight: 600, color: "#1e293b", marginTop: "2px" }}>{doc.status.replace(/_/g, " ")}</div>
              </div>
              <div>
                <div className="field-label" style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.5px", color: "#94a3b8" }}>Storage Backend</div>
                <div className="field-value" style={{ fontSize: "13px", fontWeight: 600, color: "#1e293b", marginTop: "2px" }}>{doc.storage}</div>
              </div>
              <div>
                <div className="field-label" style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.5px", color: "#94a3b8" }}>Created</div>
                <div className="field-value" style={{ fontSize: "13px", fontWeight: 600, color: "#1e293b", marginTop: "2px" }}>{formatDate(doc.createdAt)}</div>
              </div>
            </div>
          </div>

          {/* Cryptographic Integrity */}
          <div className="section">
            <div className="section-title" style={{ fontSize: "12px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "2px", color: "#475569", borderBottom: "1px solid #e2e8f0", paddingBottom: "6px", marginBottom: "12px" }}>
              Cryptographic Integrity — SHA-256
            </div>
            <div className="hash-label" style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.5px", color: "#64748b" }}>
              Authoritative SHA-256 Digest (Current Version: {doc.currentVersion})
            </div>
            <div className="hash-box" style={{ background: "#f1f5f9", border: "1px solid #cbd5e1", borderRadius: "4px", padding: "12px", fontFamily: "monospace", fontSize: "11px", wordBreak: "break-all", letterSpacing: "0.5px", color: "#0f172a", fontWeight: 600, marginTop: "6px" }}>
              {current?.hash || "—"}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px", marginTop: "12px" }}>
              <div>
                <div className="field-label" style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.5px", color: "#94a3b8" }}>Algorithm</div>
                <div className="field-value" style={{ fontSize: "12px", fontWeight: 600, color: "#1e293b", marginTop: "2px" }}>SHA-256</div>
              </div>
              <div>
                <div className="field-label" style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.5px", color: "#94a3b8" }}>File Size</div>
                <div className="field-value" style={{ fontSize: "12px", fontWeight: 600, color: "#1e293b", marginTop: "2px" }}>{formatBytes(current?.size ?? 0)}</div>
              </div>
              <div>
                <div className="field-label" style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.5px", color: "#94a3b8" }}>Signature Status</div>
                <div className="field-value" style={{ fontSize: "12px", fontWeight: 600, color: current?.signatureBase64 ? "#166534" : "#94a3b8", marginTop: "2px" }}>
                  {current?.signatureBase64 ? "✓ RSA-SHA256 Signed" : current?.signature ? "Signed (Legacy)" : "Unsigned"}
                </div>
              </div>
            </div>
          </div>

          {/* RSA-SHA256 Digital Signature */}
          {current?.signatureBase64 && (
            <div className="section">
              <div className="section-title" style={{ fontSize: "12px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "2px", color: "#475569", borderBottom: "1px solid #e2e8f0", paddingBottom: "6px", marginBottom: "12px" }}>
                RSA-SHA256 Digital Signature Proof
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div>
                  <div className="field-label" style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.5px", color: "#94a3b8" }}>Signing Algorithm</div>
                  <div className="field-value" style={{ fontSize: "12px", fontWeight: 600, color: "#1e293b", marginTop: "2px" }}>{current.signatureAlgorithm || "RSA-SHA256"} ({current.signatureKeySize || 2048}-bit)</div>
                </div>
                <div>
                  <div className="field-label" style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.5px", color: "#94a3b8" }}>Signed By</div>
                  <div className="field-value" style={{ fontSize: "12px", fontWeight: 600, color: "#1e293b", marginTop: "2px" }}>{current.signedBy}</div>
                </div>
                <div>
                  <div className="field-label" style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.5px", color: "#94a3b8" }}>Badge / Credential</div>
                  <div className="field-value" style={{ fontSize: "12px", fontWeight: 600, color: "#1e293b", marginTop: "2px" }}>{current.signerBadge || "—"}</div>
                </div>
                <div>
                  <div className="field-label" style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.5px", color: "#94a3b8" }}>Role at Signing</div>
                  <div className="field-value" style={{ fontSize: "12px", fontWeight: 600, color: "#1e293b", marginTop: "2px" }}>{current.signerRole || "—"}</div>
                </div>
                <div>
                  <div className="field-label" style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.5px", color: "#94a3b8" }}>Signed At</div>
                  <div className="field-value" style={{ fontSize: "12px", fontWeight: 600, color: "#1e293b", marginTop: "2px" }}>{current.signedAt ? formatDate(current.signedAt) : "—"}</div>
                </div>
                <div>
                  <div className="field-label" style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.5px", color: "#94a3b8" }}>Self-Verified</div>
                  <div className="field-value" style={{ fontSize: "12px", fontWeight: 600, color: current.signatureVerified ? "#166534" : "#94a3b8", marginTop: "2px" }}>{current.signatureVerified ? "✓ Verified on creation" : "Not yet verified"}</div>
                </div>
              </div>
              {current.signatureId && (
                <div style={{ marginTop: "10px" }}>
                  <div className="hash-label" style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.5px", color: "#64748b" }}>Signature ID</div>
                  <div className="hash-box" style={{ background: "#f1f5f9", border: "1px solid #cbd5e1", borderRadius: "4px", padding: "8px", fontFamily: "monospace", fontSize: "11px", wordBreak: "break-all", color: "#0f172a", fontWeight: 600, marginTop: "4px" }}>
                    {current.signatureId}
                  </div>
                </div>
              )}
              {current.publicKeyFingerprint && (
                <div style={{ marginTop: "8px" }}>
                  <div className="hash-label" style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.5px", color: "#64748b" }}>Public Key Fingerprint (SHA-256)</div>
                  <div className="hash-box" style={{ background: "#f1f5f9", border: "1px solid #cbd5e1", borderRadius: "4px", padding: "8px", fontFamily: "monospace", fontSize: "10px", wordBreak: "break-all", color: "#0f172a", fontWeight: 500, marginTop: "4px", lineHeight: "1.6" }}>
                    {current.publicKeyFingerprint}
                  </div>
                </div>
              )}
              {current.signedHash && (
                <div style={{ marginTop: "8px" }}>
                  <div className="hash-label" style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.5px", color: "#64748b" }}>Signed Hash (SHA-256 of Document)</div>
                  <div className="hash-box" style={{ background: "#f1f5f9", border: "1px solid #cbd5e1", borderRadius: "4px", padding: "8px", fontFamily: "monospace", fontSize: "11px", wordBreak: "break-all", color: "#0f172a", fontWeight: 600, marginTop: "4px" }}>
                    {current.signedHash}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Version History */}
          <div className="section">
            <div className="section-title" style={{ fontSize: "12px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "2px", color: "#475569", borderBottom: "1px solid #e2e8f0", paddingBottom: "6px", marginBottom: "12px" }}>
              Version History &amp; Hash Log ({doc.versions.length} Versions)
            </div>
            <div style={{ fontSize: "10px", fontWeight: 700, display: "grid", gridTemplateColumns: "80px 1fr 140px", gap: "8px", padding: "6px 0", borderBottom: "2px solid #e2e8f0", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "1.5px" }}>
              <div>Version</div>
              <div>SHA-256 Digest</div>
              <div>Timestamp</div>
            </div>
            {doc.versions.map((v) => (
              <div key={v.version} style={{ display: "grid", gridTemplateColumns: "80px 1fr 140px", gap: "8px", padding: "6px 0", borderBottom: "1px solid #f1f5f9", fontSize: "11px" }}>
                <div style={{ fontWeight: 700 }}>{v.version}</div>
                <div style={{ fontFamily: "monospace", wordBreak: "break-all", fontSize: "10px" }}>{v.hash}</div>
                <div style={{ fontSize: "10px", color: "#64748b" }}>{formatDate(v.uploadedAt)}</div>
              </div>
            ))}
          </div>

          {/* Blockchain Anchor */}
          {current?.blockchain_tx_id && (
            <div className="section">
              <div className="section-title" style={{ fontSize: "12px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "2px", color: "#475569", borderBottom: "1px solid #e2e8f0", paddingBottom: "6px", marginBottom: "12px" }}>
                Blockchain Notarization Proof
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div>
                  <div className="field-label" style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.5px", color: "#94a3b8" }}>Transaction ID</div>
                  <div className="field-value" style={{ fontSize: "11px", fontFamily: "monospace", fontWeight: 600, color: "#1e293b", marginTop: "2px", wordBreak: "break-all" }}>{current.blockchain_tx_id}</div>
                </div>
                <div>
                  <div className="field-label" style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.5px", color: "#94a3b8" }}>Block Number</div>
                  <div className="field-value" style={{ fontSize: "13px", fontWeight: 600, color: "#1e293b", marginTop: "2px" }}>{current.blockchain_block ?? "—"}</div>
                </div>
              </div>
            </div>
          )}

          {/* OCR Intelligence */}
          {doc.ocr_status === "COMPLETED" && (
            <div className="section">
              <div className="section-title" style={{ fontSize: "12px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "2px", color: "#475569", borderBottom: "1px solid #e2e8f0", paddingBottom: "6px", marginBottom: "12px" }}>
                OCR Intelligence Summary
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
                <div>
                  <div className="field-label" style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.5px", color: "#94a3b8" }}>Engine</div>
                  <div className="field-value" style={{ fontSize: "12px", fontWeight: 600, color: "#1e293b", marginTop: "2px" }}>{doc.ocr_engine || "Auto"}</div>
                </div>
                <div>
                  <div className="field-label" style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.5px", color: "#94a3b8" }}>Language</div>
                  <div className="field-value" style={{ fontSize: "12px", fontWeight: 600, color: "#1e293b", marginTop: "2px" }}>{(doc.ocr_language || "eng").toUpperCase()}</div>
                </div>
                <div>
                  <div className="field-label" style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.5px", color: "#94a3b8" }}>Characters Extracted</div>
                  <div className="field-value" style={{ fontSize: "12px", fontWeight: 600, color: "#1e293b", marginTop: "2px" }}>{doc.ocr_text?.length ?? 0}</div>
                </div>
              </div>
              {doc.ocr_text && (
                <div style={{ marginTop: "12px" }}>
                  <div className="field-label" style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.5px", color: "#94a3b8", marginBottom: "4px" }}>Extracted Text Preview (first 500 chars)</div>
                  <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "4px", padding: "10px", fontFamily: "monospace", fontSize: "10px", color: "#334155", whiteSpace: "pre-wrap", maxHeight: "120px", overflow: "hidden" }}>
                    {doc.ocr_text.slice(0, 500)}{doc.ocr_text.length > 500 ? "…" : ""}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Chain of Custody */}
          <div className="section">
            <div className="section-title" style={{ fontSize: "12px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "2px", color: "#475569", borderBottom: "1px solid #e2e8f0", paddingBottom: "6px", marginBottom: "12px" }}>
              Chain of Custody — Audit Trail ({docAudit.length} Events)
            </div>
            {docAudit.slice(0, 20).map((e) => (
              <div key={e.id} className="timeline-item" style={{ display: "flex", gap: "12px", padding: "6px 0", borderBottom: "1px solid #f1f5f9", fontSize: "12px" }}>
                <div className="timeline-dot" style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#3b82f6", marginTop: "5px", flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div className="timeline-action" style={{ fontWeight: 700, fontSize: "10px", textTransform: "uppercase", letterSpacing: "1px", color: "#475569" }}>
                    {e.action.replace(/_/g, " ")}
                  </div>
                  <div className="timeline-detail" style={{ color: "#64748b", fontSize: "11px" }}>
                    {e.detail} — {e.actor} ({e.role})
                  </div>
                  <div className="timeline-time" style={{ fontFamily: "monospace", fontSize: "10px", color: "#94a3b8" }}>
                    {formatDate(e.at)} {e.hash ? `· Hash: ${shortHash(e.hash)}` : ""}
                  </div>
                </div>
              </div>
            ))}
            {docAudit.length === 0 && (
              <div style={{ padding: "16px", textAlign: "center", color: "#94a3b8", fontSize: "11px" }}>
                No audit events recorded for this document.
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="footer" style={{ marginTop: "32px", borderTop: "2px solid #e2e8f0", paddingTop: "16px", textAlign: "center" }}>
            <div style={{ fontSize: "10px", color: "#94a3b8", marginBottom: "16px" }}>
              This certificate is generated by Vigil.OS Secure Document Management System. The SHA-256 digest above
              cryptographically proves the document has not been altered since initial intake.
            </div>
            <div style={{ display: "flex", justifyContent: "space-around", marginTop: "24px" }}>
              <div>
                <div style={{ width: "180px", borderBottom: "1px solid #94a3b8", margin: "0 auto 4px" }} />
                <div style={{ fontSize: "10px", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "1.5px" }}>Authorized Signatory</div>
              </div>
              <div>
                <div style={{ width: "180px", borderBottom: "1px solid #94a3b8", margin: "0 auto 4px" }} />
                <div style={{ fontSize: "10px", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "1.5px" }}>Date &amp; Stamp</div>
              </div>
            </div>
            <div style={{ marginTop: "16px", fontFamily: "monospace", fontSize: "9px", color: "#cbd5e1", letterSpacing: "1px" }}>
              VIGIL.OS — SECURE DIGITAL DOCUMENT MANAGEMENT · SIH PROBLEM STATEMENT 26190 · MINISTRY OF HOME AFFAIRS
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
