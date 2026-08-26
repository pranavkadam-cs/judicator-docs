# Vigil.OS — Secure Digital Document Management System

Vigil.OS is a secure, modern, full-stack digital document management system designed for law enforcement agencies, courts, legal departments, and investigation teams to securely archive and manage sensitive legal files.

## Features

- **Role-Based Access Control (RBAC)**: Five distinct roles with progressive clearance levels:
  - `Admin`: User management, audit trail inspection, reclassification, signing, and asset lifecycle control.
  - `Investigator`: Case dossier management, document upload, reclassification, signing, and workflow approval.
  - `Legal Officer`: Docket retrieval, document upload, digital signing, and workflow approval.
  - `Court Officer`: Docket retrieval, document upload, and case status tracking.
  - `Viewer`: Read-only metadata inspection (clearance-gated).
- **Case Dossier Management**: Standard case fields (ID, title, priority, classification, jurisdiction, lead investigator, assigned officers, summary).
- **Workflow State Machine**: Document review process: `Draft` → `Under Review` → `Approved` / `Rejected` → `Sealed` → `Signed` → `Archived`.
- **Data Integrity & Security**:
  - SHA-256 client-side and server-side hashing on all file uploads.
  - Digital signatures using cryptographic identifiers (badge numbers + hash digests).
  - Tamper detection alert banner that flags any document with a hash mismatch.
- **Granular Document Sharing**: Secure access sharing between individual users with optional expiration dates and download permissions.
- **Audit Logging**: Comprehensive, immutable logs for all activities (logins, logouts, uploads, downloads, sharing, permissions, reclassifications).
- **Responsive Dashboard**: Beautiful charts summarizing document category distributions, case status, pending reviews, and recent activity.

## Setup Instructions

### Prerequisites
- Node.js (v18 or higher)
- npm (v9 or higher)

### Installation
1. Clone the repository and navigate to the directory:
   ```bash
   cd judicator-docs
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the local development server:
   ```bash
   npm run dev
   ```
4. Access the dashboard at `http://localhost:3000` (or the port shown in the terminal).

### Environment Variables
Configure the following in a `.env` file in the project root:
```env
# Optional S3 Gateway config. If not specified, falls back to local file storage.
LOVABLE_API_KEY=your-lovable-api-key
AWS_S3_API_KEY=your-aws-s3-connection-key
```

### Local Storage Architecture
- **Registry Database**: Persisted locally in `.data/registry.json`. This acts as the secure relational data store.
- **Local File Uploads**: Fallback storage operates in-memory for fast hot-reload development.
- **Future S3 Integration Point**: S3 storage is ready out-of-the-box. When `LOVABLE_API_KEY` and `AWS_S3_API_KEY` are provided, file transfers automatically route through pre-signed S3 upload/download URLs using the connector proxy in [`src/lib/s3.server.ts`](src/lib/s3.server.ts).

## Seed Credentials
Log in with the following demo users to test role capabilities:

| Email | Password | Role | Badge ID |
| :--- | :--- | :--- | :--- |
| `admin@vigil.os` | `admin123` | Admin | `REC-0001` |
| `investigator@vigil.os` | `invest123` | Investigator | `MH-1180` |
| `legal@vigil.os` | `legal123` | Legal Officer | `PP-0092` |
| `court@vigil.os` | `court123` | Court Officer | `MH-4471` |
| `viewer@vigil.os` | `viewer123` | Viewer | `FSL-303` |
