import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/dms/shell";
import { Label, Panel } from "@/components/dms/primitives";
import {
  Shield,
  Lock,
  Eye,
  Cpu,
  Database,
  FileText,
  Users,
  Scale,
  Layers,
  CheckCircle2,
  ExternalLink,
  Fingerprint,
  Search,
  Activity,
  Globe,
  Code2,
} from "lucide-react";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About — Vigil.OS" },
      { name: "description", content: "Learn about Vigil.OS architecture, technology stack, and SIH 26190 problem statement alignment." },
    ],
  }),
  component: AboutPage,
});

const FEATURES = [
  {
    icon: <Lock className="size-5" />,
    title: "SHA-256 Forensic Integrity",
    description:
      "Every file is hashed client-side and server-side with SHA-256. Downloads pass through an active integrity gate that re-computes hashes in real-time.",
    color: "text-blue-400",
  },
  {
    icon: <Cpu className="size-5" />,
    title: "Dual-Layer Blockchain",
    description:
      "Document hashes are anchored permanently on Ethereum via a Solidity smart contract AND a local SHA-256 chained cryptographic ledger.",
    color: "text-purple-400",
  },
  {
    icon: <Eye className="size-5" />,
    title: "Tri-Engine OCR",
    description:
      "Intelligent text extraction from scanned documents using Tesseract.js WASM, Google Cloud Vision, or Google Gemini AI Vision with multi-language support.",
    color: "text-emerald-400",
  },
  {
    icon: <Shield className="size-5" />,
    title: "Role-Based Access Control",
    description:
      "Five clearance tiers (Viewer → Admin) with document security classifications from PUBLIC to TOP SECRET enforce strict access boundaries.",
    color: "text-amber-400",
  },
  {
    icon: <Activity className="size-5" />,
    title: "Document Workflow Engine",
    description:
      "Documents progress through DRAFT → UNDER_REVIEW → APPROVED → SEALED → SIGNED → ARCHIVED with full audit trail logging at every transition.",
    color: "text-cyan-400",
  },
  {
    icon: <Fingerprint className="size-5" />,
    title: "Tamper Detection & Simulation",
    description:
      "Live tamper simulation diagnostic flips file bytes to demonstrate the SHA-256 integrity gate blocking tampered downloads in real-time.",
    color: "text-red-400",
  },
  {
    icon: <Database className="size-5" />,
    title: "Hybrid Storage",
    description:
      "Seamlessly switches between local filesystem, Supabase Cloud (PostgreSQL + S3), and Google Cloud Storage for enterprise-grade deployment.",
    color: "text-teal-400",
  },
  {
    icon: <Search className="size-5" />,
    title: "Full-Text OCR Search",
    description:
      "Search across all OCR-extracted document text to locate evidence, keywords, and references across the entire case registry.",
    color: "text-indigo-400",
  },
];

const TECH_STACK = [
  { name: "React 19", category: "Frontend" },
  { name: "TypeScript 5.8", category: "Language" },
  { name: "TanStack Start", category: "Framework" },
  { name: "Vite 8", category: "Bundler" },
  { name: "TailwindCSS 4", category: "Styling" },
  { name: "Solidity 0.8.20", category: "Smart Contract" },
  { name: "Wagmi + Viem", category: "Web3" },
  { name: "Tesseract.js", category: "Local OCR" },
  { name: "Recharts", category: "Analytics" },
  { name: "Supabase", category: "Cloud DB" },
  { name: "Hardhat", category: "Contract Dev" },
  { name: "Zod", category: "Validation" },
];

const SIH_ALIGNMENT = [
  { requirement: "Secure storage of legal/investigation documents", status: "✓", implementation: "SHA-256 hashed storage with multi-backend support (Local/Supabase/GCS)" },
  { requirement: "Document integrity verification", status: "✓", implementation: "Client + server SHA-256 hashing, constant-time comparison, active download gate" },
  { requirement: "Tamper-proof record keeping", status: "✓", implementation: "Ethereum smart contract notarization + local SHA-256 chained ledger" },
  { requirement: "Access control & confidentiality", status: "✓", implementation: "5-tier RBAC with 5 security classifications (PUBLIC → TOP SECRET)" },
  { requirement: "Audit trail & chain of custody", status: "✓", implementation: "Comprehensive audit event logging with 28+ action types" },
  { requirement: "Document versioning", status: "✓", implementation: "Independent version hashes with full revision history" },
  { requirement: "Digital signatures", status: "✓", implementation: "Cryptographic signature application on sealed documents" },
  { requirement: "Document search & retrieval", status: "✓", implementation: "Full-text OCR search + metadata filters + classification-gated results" },
  { requirement: "Scalable architecture", status: "✓", implementation: "Hybrid cloud storage, Ethereum L1, enterprise-ready Hyperledger hooks" },
  { requirement: "AI/ML integration", status: "✓", implementation: "Google Gemini multimodal AI for advanced OCR + document intelligence" },
];

function AboutPage() {
  return (
    <AppShell title="About Vigil.OS" subtitle="System Architecture & Design">
      <div className="space-y-8">
        {/* Hero */}
        <Panel className="p-8 text-center space-y-4 bg-gradient-to-br from-primary/5 via-background to-primary/10 border-primary/20">
          <div className="flex items-center justify-center gap-3">
            <Shield className="size-10 text-primary" />
          </div>
          <h2 className="text-3xl font-bold tracking-tight text-foreground">
            Vigil.OS
          </h2>
          <p className="text-sm text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Forensic-grade digital document lifecycle management system with cryptographic
            integrity verification, multi-engine OCR, and dual-layer blockchain anchoring.
            Built for judiciary, law enforcement, and forensic investigation teams.
          </p>
          <div className="flex items-center justify-center gap-2 text-xs font-mono text-primary">
            <Scale className="size-3.5" />
            <span className="uppercase tracking-wider font-bold">
              Smart India Hackathon · Problem Statement 26190
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            Ministry of Home Affairs · Secure Digital Document Management for Legal &amp; Investigation Documents
          </p>
        </Panel>

        {/* Features Grid */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Layers className="size-4 text-primary" />
            <Label>Core Capabilities</Label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f) => (
              <Panel key={f.title} className="p-4 space-y-2 hover:border-primary/40 transition-colors">
                <div className={f.color}>{f.icon}</div>
                <h3 className="text-sm font-bold text-foreground">{f.title}</h3>
                <p className="text-[11px] text-muted-foreground leading-relaxed">{f.description}</p>
              </Panel>
            ))}
          </div>
        </div>

        {/* Architecture Diagram */}
        <Panel className="p-6 space-y-4">
          <div className="flex items-center gap-2 border-b border-border pb-3">
            <Globe className="size-4 text-primary" />
            <Label>System Architecture</Label>
          </div>
          <div className="bg-background rounded-sm border border-border p-6 overflow-x-auto">
            <div className="min-w-[600px] space-y-6">
              {/* Client Tier */}
              <div className="text-center">
                <div className="inline-flex items-center gap-2 rounded-sm bg-primary/10 border border-primary/30 px-4 py-2 text-xs font-bold text-primary uppercase tracking-wider">
                  <Users className="size-3.5" />
                  User / Investigator / Judge
                </div>
                <div className="mt-2 text-muted-foreground text-lg">↓</div>
              </div>

              {/* Frontend */}
              <div className="flex items-center justify-center gap-4">
                <div className="rounded-sm border border-blue-500/30 bg-blue-500/5 px-4 py-3 text-center">
                  <div className="text-[10px] font-mono uppercase text-blue-400 font-bold">MetaMask Connect</div>
                  <div className="text-xs text-foreground font-semibold mt-1">Wagmi / Viem Provider</div>
                </div>
                <div className="text-muted-foreground">→</div>
                <div className="rounded-sm border border-primary/30 bg-primary/5 px-6 py-3 text-center">
                  <div className="text-[10px] font-mono uppercase text-primary font-bold">Vigil.OS Frontend</div>
                  <div className="text-xs text-foreground font-semibold mt-1">React 19 + TanStack Start + TailwindCSS</div>
                </div>
                <div className="text-muted-foreground">→</div>
                <div className="rounded-sm border border-purple-500/30 bg-purple-500/5 px-4 py-3 text-center">
                  <div className="text-[10px] font-mono uppercase text-purple-400 font-bold">Alchemy RPC</div>
                  <div className="text-xs text-foreground font-semibold mt-1">DocumentNotary.sol</div>
                </div>
              </div>

              {/* Server Tier */}
              <div className="text-center text-muted-foreground text-lg">↓</div>
              <div className="grid grid-cols-4 gap-3">
                {[
                  { label: "Auth Engine", desc: "Session & RBAC", color: "border-blue-500/30" },
                  { label: "Crypto Engine", desc: "SHA-256 Digest", color: "border-emerald-500/30" },
                  { label: "DMS Engine", desc: "Case & Doc CRUD", color: "border-amber-500/30" },
                  { label: "OCR Service", desc: "Tri-Engine OCR", color: "border-purple-500/30" },
                ].map((s) => (
                  <div key={s.label} className={`rounded-sm border ${s.color} bg-surface p-3 text-center`}>
                    <div className="text-[10px] font-mono uppercase text-muted-foreground font-bold">{s.label}</div>
                    <div className="text-[11px] text-foreground mt-1">{s.desc}</div>
                  </div>
                ))}
              </div>

              {/* Storage Tier */}
              <div className="text-center text-muted-foreground text-lg">↓</div>
              <div className="grid grid-cols-4 gap-3">
                {[
                  { label: "Local Registry", desc: "JSON Database", color: "text-muted-foreground" },
                  { label: "Local Disk", desc: ".data/storage/", color: "text-muted-foreground" },
                  { label: "Supabase", desc: "DB + S3 Bucket", color: "text-emerald-400" },
                  { label: "SHA-256 Ledger", desc: "Chained Blocks", color: "text-blue-400" },
                ].map((s) => (
                  <div key={s.label} className="rounded-sm border border-border bg-background p-3 text-center">
                    <div className={`text-[10px] font-mono uppercase font-bold ${s.color}`}>{s.label}</div>
                    <div className="text-[11px] text-foreground mt-1">{s.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Panel>

        {/* SIH 26190 Alignment */}
        <Panel className="p-6 space-y-4">
          <div className="flex items-center gap-2 border-b border-border pb-3">
            <Scale className="size-4 text-primary" />
            <Label>SIH 26190 Problem Statement Alignment</Label>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-3 py-2 text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Requirement</th>
                  <th className="px-3 py-2 text-center font-mono text-[10px] uppercase tracking-wider text-muted-foreground w-16">Met</th>
                  <th className="px-3 py-2 text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Implementation</th>
                </tr>
              </thead>
              <tbody>
                {SIH_ALIGNMENT.map((row) => (
                  <tr key={row.requirement} className="border-b border-border/50">
                    <td className="px-3 py-2.5 font-semibold text-foreground">{row.requirement}</td>
                    <td className="px-3 py-2.5 text-center">
                      <CheckCircle2 className="size-4 text-seal mx-auto" />
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">{row.implementation}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        {/* Tech Stack */}
        <Panel className="p-6 space-y-4">
          <div className="flex items-center gap-2 border-b border-border pb-3">
            <Code2 className="size-4 text-primary" />
            <Label>Technology Stack</Label>
          </div>
          <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {TECH_STACK.map((t) => (
              <div key={t.name} className="flex items-center justify-between rounded-sm border border-border p-3 hover:border-primary/30 transition-colors">
                <span className="text-xs font-bold text-foreground">{t.name}</span>
                <span className="font-mono text-[9px] uppercase text-muted-foreground tracking-wider">{t.category}</span>
              </div>
            ))}
          </div>
        </Panel>

        {/* Test Suite */}
        <Panel className="p-6 space-y-4">
          <div className="flex items-center gap-2 border-b border-border pb-3">
            <CheckCircle2 className="size-4 text-seal" />
            <Label>Automated Test Suite — 23/23 Passing</Label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <div className="font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground">SHA-256 Integrity Tests (12)</div>
              {[
                "Upload → SHA-256 auto-generated",
                "Identical file → identical hash",
                "1-byte change → avalanche verified",
                "Untouched download → pass",
                "Tampered download → blocked",
                "Missing hash → not trusted",
                "Unauthorized clearance → blocked",
                "Large file → streaming hash",
                "Versioning → independent hashes",
                "Upload/download intact",
                "GCS adapter exports",
                "Supabase exports",
              ].map((t, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <CheckCircle2 className="size-3 text-seal shrink-0" />
                  <span className="text-foreground">{t}</span>
                </div>
              ))}
            </div>
            <div className="space-y-2">
              <div className="font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground">OCR Engine Tests (11)</div>
              {[
                "Digital PDF → direct extraction",
                "Image → routes to OCR",
                "Multi-language propagation",
                "Auto-hashing + OCR pipeline",
                "OCR failure containment",
                "Classified OCR RBAC gating",
                "Lightweight status query",
                "Manual re-run on archives",
                "Unsupported types handled",
                "Custom provider pluggability",
                "Gemini provider initialization",
              ].map((t, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <CheckCircle2 className="size-3 text-seal shrink-0" />
                  <span className="text-foreground">{t}</span>
                </div>
              ))}
            </div>
          </div>
        </Panel>

        {/* Footer */}
        <div className="text-center space-y-2 py-4">
          <div className="font-mono text-xs font-bold tracking-[0.3em] text-primary uppercase">
            Vigil.OS
          </div>
          <p className="text-[11px] text-muted-foreground">
            Securing Justice Through Cryptographic Integrity
          </p>
          <p className="font-mono text-[10px] text-muted-foreground/60 tracking-wider">
            Smart India Hackathon · Problem Statement 26190 · Ministry of Home Affairs
          </p>
        </div>
      </div>
    </AppShell>
  );
}
