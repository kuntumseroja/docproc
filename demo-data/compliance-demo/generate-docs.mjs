import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
        Header, Footer, AlignmentType, HeadingLevel, BorderStyle, WidthType,
        ShadingType, PageNumber, PageBreak, LevelFormat } = require('/opt/homebrew/lib/node_modules/docx');
const fs = require('fs');

const OUT = '/Users/priyo/Downloads/AI-Asset/DocProc/docproc-poc/demo-data/compliance-demo';

const border = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
const borders = { top: border, bottom: border, left: border, right: border };
const cellMargins = { top: 80, bottom: 80, left: 120, right: 120 };

function createDocStyles() {
  return {
    default: { document: { run: { font: "Arial", size: 22 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 32, bold: true, font: "Arial", color: "1F3864" },
        paragraph: { spacing: { before: 360, after: 200 }, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 26, bold: true, font: "Arial", color: "2E75B6" },
        paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 1 } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 24, bold: true, font: "Arial", color: "404040" },
        paragraph: { spacing: { before: 200, after: 100 }, outlineLevel: 2 } },
    ]
  };
}

function createNumbering() {
  return {
    config: [
      { reference: "bullets",
        levels: [{ level: 0, format: LevelFormat.BULLET, text: "\u2022", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
    ]
  };
}

function headerFooter(title, docNo) {
  return {
    headers: {
      default: new Header({ children: [
        new Paragraph({
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "2E75B6", space: 1 } },
          children: [
            new TextRun({ text: title, font: "Arial", size: 18, color: "2E75B6", bold: true }),
            new TextRun({ text: `\t${docNo}`, font: "Arial", size: 16, color: "808080" }),
          ],
          tabStops: [{ type: "right", position: 9360 }],
        })
      ] })
    },
    footers: {
      default: new Footer({ children: [
        new Paragraph({
          border: { top: { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC", space: 1 } },
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: "CONFIDENTIAL", font: "Arial", size: 16, color: "808080" }),
            new TextRun({ text: "  |  Page ", font: "Arial", size: 16, color: "808080" }),
            new TextRun({ children: [PageNumber.CURRENT], font: "Arial", size: 16, color: "808080" }),
          ],
        })
      ] })
    },
  };
}

function bullet(text) {
  return new Paragraph({
    numbering: { reference: "bullets", level: 0 },
    spacing: { after: 60 },
    children: [new TextRun({ text, size: 22 })],
  });
}

function para(text, opts = {}) {
  return new Paragraph({
    spacing: { after: 120 },
    children: [new TextRun({ text, size: 22, ...opts })],
  });
}

function heading(text, level) {
  return new Paragraph({ heading: level, children: [new TextRun(text)] });
}

function infoTable(rows) {
  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [3000, 6360],
    rows: rows.map(([label, value]) =>
      new TableRow({ children: [
        new TableCell({ borders, width: { size: 3000, type: WidthType.DXA }, margins: cellMargins,
          shading: { fill: "E8F0FE", type: ShadingType.CLEAR },
          children: [new Paragraph({ children: [new TextRun({ text: label, bold: true, size: 20, font: "Arial" })] })] }),
        new TableCell({ borders, width: { size: 6360, type: WidthType.DXA }, margins: cellMargins,
          children: [new Paragraph({ children: [new TextRun({ text: value, size: 20, font: "Arial" })] })] }),
      ] })
    ),
  });
}

// ════════════════════════════════════════════════════════════════
// DOCUMENT 1: IT Security Policy — PT Bank Digital Nusantara
// ════════════════════════════════════════════════════════════════
function createDoc1() {
  return new Document({
    styles: createDocStyles(),
    numbering: createNumbering(),
    sections: [{
      properties: {
        page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } },
        ...headerFooter("PT Bank Digital Nusantara", "ISP-2023-001"),
      },
      children: [
        // Title page content
        new Paragraph({ spacing: { before: 2400 }, alignment: AlignmentType.CENTER, children: [
          new TextRun({ text: "PT BANK DIGITAL NUSANTARA", size: 40, bold: true, font: "Arial", color: "1F3864" }),
        ] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 400 }, children: [
          new TextRun({ text: "INFORMATION TECHNOLOGY SECURITY POLICY", size: 32, bold: true, font: "Arial", color: "2E75B6" }),
        ] }),
        new Paragraph({ alignment: AlignmentType.CENTER, children: [] }),
        infoTable([
          ["Document No", "ISP-2023-001"],
          ["Version", "3.2"],
          ["Effective Date", "January 1, 2024"],
          ["Classification", "Confidential"],
          ["Approved By", "Board of Directors"],
          ["Next Review", "December 15, 2024"],
        ]),

        new Paragraph({ children: [new PageBreak()] }),

        // Section 1
        heading("1. IT GOVERNANCE STRUCTURE", HeadingLevel.HEADING_1),
        para("PT Bank Digital Nusantara (\"the Bank\") maintains an IT governance framework aligned with the Bank\u2019s overall corporate governance. The Chief Information Security Officer (CISO) reports directly to the Board of Directors through the Risk Management Committee."),
        para("Key governance elements:"),
        bullet("The IT Division is responsible for all technology operations, development, and security."),
        bullet("The CISO leads the Information Security function with a dedicated team of 12 security professionals."),
        bullet("IT strategy is reviewed semi-annually by the Board and aligns with the Bank\u2019s 5-year business plan."),
        bullet("IT budget allocation follows a risk-based prioritization model approved by the Finance Division."),
        para("Note: A formal IT Steering Committee has not yet been established. IT governance decisions are currently made through the existing Risk Management Committee structure.", { italics: true, color: "808080" }),

        // Section 2
        heading("2. IT RISK MANAGEMENT", HeadingLevel.HEADING_1),
        para("The Bank identifies, assesses, and mitigates IT risks as part of the enterprise risk management framework."),
        bullet("Risk assessments are conducted annually, covering infrastructure, application, and data risks."),
        bullet("Risks are identified through department interviews and system audits."),
        bullet("Each risk is rated on a 3-level scale: Low, Medium, High."),
        bullet("Risk mitigation plans are reviewed by the IT Division Head."),
        bullet("A risk register is maintained and updated annually."),
        para("Key Risk Indicators (KRI) are tracked for system availability and data integrity. KRI threshold breaches are reported to management in the monthly operations report."),

        // Section 3
        heading("3. IT SECURITY CONTROLS", HeadingLevel.HEADING_1),
        heading("3.1 Access Control", HeadingLevel.HEADING_2),
        bullet("All users are assigned role-based access credentials managed through Active Directory."),
        bullet("Multi-factor authentication (MFA) is mandatory for core banking and customer data systems."),
        bullet("Access reviews are conducted quarterly, with immediate revocation upon termination."),
        bullet("Privileged access requires approval from the CISO and is logged."),

        heading("3.2 Network Security", HeadingLevel.HEADING_2),
        bullet("Intrusion Detection Systems (IDS) are deployed on critical network segments."),
        bullet("Firewall rules are reviewed semi-annually."),
        bullet("VPN is required for all remote access to internal systems."),
        bullet("Network segmentation separates production, development, and DMZ environments."),

        heading("3.3 Encryption", HeadingLevel.HEADING_2),
        bullet("Data at rest: AES-256 encryption for all databases containing customer data."),
        bullet("Data in transit: TLS 1.2 minimum for all external communications."),
        bullet("Encryption keys are managed centrally with annual rotation."),

        // Section 4
        heading("4. DATA PROTECTION", HeadingLevel.HEADING_1),
        para("The Bank implements a four-level data classification scheme:"),
        bullet("Public: Marketing materials, press releases"),
        bullet("Internal: Operational procedures, internal communications"),
        bullet("Confidential: Customer account data, financial reports"),
        bullet("Highly Confidential: Authentication credentials, encryption keys"),
        para("Customer personal data is stored in the Bank\u2019s primary data center located in Jakarta. Cross-border data transfer requires written approval from the Compliance Division."),
        para("Data retention: Transaction records are retained for 5 years. Customer identification records are retained for 10 years in accordance with AML regulations."),

        // Section 5
        heading("5. VULNERABILITY MANAGEMENT", HeadingLevel.HEADING_1),
        bullet("Vulnerability scans are performed monthly using automated scanning tools."),
        bullet("Penetration testing is conducted annually by an independent external firm."),
        bullet("Critical patches must be applied within 14 days of vendor release."),
        bullet("High-severity patches must be applied within 30 days."),
        bullet("Patch compliance is reported monthly to the IT Division Head."),

        // Section 6
        heading("6. INCIDENT RESPONSE", HeadingLevel.HEADING_1),
        para("The Bank maintains an Incident Response Team (IRT) consisting of representatives from IT Security, Network Operations, and the Legal Division."),
        para("Incident classification:"),
        bullet("Level 1 (Critical): Data breach, core system compromise \u2014 escalate to CISO immediately"),
        bullet("Level 2 (Major): Service disruption >2 hours, malware outbreak \u2014 escalate within 4 hours"),
        bullet("Level 3 (Minor): Isolated incidents, policy violations \u2014 document within 1 business day"),
        para("Post-incident reviews are conducted within 30 days of resolution."),
        para("Note: Formal incident reporting timelines to OJK have not yet been incorporated into this policy. The Compliance Division is developing a regulatory reporting procedure.", { italics: true, color: "CC0000" }),

        // Section 7
        heading("7. CYBERSECURITY AWARENESS", HeadingLevel.HEADING_1),
        bullet("All employees complete annual cybersecurity awareness training."),
        bullet("IT and security personnel receive additional quarterly technical training."),
        bullet("Phishing simulation exercises are conducted semi-annually."),

        // Section 8
        heading("8. THIRD-PARTY MANAGEMENT", HeadingLevel.HEADING_1),
        para("Third-party IT service providers are assessed during onboarding for security posture and financial stability. Contracts include SLA definitions and data protection clauses. Annual reviews of critical vendor performance are conducted."),
      ],
    }],
  });
}

// ════════════════════════════════════════════════════════════════
// DOCUMENT 2: Digital Payment Service Policy — PT PaymentHub Indonesia
// ════════════════════════════════════════════════════════════════
function createDoc2() {
  return new Document({
    styles: createDocStyles(),
    numbering: createNumbering(),
    sections: [{
      properties: {
        page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } },
        ...headerFooter("PT PaymentHub Indonesia", "DPS-2024-002"),
      },
      children: [
        new Paragraph({ spacing: { before: 2400 }, alignment: AlignmentType.CENTER, children: [
          new TextRun({ text: "PT PAYMENTHUB INDONESIA", size: 40, bold: true, font: "Arial", color: "1F3864" }),
        ] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 400 }, children: [
          new TextRun({ text: "DIGITAL PAYMENT SERVICE POLICY", size: 32, bold: true, font: "Arial", color: "2E75B6" }),
        ] }),
        new Paragraph({ alignment: AlignmentType.CENTER, children: [] }),
        infoTable([
          ["Document No", "DPS-2024-002"],
          ["Version", "2.1"],
          ["Effective Date", "March 1, 2024"],
          ["Classification", "Confidential"],
          ["Approved By", "Board of Directors"],
          ["Next Review", "February 15, 2025"],
        ]),

        new Paragraph({ children: [new PageBreak()] }),

        heading("1. INTRODUCTION", HeadingLevel.HEADING_1),
        para("PT PaymentHub Indonesia (\u201Cthe Company\u201D) operates as a licensed Payment System Service Provider (Penyelenggara Jasa Sistem Pembayaran) under Bank Indonesia regulations. This policy governs the operation of our digital payment platform including mobile payments, QR code transactions, and e-wallet services."),

        heading("2. PAYMENT SYSTEM GOVERNANCE", HeadingLevel.HEADING_1),
        para("The Company maintains a governance structure for payment operations:"),
        bullet("A Payment Operations Committee meets monthly to review transaction volumes, settlement accuracy, and system availability metrics."),
        bullet("The Chief Technology Officer oversees all payment infrastructure."),
        bullet("System availability target: 99.95% for all payment processing systems."),
        bullet("Transaction processing capacity: minimum 1,000 TPS during peak hours."),
        para("All payment system changes undergo a formal change management process including impact assessment, testing in staging environment, and rollback procedures."),

        heading("3. CUSTOMER DATA HANDLING", HeadingLevel.HEADING_1),
        heading("3.1 Data Collection", HeadingLevel.HEADING_2),
        bullet("Customer data is collected during onboarding via eKYC (electronic Know Your Customer)."),
        bullet("Minimum data collected: full name, ID number (KTP/Passport), date of birth, phone number."),
        bullet("Biometric data (facial recognition) is used for identity verification."),

        heading("3.2 Data Storage", HeadingLevel.HEADING_2),
        bullet("All customer data is stored in encrypted databases (AES-256) within Indonesian territory."),
        bullet("Payment credentials and tokens are stored in PCI-DSS certified infrastructure."),
        bullet("Data retention: Transaction records retained for 10 years per BI requirements."),

        heading("3.3 Data Access", HeadingLevel.HEADING_2),
        bullet("Access to customer data follows role-based access control (RBAC)."),
        bullet("All access to production customer data is logged and auditable."),
        bullet("Data extraction requests require approval from the Data Protection Officer."),

        heading("4. API SECURITY", HeadingLevel.HEADING_1),
        para("The Company implements comprehensive API security measures:"),
        bullet("All APIs use OAuth 2.0 authentication with JWT tokens."),
        bullet("API rate limiting: 100 requests/second per merchant, 1000 requests/second global."),
        bullet("All API communications use TLS 1.3 encryption."),
        bullet("API endpoints undergo security testing before deployment."),
        bullet("Webhook callbacks use HMAC-SHA256 signature verification."),
        bullet("API versioning follows semantic versioning (v1, v2) with 12-month deprecation notice."),

        heading("5. AML/CFT PROCEDURES", HeadingLevel.HEADING_1),
        para("The Company implements Anti-Money Laundering and Counter-Terrorism Financing controls:"),
        bullet("Customer Due Diligence (CDD) during onboarding and periodic reviews."),
        bullet("Enhanced Due Diligence (EDD) for high-risk customers and transactions above IDR 100 million."),
        bullet("Transaction monitoring system flags suspicious patterns in real-time."),
        bullet("Suspicious Transaction Reports (STR) are filed with PPATK within 3 business days."),
        bullet("Currency Transaction Reports (CTR) for transactions above IDR 500 million filed monthly."),
        bullet("Sanctions screening against OFAC, UN, and Indonesian national lists."),

        heading("6. TRANSACTION SECURITY", HeadingLevel.HEADING_1),
        bullet("Real-time fraud detection using machine learning models."),
        bullet("Transaction limits: IDR 20 million per transaction, IDR 100 million daily."),
        bullet("Two-factor authentication for transactions above IDR 5 million."),
        bullet("Device binding and fingerprint verification for mobile transactions."),

        heading("7. OPERATIONAL RESILIENCE", HeadingLevel.HEADING_1),
        bullet("Primary data center in Jakarta with real-time replication to Surabaya DR site."),
        bullet("Automated failover with RTO of 30 minutes for payment processing."),
        bullet("Daily backup verification and quarterly DR testing."),
        bullet("Incident response team available 24/7 for payment system disruptions."),
      ],
    }],
  });
}

// ════════════════════════════════════════════════════════════════
// DOCUMENT 3: ISMS Policy — PT DataGuard Solutions
// ════════════════════════════════════════════════════════════════
function createDoc3() {
  return new Document({
    styles: createDocStyles(),
    numbering: createNumbering(),
    sections: [{
      properties: {
        page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } },
        ...headerFooter("PT DataGuard Solutions", "ISMS-2024-003"),
      },
      children: [
        new Paragraph({ spacing: { before: 2400 }, alignment: AlignmentType.CENTER, children: [
          new TextRun({ text: "PT DATAGUARD SOLUTIONS", size: 40, bold: true, font: "Arial", color: "1F3864" }),
        ] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 400 }, children: [
          new TextRun({ text: "INFORMATION SECURITY MANAGEMENT\nSYSTEM POLICY", size: 32, bold: true, font: "Arial", color: "2E75B6" }),
        ] }),
        new Paragraph({ alignment: AlignmentType.CENTER, children: [] }),
        infoTable([
          ["Document No", "ISMS-2024-003"],
          ["Version", "4.0"],
          ["Effective Date", "June 1, 2024"],
          ["Classification", "Internal"],
          ["Approved By", "Management Committee"],
          ["Next Review", "May 20, 2025"],
        ]),

        new Paragraph({ children: [new PageBreak()] }),

        heading("1. ISMS SCOPE AND OBJECTIVES", HeadingLevel.HEADING_1),
        para("PT DataGuard Solutions (\u201Cthe Company\u201D) establishes this Information Security Management System (ISMS) policy to protect the confidentiality, integrity, and availability of information assets. The ISMS scope covers:"),
        bullet("All information processing facilities at our Jakarta headquarters"),
        bullet("Cloud-hosted services on AWS Asia Pacific (Singapore) region"),
        bullet("Remote work environments for all employees"),
        bullet("Third-party data processing activities"),
        para("Objectives:"),
        bullet("Maintain ISO/IEC 27001:2022 certification"),
        bullet("Achieve zero critical security incidents per quarter"),
        bullet("Maintain 99.9% availability for client-facing services"),
        bullet("Ensure compliance with applicable data protection regulations"),

        heading("2. ORGANIZATIONAL CONTROLS (A.5)", HeadingLevel.HEADING_1),
        heading("2.1 Information Security Policies", HeadingLevel.HEADING_2),
        bullet("This policy is reviewed annually and approved by the Management Committee."),
        bullet("All employees acknowledge this policy upon onboarding and annually thereafter."),

        heading("2.2 Information Security Roles", HeadingLevel.HEADING_2),
        bullet("Chief Information Security Officer: overall ISMS responsibility"),
        bullet("Information Security Managers: departmental security implementation"),
        bullet("Data Protection Officer: GDPR and data privacy compliance"),
        bullet("All employees: responsible for protecting information assets in their custody"),

        heading("2.3 Threat Intelligence", HeadingLevel.HEADING_2),
        bullet("The Company subscribes to threat intelligence feeds (MITRE ATT&CK, FS-ISAC)."),
        bullet("Weekly threat briefings are distributed to the security team."),
        bullet("Quarterly threat landscape reviews are presented to management."),

        heading("2.4 Supplier Relationships", HeadingLevel.HEADING_2),
        bullet("Supplier security assessments are conducted before onboarding."),
        bullet("Annual security reviews for critical suppliers."),
        bullet("Contracts include information security requirements and audit rights."),

        heading("3. ACCESS CONTROL AND IDENTITY MANAGEMENT (A.8)", HeadingLevel.HEADING_1),
        heading("3.1 Access Control Policy", HeadingLevel.HEADING_2),
        bullet("Access is granted based on the principle of least privilege."),
        bullet("All access requires formal approval from the asset owner."),
        bullet("Access reviews are conducted quarterly for all systems."),

        heading("3.2 Identity Management", HeadingLevel.HEADING_2),
        bullet("Centralized identity management via Azure Active Directory."),
        bullet("Multi-factor authentication for all systems and applications."),
        bullet("Single Sign-On (SSO) for approved SaaS applications."),
        bullet("Password policy: minimum 14 characters, complexity requirements, 90-day rotation."),

        heading("3.3 Privileged Access", HeadingLevel.HEADING_2),
        bullet("Privileged accounts are managed through a PAM solution."),
        bullet("Just-in-time (JIT) access for administrative operations."),
        bullet("All privileged sessions are recorded and reviewed."),

        heading("4. ENCRYPTION AND DATA PROTECTION (A.8)", HeadingLevel.HEADING_1),
        heading("4.1 Encryption Standards", HeadingLevel.HEADING_2),
        bullet("Data at rest: AES-256 encryption for all databases and file storage."),
        bullet("Data in transit: TLS 1.3 for all external and internal communications."),
        bullet("Key management: HSM-based key storage with automated rotation every 90 days."),
        bullet("Certificate management: automated provisioning and renewal via ACME protocol."),

        heading("4.2 Data Classification", HeadingLevel.HEADING_2),
        bullet("Level 1 (Public): No restrictions on disclosure"),
        bullet("Level 2 (Internal): Available to all employees"),
        bullet("Level 3 (Confidential): Restricted to authorized personnel"),
        bullet("Level 4 (Restricted): Highest sensitivity, need-to-know basis only"),

        heading("4.3 Data Backup", HeadingLevel.HEADING_2),
        bullet("Daily encrypted backups with 30-day retention."),
        bullet("Weekly offsite backup replication."),
        bullet("Monthly backup restoration testing."),

        heading("5. DATA SUBJECT RIGHTS (GDPR Chapter III)", HeadingLevel.HEADING_1),
        heading("5.1 Right of Access (Article 15)", HeadingLevel.HEADING_2),
        bullet("Data subjects may request access to their personal data."),
        bullet("Requests are processed within 30 days via our Data Rights Portal."),
        bullet("Identity verification is required before data disclosure."),

        heading("5.2 Right to Rectification (Article 16)", HeadingLevel.HEADING_2),
        bullet("Data subjects may request correction of inaccurate personal data."),
        bullet("Corrections are applied within 7 business days."),

        heading("5.3 Right to Erasure (Article 17)", HeadingLevel.HEADING_2),
        bullet("Erasure requests are evaluated against legal retention obligations."),
        bullet("Approved erasure is executed within 30 days across all systems and backups."),
        bullet("A deletion certificate is provided to the data subject."),

        heading("5.4 Right to Data Portability (Article 20)", HeadingLevel.HEADING_2),
        bullet("Data is provided in machine-readable format (JSON or CSV)."),
        bullet("Transfer to another controller is facilitated upon request."),

        heading("5.5 Data Breach Notification (Article 33/34)", HeadingLevel.HEADING_2),
        bullet("Supervisory authority notification within 72 hours of breach discovery."),
        bullet("Data subject notification without undue delay if high risk to rights."),
        bullet("Breach register maintained with all incident details."),

        heading("6. MONITORING AND REVIEW", HeadingLevel.HEADING_1),
        bullet("SIEM platform monitors all security events in real-time."),
        bullet("Monthly vulnerability scans and quarterly penetration tests."),
        bullet("Annual internal ISMS audit conducted by the internal audit function."),
        bullet("External certification audit conducted annually by accredited body."),
        bullet("Management review meetings held quarterly."),
      ],
    }],
  });
}

// ── Generate all 3 documents ──────────────────────────────────
async function main() {
  const docs = [
    { name: "01-IT-Security-Policy-BankDigitalNusantara.docx", create: createDoc1 },
    { name: "02-Digital-Payment-Policy-PaymentHub.docx", create: createDoc2 },
    { name: "03-ISMS-Policy-DataGuard.docx", create: createDoc3 },
  ];

  for (const { name, create } of docs) {
    const doc = create();
    const buffer = await Packer.toBuffer(doc);
    fs.writeFileSync(`${OUT}/${name}`, buffer);
    console.log(`  \u2713 ${name} (${(buffer.length / 1024).toFixed(0)} KB)`);
  }

  console.log(`\nDone! 3 documents saved to ${OUT}/`);
}

main().catch(console.error);
