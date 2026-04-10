import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const PDFDocument = require('/opt/homebrew/lib/node_modules/pdfkit');
const fs = require('fs');

const OUT = '/Users/priyo/Downloads/AI-Asset/DocProc/docproc-poc/demo-data/compliance-demo';

const BLUE = '#1F3864';
const ACCENT = '#2E75B6';
const GRAY = '#808080';
const RED = '#CC0000';

function createPDF(filename, config) {
  return new Promise((resolve) => {
    const doc = new PDFDocument({ size: 'LETTER', bufferPages: true, margins: { top: 72, bottom: 72, left: 72, right: 72 } });
    const stream = fs.createWriteStream(`${OUT}/${filename}`);
    doc.pipe(stream);

    // Title page
    doc.moveDown(6);
    doc.font('Helvetica-Bold').fontSize(24).fillColor(BLUE).text(config.company, { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(18).fillColor(ACCENT).text(config.title, { align: 'center' });
    doc.moveDown(2);

    // Info table
    doc.fontSize(10).fillColor('#333333').font('Helvetica');
    const infoX = 180;
    const info = config.info;
    for (const [label, value] of info) {
      doc.font('Helvetica-Bold').text(`${label}:`, infoX, doc.y, { continued: true, width: 130 });
      doc.font('Helvetica').text(`  ${value}`);
    }

    doc.addPage();

    // Content
    for (const section of config.sections) {
      if (section.type === 'h1') {
        doc.moveDown(0.5);
        doc.font('Helvetica-Bold').fontSize(14).fillColor(BLUE).text(section.text);
        doc.moveDown(0.3);
      } else if (section.type === 'h2') {
        doc.moveDown(0.3);
        doc.font('Helvetica-Bold').fontSize(12).fillColor(ACCENT).text(section.text);
        doc.moveDown(0.2);
      } else if (section.type === 'para') {
        doc.font('Helvetica').fontSize(10).fillColor('#333333').text(section.text, { lineGap: 2 });
        doc.moveDown(0.3);
      } else if (section.type === 'note') {
        doc.font('Helvetica-Oblique').fontSize(10).fillColor(section.color || GRAY).text(section.text, { lineGap: 2 });
        doc.moveDown(0.3);
      } else if (section.type === 'bullet') {
        doc.font('Helvetica').fontSize(10).fillColor('#333333');
        doc.text(`\u2022  ${section.text}`, { indent: 18, lineGap: 2 });
        doc.moveDown(0.15);
      }

      // Check if near bottom, add page
      if (doc.y > 680) {
        doc.addPage();
      }
    }

    // Footer on each page
    const pages = doc.bufferedPageRange();
    for (let i = 0; i < pages.count; i++) {
      doc.switchToPage(i);
      doc.font('Helvetica').fontSize(8).fillColor(GRAY);
      doc.text('CONFIDENTIAL', 72, 730, { align: 'center', width: 468 });
    }

    doc.end();
    stream.on('finish', () => {
      const size = (fs.statSync(`${OUT}/${filename}`).size / 1024).toFixed(0);
      console.log(`  \u2713 ${filename} (${size} KB)`);
      resolve();
    });
  });
}

// ── Document 1: IT Security Policy ──
const doc1 = {
  company: 'PT BANK DIGITAL NUSANTARA',
  title: 'INFORMATION TECHNOLOGY\nSECURITY POLICY',
  info: [
    ['Document No', 'ISP-2023-001'], ['Version', '3.2'],
    ['Effective Date', 'January 1, 2024'], ['Classification', 'Confidential'],
    ['Approved By', 'Board of Directors'], ['Next Review', 'December 15, 2024'],
  ],
  sections: [
    { type: 'h1', text: '1. IT GOVERNANCE STRUCTURE' },
    { type: 'para', text: 'PT Bank Digital Nusantara ("the Bank") maintains an IT governance framework aligned with the Bank\u2019s overall corporate governance. The Chief Information Security Officer (CISO) reports directly to the Board of Directors through the Risk Management Committee.' },
    { type: 'bullet', text: 'The IT Division is responsible for all technology operations, development, and security.' },
    { type: 'bullet', text: 'The CISO leads the Information Security function with a dedicated team of 12 security professionals.' },
    { type: 'bullet', text: 'IT strategy is reviewed semi-annually by the Board and aligns with the Bank\u2019s 5-year business plan.' },
    { type: 'bullet', text: 'IT budget allocation follows a risk-based prioritization model approved by the Finance Division.' },
    { type: 'note', text: 'Note: A formal IT Steering Committee has not yet been established. IT governance decisions are currently made through the existing Risk Management Committee structure.' },

    { type: 'h1', text: '2. IT RISK MANAGEMENT' },
    { type: 'para', text: 'The Bank identifies, assesses, and mitigates IT risks as part of the enterprise risk management framework.' },
    { type: 'bullet', text: 'Risk assessments are conducted annually, covering infrastructure, application, and data risks.' },
    { type: 'bullet', text: 'Risks are identified through department interviews and system audits.' },
    { type: 'bullet', text: 'Each risk is rated on a 3-level scale: Low, Medium, High.' },
    { type: 'bullet', text: 'Risk mitigation plans are reviewed by the IT Division Head.' },
    { type: 'bullet', text: 'A risk register is maintained and updated annually.' },
    { type: 'para', text: 'Key Risk Indicators (KRI) are tracked for system availability and data integrity. KRI threshold breaches are reported to management in the monthly operations report.' },

    { type: 'h1', text: '3. IT SECURITY CONTROLS' },
    { type: 'h2', text: '3.1 Access Control' },
    { type: 'bullet', text: 'All users are assigned role-based access credentials managed through Active Directory.' },
    { type: 'bullet', text: 'Multi-factor authentication (MFA) is mandatory for core banking and customer data systems.' },
    { type: 'bullet', text: 'Access reviews are conducted quarterly, with immediate revocation upon termination.' },
    { type: 'bullet', text: 'Privileged access requires approval from the CISO and is logged.' },
    { type: 'h2', text: '3.2 Network Security' },
    { type: 'bullet', text: 'Intrusion Detection Systems (IDS) are deployed on critical network segments.' },
    { type: 'bullet', text: 'Firewall rules are reviewed semi-annually.' },
    { type: 'bullet', text: 'VPN is required for all remote access to internal systems.' },
    { type: 'bullet', text: 'Network segmentation separates production, development, and DMZ environments.' },
    { type: 'h2', text: '3.3 Encryption' },
    { type: 'bullet', text: 'Data at rest: AES-256 encryption for all databases containing customer data.' },
    { type: 'bullet', text: 'Data in transit: TLS 1.2 minimum for all external communications.' },
    { type: 'bullet', text: 'Encryption keys are managed centrally with annual rotation.' },

    { type: 'h1', text: '4. DATA PROTECTION' },
    { type: 'para', text: 'The Bank implements a four-level data classification scheme:' },
    { type: 'bullet', text: 'Public: Marketing materials, press releases' },
    { type: 'bullet', text: 'Internal: Operational procedures, internal communications' },
    { type: 'bullet', text: 'Confidential: Customer account data, financial reports' },
    { type: 'bullet', text: 'Highly Confidential: Authentication credentials, encryption keys' },
    { type: 'para', text: 'Customer personal data is stored in the Bank\u2019s primary data center located in Jakarta. Cross-border data transfer requires written approval from the Compliance Division.' },
    { type: 'para', text: 'Data retention: Transaction records are retained for 5 years. Customer identification records are retained for 10 years in accordance with AML regulations.' },

    { type: 'h1', text: '5. VULNERABILITY MANAGEMENT' },
    { type: 'bullet', text: 'Vulnerability scans are performed monthly using automated scanning tools.' },
    { type: 'bullet', text: 'Penetration testing is conducted annually by an independent external firm.' },
    { type: 'bullet', text: 'Critical patches must be applied within 14 days of vendor release.' },
    { type: 'bullet', text: 'High-severity patches must be applied within 30 days.' },

    { type: 'h1', text: '6. INCIDENT RESPONSE' },
    { type: 'para', text: 'The Bank maintains an Incident Response Team (IRT) consisting of representatives from IT Security, Network Operations, and the Legal Division.' },
    { type: 'bullet', text: 'Level 1 (Critical): Data breach, core system compromise \u2014 escalate to CISO immediately' },
    { type: 'bullet', text: 'Level 2 (Major): Service disruption >2 hours, malware outbreak \u2014 escalate within 4 hours' },
    { type: 'bullet', text: 'Level 3 (Minor): Isolated incidents, policy violations \u2014 document within 1 business day' },
    { type: 'para', text: 'Post-incident reviews are conducted within 30 days of resolution.' },
    { type: 'note', text: 'Note: Formal incident reporting timelines to OJK have not yet been incorporated into this policy. The Compliance Division is developing a regulatory reporting procedure.', color: RED },

    { type: 'h1', text: '7. CYBERSECURITY AWARENESS' },
    { type: 'bullet', text: 'All employees complete annual cybersecurity awareness training.' },
    { type: 'bullet', text: 'IT and security personnel receive additional quarterly technical training.' },
    { type: 'bullet', text: 'Phishing simulation exercises are conducted semi-annually.' },

    { type: 'h1', text: '8. THIRD-PARTY MANAGEMENT' },
    { type: 'para', text: 'Third-party IT service providers are assessed during onboarding for security posture and financial stability. Contracts include SLA definitions and data protection clauses. Annual reviews of critical vendor performance are conducted.' },
  ],
};

// ── Document 2: Digital Payment Policy ──
const doc2 = {
  company: 'PT PAYMENTHUB INDONESIA',
  title: 'DIGITAL PAYMENT SERVICE POLICY',
  info: [
    ['Document No', 'DPS-2024-002'], ['Version', '2.1'],
    ['Effective Date', 'March 1, 2024'], ['Classification', 'Confidential'],
    ['Approved By', 'Board of Directors'], ['Next Review', 'February 15, 2025'],
  ],
  sections: [
    { type: 'h1', text: '1. INTRODUCTION' },
    { type: 'para', text: 'PT PaymentHub Indonesia (\u201Cthe Company\u201D) operates as a licensed Payment System Service Provider (Penyelenggara Jasa Sistem Pembayaran) under Bank Indonesia regulations. This policy governs the operation of our digital payment platform including mobile payments, QR code transactions, and e-wallet services.' },

    { type: 'h1', text: '2. PAYMENT SYSTEM GOVERNANCE' },
    { type: 'bullet', text: 'A Payment Operations Committee meets monthly to review transaction volumes, settlement accuracy, and system availability metrics.' },
    { type: 'bullet', text: 'The Chief Technology Officer oversees all payment infrastructure.' },
    { type: 'bullet', text: 'System availability target: 99.95% for all payment processing systems.' },
    { type: 'bullet', text: 'Transaction processing capacity: minimum 1,000 TPS during peak hours.' },

    { type: 'h1', text: '3. CUSTOMER DATA HANDLING' },
    { type: 'h2', text: '3.1 Data Collection' },
    { type: 'bullet', text: 'Customer data is collected during onboarding via eKYC (electronic Know Your Customer).' },
    { type: 'bullet', text: 'Minimum data collected: full name, ID number (KTP/Passport), date of birth, phone number.' },
    { type: 'bullet', text: 'Biometric data (facial recognition) is used for identity verification.' },
    { type: 'h2', text: '3.2 Data Storage' },
    { type: 'bullet', text: 'All customer data is stored in encrypted databases (AES-256) within Indonesian territory.' },
    { type: 'bullet', text: 'Payment credentials and tokens are stored in PCI-DSS certified infrastructure.' },
    { type: 'bullet', text: 'Data retention: Transaction records retained for 10 years per BI requirements.' },
    { type: 'h2', text: '3.3 Data Access' },
    { type: 'bullet', text: 'Access to customer data follows role-based access control (RBAC).' },
    { type: 'bullet', text: 'All access to production customer data is logged and auditable.' },
    { type: 'bullet', text: 'Data extraction requests require approval from the Data Protection Officer.' },

    { type: 'h1', text: '4. API SECURITY' },
    { type: 'bullet', text: 'All APIs use OAuth 2.0 authentication with JWT tokens.' },
    { type: 'bullet', text: 'API rate limiting: 100 requests/second per merchant, 1000 requests/second global.' },
    { type: 'bullet', text: 'All API communications use TLS 1.3 encryption.' },
    { type: 'bullet', text: 'API endpoints undergo security testing before deployment.' },
    { type: 'bullet', text: 'Webhook callbacks use HMAC-SHA256 signature verification.' },
    { type: 'bullet', text: 'API versioning follows semantic versioning (v1, v2) with 12-month deprecation notice.' },

    { type: 'h1', text: '5. AML/CFT PROCEDURES' },
    { type: 'bullet', text: 'Customer Due Diligence (CDD) during onboarding and periodic reviews.' },
    { type: 'bullet', text: 'Enhanced Due Diligence (EDD) for high-risk customers and transactions above IDR 100 million.' },
    { type: 'bullet', text: 'Transaction monitoring system flags suspicious patterns in real-time.' },
    { type: 'bullet', text: 'Suspicious Transaction Reports (STR) are filed with PPATK within 3 business days.' },
    { type: 'bullet', text: 'Currency Transaction Reports (CTR) for transactions above IDR 500 million filed monthly.' },
    { type: 'bullet', text: 'Sanctions screening against OFAC, UN, and Indonesian national lists.' },

    { type: 'h1', text: '6. TRANSACTION SECURITY' },
    { type: 'bullet', text: 'Real-time fraud detection using machine learning models.' },
    { type: 'bullet', text: 'Transaction limits: IDR 20 million per transaction, IDR 100 million daily.' },
    { type: 'bullet', text: 'Two-factor authentication for transactions above IDR 5 million.' },
    { type: 'bullet', text: 'Device binding and fingerprint verification for mobile transactions.' },

    { type: 'h1', text: '7. OPERATIONAL RESILIENCE' },
    { type: 'bullet', text: 'Primary data center in Jakarta with real-time replication to Surabaya DR site.' },
    { type: 'bullet', text: 'Automated failover with RTO of 30 minutes for payment processing.' },
    { type: 'bullet', text: 'Daily backup verification and quarterly DR testing.' },
    { type: 'bullet', text: 'Incident response team available 24/7 for payment system disruptions.' },
  ],
};

// ── Document 3: ISMS Policy ──
const doc3 = {
  company: 'PT DATAGUARD SOLUTIONS',
  title: 'INFORMATION SECURITY MANAGEMENT\nSYSTEM POLICY',
  info: [
    ['Document No', 'ISMS-2024-003'], ['Version', '4.0'],
    ['Effective Date', 'June 1, 2024'], ['Classification', 'Internal'],
    ['Approved By', 'Management Committee'], ['Next Review', 'May 20, 2025'],
  ],
  sections: [
    { type: 'h1', text: '1. ISMS SCOPE AND OBJECTIVES' },
    { type: 'para', text: 'PT DataGuard Solutions (\u201Cthe Company\u201D) establishes this Information Security Management System (ISMS) policy to protect the confidentiality, integrity, and availability of information assets.' },
    { type: 'bullet', text: 'All information processing facilities at our Jakarta headquarters' },
    { type: 'bullet', text: 'Cloud-hosted services on AWS Asia Pacific (Singapore) region' },
    { type: 'bullet', text: 'Remote work environments for all employees' },
    { type: 'bullet', text: 'Third-party data processing activities' },
    { type: 'para', text: 'Objectives:' },
    { type: 'bullet', text: 'Maintain ISO/IEC 27001:2022 certification' },
    { type: 'bullet', text: 'Achieve zero critical security incidents per quarter' },
    { type: 'bullet', text: 'Maintain 99.9% availability for client-facing services' },

    { type: 'h1', text: '2. ORGANIZATIONAL CONTROLS (A.5)' },
    { type: 'h2', text: '2.1 Information Security Policies' },
    { type: 'bullet', text: 'This policy is reviewed annually and approved by the Management Committee.' },
    { type: 'bullet', text: 'All employees acknowledge this policy upon onboarding and annually thereafter.' },
    { type: 'h2', text: '2.2 Information Security Roles' },
    { type: 'bullet', text: 'Chief Information Security Officer: overall ISMS responsibility' },
    { type: 'bullet', text: 'Information Security Managers: departmental security implementation' },
    { type: 'bullet', text: 'Data Protection Officer: GDPR and data privacy compliance' },
    { type: 'h2', text: '2.3 Threat Intelligence' },
    { type: 'bullet', text: 'The Company subscribes to threat intelligence feeds (MITRE ATT&CK, FS-ISAC).' },
    { type: 'bullet', text: 'Weekly threat briefings are distributed to the security team.' },
    { type: 'h2', text: '2.4 Supplier Relationships' },
    { type: 'bullet', text: 'Supplier security assessments are conducted before onboarding.' },
    { type: 'bullet', text: 'Annual security reviews for critical suppliers.' },
    { type: 'bullet', text: 'Contracts include information security requirements and audit rights.' },

    { type: 'h1', text: '3. ACCESS CONTROL AND IDENTITY MANAGEMENT (A.8)' },
    { type: 'h2', text: '3.1 Access Control Policy' },
    { type: 'bullet', text: 'Access is granted based on the principle of least privilege.' },
    { type: 'bullet', text: 'All access requires formal approval from the asset owner.' },
    { type: 'bullet', text: 'Access reviews are conducted quarterly for all systems.' },
    { type: 'h2', text: '3.2 Identity Management' },
    { type: 'bullet', text: 'Centralized identity management via Azure Active Directory.' },
    { type: 'bullet', text: 'Multi-factor authentication for all systems and applications.' },
    { type: 'bullet', text: 'Single Sign-On (SSO) for approved SaaS applications.' },
    { type: 'bullet', text: 'Password policy: minimum 14 characters, complexity requirements, 90-day rotation.' },
    { type: 'h2', text: '3.3 Privileged Access' },
    { type: 'bullet', text: 'Privileged accounts are managed through a PAM solution.' },
    { type: 'bullet', text: 'Just-in-time (JIT) access for administrative operations.' },
    { type: 'bullet', text: 'All privileged sessions are recorded and reviewed.' },

    { type: 'h1', text: '4. ENCRYPTION AND DATA PROTECTION (A.8)' },
    { type: 'h2', text: '4.1 Encryption Standards' },
    { type: 'bullet', text: 'Data at rest: AES-256 encryption for all databases and file storage.' },
    { type: 'bullet', text: 'Data in transit: TLS 1.3 for all external and internal communications.' },
    { type: 'bullet', text: 'Key management: HSM-based key storage with automated rotation every 90 days.' },
    { type: 'h2', text: '4.2 Data Classification' },
    { type: 'bullet', text: 'Level 1 (Public): No restrictions on disclosure' },
    { type: 'bullet', text: 'Level 2 (Internal): Available to all employees' },
    { type: 'bullet', text: 'Level 3 (Confidential): Restricted to authorized personnel' },
    { type: 'bullet', text: 'Level 4 (Restricted): Highest sensitivity, need-to-know basis only' },
    { type: 'h2', text: '4.3 Data Backup' },
    { type: 'bullet', text: 'Daily encrypted backups with 30-day retention.' },
    { type: 'bullet', text: 'Weekly offsite backup replication.' },
    { type: 'bullet', text: 'Monthly backup restoration testing.' },

    { type: 'h1', text: '5. DATA SUBJECT RIGHTS (GDPR Chapter III)' },
    { type: 'h2', text: '5.1 Right of Access (Article 15)' },
    { type: 'bullet', text: 'Data subjects may request access to their personal data.' },
    { type: 'bullet', text: 'Requests are processed within 30 days via our Data Rights Portal.' },
    { type: 'h2', text: '5.2 Right to Rectification (Article 16)' },
    { type: 'bullet', text: 'Data subjects may request correction of inaccurate personal data.' },
    { type: 'bullet', text: 'Corrections are applied within 7 business days.' },
    { type: 'h2', text: '5.3 Right to Erasure (Article 17)' },
    { type: 'bullet', text: 'Erasure requests are evaluated against legal retention obligations.' },
    { type: 'bullet', text: 'Approved erasure is executed within 30 days across all systems and backups.' },
    { type: 'h2', text: '5.4 Right to Data Portability (Article 20)' },
    { type: 'bullet', text: 'Data is provided in machine-readable format (JSON or CSV).' },
    { type: 'bullet', text: 'Transfer to another controller is facilitated upon request.' },
    { type: 'h2', text: '5.5 Data Breach Notification (Article 33/34)' },
    { type: 'bullet', text: 'Supervisory authority notification within 72 hours of breach discovery.' },
    { type: 'bullet', text: 'Data subject notification without undue delay if high risk to rights.' },
    { type: 'bullet', text: 'Breach register maintained with all incident details.' },

    { type: 'h1', text: '6. MONITORING AND REVIEW' },
    { type: 'bullet', text: 'SIEM platform monitors all security events in real-time.' },
    { type: 'bullet', text: 'Monthly vulnerability scans and quarterly penetration tests.' },
    { type: 'bullet', text: 'Annual internal ISMS audit conducted by the internal audit function.' },
    { type: 'bullet', text: 'External certification audit conducted annually by accredited body.' },
    { type: 'bullet', text: 'Management review meetings held quarterly.' },
  ],
};

async function main() {
  await createPDF('01-IT-Security-Policy-BankDigitalNusantara.pdf', doc1);
  await createPDF('02-Digital-Payment-Policy-PaymentHub.pdf', doc2);
  await createPDF('03-ISMS-Policy-DataGuard.pdf', doc3);
  console.log('\nDone! 3 PDFs saved.');
}

main().catch(console.error);
