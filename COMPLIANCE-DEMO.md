# Compliance Module — Demo Showcase Guide

## Overview

The DocProc Compliance module enables business users to check organizational policy documents against regulatory frameworks and international standards. The platform ships with built-in knowledge of **8 regulations** spanning Indonesian banking law (POJK, PBI), U.S. cybersecurity standards (NIST CSF, HIPAA, SOX), international information security (ISO 27001), and EU data privacy (GDPR).

Users upload a policy document, select one or more applicable regulations, and receive an AI-generated compliance report with per-section pass/fail results, risk ratings, and actionable recommendations. A built-in compliance chat allows follow-up questions in English or Bahasa Indonesia.

---

## Prerequisites

```bash
# 1. Start infrastructure + services
./services.sh start all

# 2. Run database migrations
cd backend && .venv/bin/python -m alembic upgrade head

# 3. Seed demo data
cd backend && .venv/bin/python seed_demo.py

# 4. Open the app
open http://localhost:3000
```

**Required services:** PostgreSQL, Redis, MinIO (via Docker Compose), backend (FastAPI), frontend (React).

**LLM provider:** At minimum, Ollama running with `llama3.1:8b`. For cloud comparison demos, configure `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` in `.env`.

> **Note:** The compliance module works in demo/fallback mode even without a running LLM — the UI will display sample compliance results so you can walk through the interface.

---

## Demo Personas

| Role | Name | Email | Password | Focus |
|------|------|-------|----------|-------|
| IT Risk & Compliance Officer | Sarah Chen | `admin@docproc.demo` | `demo1234` | POJK 6/2022, NIST CSF |
| Finance & Payment Compliance | Lisa Wong | `finance@docproc.demo` | `demo1234` | PBI 23/2021, POJK 11/2022 |
| Data Privacy Auditor | James Park | `viewer@docproc.demo` | `demo1234` | ISO 27001, GDPR |

### Persona 1: Sarah Chen — IT Risk & Compliance Officer

Sarah is the IT Risk lead at a mid-size Indonesian bank. She is responsible for ensuring all IT policies comply with OJK regulations and international cybersecurity frameworks. In this demo she uploads an IT Security Policy and checks it against POJK 6/2022 (IT Risk Management) and NIST CSF 2.0.

- **Login:** `admin@docproc.demo` / `demo1234`
- **Role:** SME Admin (full access)
- **Scenario:** Upload the IT Security Policy for PT Bank Digital Nusantara and verify compliance gaps

### Persona 2: Lisa Wong — Finance & Payment Compliance

Lisa manages compliance for a digital payment provider. She verifies that operational policies meet Bank Indonesia payment system requirements and OJK digital banking rules. She frequently works in Bahasa Indonesia.

- **Login:** `finance@docproc.demo` / `demo1234`
- **Role:** SME (full access)
- **Scenario:** Check a Digital Payment Service Policy against PBI 23/2021 and POJK 11/2022

### Persona 3: James Park — Data Privacy Auditor

James is an external auditor reviewing information security practices against international standards. He has read-only access and uses the compliance chat to investigate specific control requirements.

- **Login:** `viewer@docproc.demo` / `demo1234`
- **Role:** Consumer (read-only)
- **Scenario:** Audit an ISMS policy against ISO 27001 and GDPR

---

## Demo Walkthrough

### Step 1 — Login and Navigate to Compliance

1. Open `http://localhost:3000` in your browser
2. Login as **Sarah Chen** (`admin@docproc.demo` / `demo1234`)
3. Click **Compliance** in the left sidebar navigation
4. The Compliance page loads with a two-panel layout:
   - **Left panel (40%):** Model selector, regulation picker, file upload, and "Run Compliance Check" button
   - **Right panel (60%):** Tabbed view with "Chat" and "Compliance Report" tabs

> **Presenter tip:** Point out the clean, focused layout. "This is designed for compliance officers who need to work quickly — select regulations, upload a document, and get results. No training required."

### Step 2 — Browse Available Regulations

1. Click the **Regulations** dropdown (FilterableMultiSelect)
2. Regulation cards are displayed grouped by country:

   **Indonesia**
   | Regulation | Issuer | Sections | Focus |
   |-----------|--------|----------|-------|
   | POJK No.6/POJK.03/2022 | OJK | 8 | IT Risk Management for Commercial Banks |
   | POJK No.11/POJK.03/2022 | OJK | 6 | Digital Banking Operations |
   | PBI No.23/6/PBI/2021 | Bank Indonesia | 5 | Payment System |

   **United States**
   | Regulation | Issuer | Sections | Focus |
   |-----------|--------|----------|-------|
   | NIST Cybersecurity Framework 2.0 | NIST | 6 | Critical Infrastructure Cybersecurity |
   | HIPAA | U.S. HHS | 4 | Health Information Privacy |
   | SOX | U.S. SEC | 4 | Financial Reporting & Internal Controls |

   **International**
   | Regulation | Issuer | Sections | Focus |
   |-----------|--------|----------|-------|
   | ISO/IEC 27001:2022 | ISO/IEC | 4 | Information Security Management Systems |

   **EU**
   | Regulation | Issuer | Sections | Focus |
   |-----------|--------|----------|-------|
   | GDPR | European Union | 5 | General Data Protection |

3. Click on a regulation card to see it highlighted with a blue border and light-blue background
4. Each card shows the regulation name, issuer, category tag (color-coded), and section count

> **Presenter tip:** "DocProc ships with Indonesian banking regulations out of the box — POJK, PBI, OJK circulars. The same platform handles NIST, ISO, GDPR, HIPAA, and SOX. Adding new regulations is just adding a JSON file."

### Step 3 — Select Regulations for Compliance Check

**For Sarah Chen's scenario:**

1. Type "POJK" in the regulation search box — the list filters to show POJK 6/2022 and POJK 11/2022
2. Select **POJK No.6/POJK.03/2022** (IT Risk Management)
3. Clear the search, type "NIST"
4. Select **NIST Cybersecurity Framework 2.0**
5. Both regulation cards now display with blue highlight borders
6. The selected regulations badge shows "2 selected" in the multi-select

> **Presenter tip:** "Sarah wants to check her bank's IT policy against both the local regulator's requirements and an international standard. Cross-regulation analysis is where DocProc really shines."

### Step 4 — Upload Document for Compliance Check

1. Drag and drop a PDF file into the file upload area (or click to browse)
   - For this demo, use **Example 1** below — save it as a PDF or paste into a `.txt` file
2. The uploaded file appears with a document icon, filename, and file size
3. The **Run Compliance Check** button becomes active (blue)
4. Click **Run Compliance Check**
5. A progress bar appears: "Analyzing document..." — it fills incrementally as the AI processes each regulation section
6. After 10-30 seconds (depending on model), a green notification appears: "Compliance check completed"

> **Presenter tip:** "The AI reads the entire document, then checks it section by section against every requirement in each selected regulation. For POJK 6/2022 alone, that is 8 sections with 43 specific requirements."

### Step 5 — Review Compliance Report

1. Click the **Compliance Report** tab in the right panel
2. The report displays:

   **Overall Score Gauge**
   - A circular gauge showing the overall compliance percentage (e.g., 72%)
   - Green (80%+), Yellow (50-79%), Red (below 50%)

   **Summary**
   - A plain-language paragraph summarizing the compliance posture
   - Model badge showing which AI provider/model generated the report (e.g., "Ollama / llama3.1:8b")

   **Quick Stats**
   - Four tiles showing counts: Compliant, Non-Compliant, Partial, N/A
   - Color-coded tags: green, red, yellow, gray

   **Findings Table**
   | Column | Description |
   |--------|-------------|
   | Section | The regulation section name |
   | Status | Compliant (green), Non-Compliant (red), Partial (yellow), N/A (gray) |
   | Findings | Specific observations about the document |
   | Risk Level | Low (teal), Medium (yellow), High (red), Critical (magenta) |

3. Walk through specific findings:
   - **IT Governance** — Partial: "CISO role defined but no IT Steering Committee documented"
   - **Incident Reporting** — Non-Compliant: "No 24-hour incident reporting procedure to OJK"
   - **Business Continuity** — Non-Compliant: "No BCP/DRP with RTO/RPO targets defined"
   - **Data Protection** — Compliant: "Four-level data classification and encryption standards documented"

4. Click **Export Report** to download the compliance report as a text file

> **Presenter tip:** "The AI provides specific, actionable findings — not generic advice. It tells you exactly which section is non-compliant and why. Notice the risk levels: the missing incident reporting is flagged as high risk because POJK 6/2022 requires reporting critical incidents within 1 hour."

### Step 6 — Compliance Chat

1. Click the **Chat** tab in the right panel
2. The empty state shows a Security icon with suggested questions:
   - "Apakah dokumen ini sesuai POJK 6/2022?"
   - "What NIST CSF controls are missing?"
   - "Summarize all non-compliant sections"
   - "What is the highest risk finding?"

3. Try the following questions organized by persona:

---

**Sarah Chen — IT Risk & Compliance (English)**

| # | Question | Expected Insight |
|---|----------|-----------------|
| 1 | "Which sections of POJK 6/2022 require incident reporting within 24 hours?" | Section 8 requires Level 2 incidents reported within 24 hours; Level 1 within 1 hour |
| 2 | "Compare our IT security policy gaps against NIST CSF Protect function" | Identifies missing access control reviews, supply chain risk management |
| 3 | "What are the cybersecurity requirements under POJK 6/2022 Section 7?" | SOC 24/7 monitoring, threat intelligence sharing, annual red team exercises |
| 4 | "Summarize all high-risk non-compliant findings" | Lists findings where risk_level is high or critical with remediation priority |
| 5 | "Does our policy meet the POJK requirement for a secondary data center?" | Section 5 requires a secondary DC at 60km minimum distance — not in our policy |
| 6 | "What is the maximum RTO allowed for core banking systems?" | 2 hours RTO, 1 hour RPO per POJK 6/2022 Section 5 |

---

**Lisa Wong — Payment & Finance Compliance (Bahasa Indonesia)**

| # | Question | Expected Insight |
|---|----------|-----------------|
| 7 | "Apa saja persyaratan keamanan data dalam PBI 23/2021?" | Data security requirements for payment system providers |
| 8 | "Jelaskan kewajiban pelaporan transaksi mencurigakan ke PPATK" | Suspicious transaction reporting obligations to PPATK |
| 9 | "Bagaimana ketentuan perlindungan konsumen untuk pembayaran digital?" | Consumer protection provisions for digital payments |
| 10 | "Apakah dokumen ini sudah sesuai dengan POJK 11/2022 tentang keamanan API?" | API security compliance status against POJK 11/2022 |
| 11 | "Apa persyaratan untuk cloud computing menurut POJK 11/2022?" | Cloud computing requirements under digital banking regulation |

---

**James Park — Data Privacy Audit (English)**

| # | Question | Expected Insight |
|---|----------|-----------------|
| 12 | "What ISO 27001 Annex A controls apply to our document handling?" | Lists applicable organizational, people, physical, and technological controls |
| 13 | "How does GDPR Article 17 right to erasure apply here?" | Data deletion procedures and their adequacy |
| 14 | "List all technological controls from ISO 27001 that we are missing" | Gap analysis against Annex A technological controls |
| 15 | "What are the people controls required under A.6?" | Screening, terms of employment, awareness, training, disciplinary process |
| 16 | "Does our encryption standard meet ISO 27001 requirements?" | Evaluates AES-256/TLS 1.2 against A.8 Technological Controls |

---

**Cross-Regulation Questions (any persona)**

| # | Question | Expected Insight |
|---|----------|-----------------|
| 17 | "Compare POJK 6/2022 data protection requirements with ISO 27001 technological controls" | Side-by-side mapping of Indonesian and international requirements |
| 18 | "Which NIST CSF categories overlap with POJK cybersecurity requirements?" | Maps NIST Protect/Detect/Respond to POJK Sections 3, 7, 8 |
| 19 | "Berikan ringkasan kepatuhan untuk semua regulasi yang dipilih" | Full compliance summary across all selected regulations in Bahasa |
| 20 | "What are the top 5 remediation priorities across all regulations?" | Prioritized action items considering risk level and regulatory impact |

> **Presenter tip:** "The compliance chat understands the full context — the uploaded document, selected regulations, and the compliance report. Users can drill into specific sections, compare frameworks, or ask in Bahasa Indonesia. This replaces hours of manual regulation reading."

### Step 7 — Switch Models and Compare

1. Locate the **Model** dropdown at the top of the left panel
2. Current selection shows the active model (e.g., "Ollama / llama3.1:8b")
3. Switch to **Anthropic / Claude Sonnet** (if `ANTHROPIC_API_KEY` is configured)
4. Ask the same question again: "Summarize all high-risk non-compliant findings"
5. Compare the response quality:
   - **Ollama (local):** Faster response, good for general analysis, runs on-premises
   - **Anthropic (cloud):** More detailed analysis, better regulatory language understanding
6. Note the model badge below each response showing provider, model name, and latency

> **Presenter tip:** "Zero vendor lock-in. For day-to-day compliance checks on sensitive documents, run everything on-premises with Ollama — no data leaves your infrastructure. For detailed regulatory analysis, switch to Claude or GPT-4o with one click."

---

## Example Documents for Demo

Copy the text below and save as a `.txt` or `.pdf` file for upload during the demo. Each document is written to produce interesting compliance gaps.

### Example 1: IT Security Policy (for POJK 6/2022 + NIST CSF)

> Use with **Sarah Chen** persona. Select POJK 6/2022 and NIST CSF 2.0.

```
PT BANK DIGITAL NUSANTARA
IT SECURITY POLICY
Document No: ISP-2024-001
Version: 3.2
Effective Date: January 1, 2024
Classification: Internal

1. INTRODUCTION AND SCOPE

This IT Security Policy establishes the information security framework for PT Bank Digital
Nusantara ("the Bank"), covering all IT systems, networks, applications, and data assets
used in banking operations. This policy applies to all employees, contractors, and
third-party service providers with access to the Bank's IT infrastructure.

2. IT GOVERNANCE STRUCTURE

The Bank maintains an IT governance structure aligned with regulatory requirements:
- The Chief Information Security Officer (CISO) reports directly to the Board of
  Directors and provides quarterly security briefings.
- The IT Division is responsible for implementing security controls and maintaining
  system availability targets of 99.9% for core banking applications.
- All IT investments exceeding IDR 500 million require Board approval.

Note: An IT Steering Committee is under consideration but has not yet been formally
established.

3. RISK MANAGEMENT FRAMEWORK

The Bank conducts annual IT risk assessments using a qualitative methodology:
- Risks are identified through department interviews and system audits.
- Each risk is rated on a 3-level scale: Low, Medium, High.
- Risk mitigation plans are reviewed by the IT Division Head.
- A risk register is maintained and updated annually.

Key Risk Indicators (KRI) are tracked for system availability and data integrity.
KRI threshold breaches are reported to management in the monthly operations report.

4. IT SECURITY CONTROLS

4.1 Access Control
- All users are assigned role-based access credentials managed through Active Directory.
- Multi-factor authentication (MFA) is mandatory for core banking and customer data systems.
- Access reviews are conducted quarterly, with immediate revocation upon termination.
- Privileged access requires approval from the CISO and is logged.

4.2 Network Security
- Intrusion Detection Systems (IDS) are deployed on critical network segments.
- Firewall rules are reviewed semi-annually.
- VPN is required for all remote access to internal systems.
- Network segmentation separates production, development, and DMZ environments.

4.3 Encryption
- Data at rest: AES-256 encryption for all databases containing customer data.
- Data in transit: TLS 1.2 minimum for all external communications.
- Encryption keys are managed centrally with annual rotation.

5. DATA PROTECTION

The Bank implements a four-level data classification scheme:
- Public: Marketing materials, press releases
- Internal: Operational procedures, internal communications
- Confidential: Customer account data, financial reports
- Highly Confidential: Authentication credentials, encryption keys

Customer personal data is stored in the Bank's primary data center located in Jakarta.
Cross-border data transfer requires written approval from the Compliance Division.

Data retention: Transaction records are retained for 5 years. Customer identification
records are retained for 10 years in accordance with AML regulations.

Audit trails are maintained for all access to customer data with 5-year retention.

6. VULNERABILITY MANAGEMENT

- Vulnerability scans are performed monthly using automated scanning tools.
- Penetration testing is conducted annually by an independent external firm.
- Critical patches must be applied within 14 days of vendor release.
- High-severity patches must be applied within 30 days.
- Patch compliance is reported monthly to the IT Division Head.

7. INCIDENT RESPONSE

The Bank maintains an Incident Response Team (IRT) consisting of representatives from
IT Security, Network Operations, and the Legal Division.

Incident classification:
- Level 1 (Critical): Data breach, core system compromise — escalate to CISO immediately
- Level 2 (Major): Service disruption >2 hours, malware outbreak — escalate within 4 hours
- Level 3 (Minor): Isolated incidents, policy violations — document within 1 business day

Post-incident reviews are conducted within 30 days of resolution.

Note: Formal incident reporting timelines to OJK have not yet been incorporated into
this policy. The Compliance Division is developing a regulatory reporting procedure.

8. CYBERSECURITY AWARENESS

All employees complete annual cybersecurity awareness training.
IT and security personnel receive additional quarterly technical training.
Phishing simulation exercises are conducted semi-annually.

9. THIRD-PARTY MANAGEMENT

Third-party IT service providers are assessed during onboarding for security posture
and financial stability. Contracts include SLA definitions and data protection clauses.
Annual reviews of critical vendor performance are conducted.

DOCUMENT APPROVAL
Approved by: Board of Directors
Date: December 15, 2023
Next Review: December 15, 2024
```

**Expected compliance gaps for POJK 6/2022:**
- Section 1 (IT Governance): **Partial** — No IT Steering Committee established
- Section 2 (Risk Management): **Partial** — Annual risk assessments instead of semi-annual; KRI breaches reported monthly instead of within 24 hours
- Section 5 (Business Continuity): **Non-Compliant** — No BCP/DRP documented, no RTO/RPO targets, no secondary data center
- Section 6 (Outsourcing): **Partial** — No OJK audit clause in contracts, no 30-day prior notification process
- Section 7 (Cybersecurity): **Partial** — No 24/7 SOC documented, no threat intelligence sharing forum participation, no red team exercises
- Section 8 (Incident Reporting): **Non-Compliant** — No OJK reporting timelines (1h/24h/3 days), post-incident review at 30 days vs required 14 days

---

### Example 2: Digital Payment Service Policy (for PBI 23/2021 + POJK 11/2022)

> Use with **Lisa Wong** persona. Select PBI 23/2021 and POJK 11/2022.

```
PT PAYMENTHUB INDONESIA
DIGITAL PAYMENT SERVICE POLICY
Document No: DPS-2024-002
Version: 2.1
Effective Date: March 1, 2024
Classification: Confidential

1. INTRODUCTION

PT PaymentHub Indonesia ("the Company") operates as a licensed Payment System Service
Provider (Penyelenggara Jasa Sistem Pembayaran) under Bank Indonesia regulations. This
policy governs the operation of our digital payment platform including mobile payments,
QR code transactions, and e-wallet services.

2. PAYMENT SYSTEM GOVERNANCE

The Company maintains a governance structure for payment operations:
- A Payment Operations Committee meets monthly to review transaction volumes,
  settlement accuracy, and system availability metrics.
- The Chief Technology Officer oversees all payment infrastructure.
- System availability target: 99.95% for all payment processing systems.
- Transaction processing capacity: minimum 1,000 TPS during peak hours.

All payment system changes undergo a formal change management process including
impact assessment, testing in staging environment, and rollback procedures.

3. CUSTOMER DATA HANDLING

3.1 Data Collection
- Customer data is collected during onboarding via eKYC (electronic Know Your Customer).
- Minimum data collected: full name, ID number (KTP/Passport), date of birth, phone number.
- Biometric data (facial recognition) is used for identity verification.

3.2 Data Storage
- All customer data is stored in encrypted databases (AES-256) within Indonesian territory.
- Payment credentials and tokens are stored in PCI-DSS certified infrastructure.
- Data retention: Transaction records retained for 10 years per BI requirements.

3.3 Data Access
- Access to customer data follows role-based access control (RBAC).
- All access to production customer data is logged and auditable.
- Data extraction requests require approval from the Data Protection Officer.

4. API SECURITY

The Company implements comprehensive API security measures:
- All APIs use OAuth 2.0 authentication with JWT tokens.
- API rate limiting: 100 requests/second per merchant, 1000 requests/second global.
- All API communications use TLS 1.3 encryption.
- API endpoints undergo security testing before deployment.
- Webhook callbacks use HMAC-SHA256 signature verification.
- API versioning follows semantic versioning (v1, v2) with 12-month deprecation notice.

5. AML/CFT PROCEDURES

The Company implements Anti-Money Laundering and Counter-Terrorism Financing controls:
- Customer Due Diligence (CDD) during onboarding and periodic reviews.
- Enhanced Due Diligence (EDD) for high-risk customers and transactions above
  IDR 100 million.
- Transaction monitoring system flags suspicious patterns in real-time.
- Suspicious Transaction Reports (STR) are filed with PPATK within 3 business days.
- Currency Transaction Reports (CTR) for transactions above IDR 500 million filed monthly.
- Sanctions screening against OFAC, UN, and Indonesian national lists.

6. TRANSACTION SECURITY

- Real-time fraud detection using machine learning models.
- Transaction limits: IDR 20 million per transaction, IDR 100 million daily.
- Two-factor authentication for transactions above IDR 5 million.
- Device binding and fingerprint verification for mobile transactions.

7. OPERATIONAL RESILIENCE

- Primary data center in Jakarta with real-time replication to Surabaya DR site.
- Automated failover with RTO of 30 minutes for payment processing.
- Daily backup verification and quarterly DR testing.
- Incident response team available 24/7 for payment system disruptions.

DOCUMENT APPROVAL
Approved by: Board of Directors
Date: February 15, 2024
Next Review: February 15, 2025
```

**Expected compliance gaps for PBI 23/2021 + POJK 11/2022:**
- **Consumer dispute resolution:** **Non-Compliant** — No consumer complaint handling or dispute resolution mechanism documented
- **Cloud computing controls:** **Non-Compliant** — No cloud computing risk assessment or controls per POJK 11/2022
- **Consumer protection disclosures:** **Partial** — No fee transparency or terms disclosure process documented
- **Channel security:** **Partial** — Mobile channel security documented but no web/USSD channel coverage
- **Product risk assessment:** **Non-Compliant** — No new product/service risk assessment process before launch

---

### Example 3: Information Security Management Policy (for ISO 27001 + GDPR)

> Use with **James Park** persona. Select ISO 27001:2022 and GDPR.

```
PT DATAGUARD SOLUTIONS
INFORMATION SECURITY MANAGEMENT SYSTEM POLICY
Document No: ISMS-2024-003
Version: 4.0
Effective Date: June 1, 2024
Classification: Internal

1. ISMS SCOPE AND OBJECTIVES

PT DataGuard Solutions ("the Company") establishes this Information Security Management
System (ISMS) policy to protect the confidentiality, integrity, and availability of
information assets. The ISMS scope covers:
- All information processing facilities at our Jakarta headquarters
- Cloud-hosted services on AWS Asia Pacific (Singapore) region
- Remote work environments for all employees
- Third-party data processing activities

Objectives:
- Maintain ISO/IEC 27001:2022 certification
- Achieve zero critical security incidents per quarter
- Maintain 99.9% availability for client-facing services
- Ensure compliance with applicable data protection regulations

2. ORGANIZATIONAL CONTROLS (A.5)

2.1 Information Security Policies
- This policy is reviewed annually and approved by the Management Committee.
- All employees acknowledge this policy upon onboarding and annually thereafter.

2.2 Information Security Roles
- Chief Information Security Officer: overall ISMS responsibility
- Information Security Managers: departmental security implementation
- Data Protection Officer: GDPR and data privacy compliance
- All employees: responsible for protecting information assets in their custody

2.3 Threat Intelligence
- The Company subscribes to threat intelligence feeds (MITRE ATT&CK, FS-ISAC).
- Weekly threat briefings are distributed to the security team.
- Quarterly threat landscape reviews are presented to management.

2.4 Supplier Relationships
- Supplier security assessments are conducted before onboarding.
- Annual security reviews for critical suppliers.
- Contracts include information security requirements and audit rights.

3. ACCESS CONTROL AND IDENTITY MANAGEMENT (A.8 — partial)

3.1 Access Control Policy
- Access is granted based on the principle of least privilege.
- All access requires formal approval from the asset owner.
- Access reviews are conducted quarterly for all systems.

3.2 Identity Management
- Centralized identity management via Azure Active Directory.
- Multi-factor authentication for all systems and applications.
- Single Sign-On (SSO) for approved SaaS applications.
- Password policy: minimum 14 characters, complexity requirements, 90-day rotation.

3.3 Privileged Access
- Privileged accounts are managed through a PAM solution.
- Just-in-time (JIT) access for administrative operations.
- All privileged sessions are recorded and reviewed.

4. ENCRYPTION AND DATA PROTECTION (A.8 — partial)

4.1 Encryption Standards
- Data at rest: AES-256 encryption for all databases and file storage.
- Data in transit: TLS 1.3 for all external and internal communications.
- Key management: HSM-based key storage with automated rotation every 90 days.
- Certificate management: automated provisioning and renewal via ACME protocol.

4.2 Data Classification
- Level 1 (Public): No restrictions on disclosure
- Level 2 (Internal): Available to all employees
- Level 3 (Confidential): Restricted to authorized personnel
- Level 4 (Restricted): Highest sensitivity, need-to-know basis only

4.3 Data Backup
- Daily encrypted backups with 30-day retention.
- Weekly offsite backup replication.
- Monthly backup restoration testing.

5. DATA SUBJECT RIGHTS (GDPR Chapter III)

5.1 Right of Access (Article 15)
- Data subjects may request access to their personal data.
- Requests are processed within 30 days via our Data Rights Portal.
- Identity verification is required before data disclosure.

5.2 Right to Rectification (Article 16)
- Data subjects may request correction of inaccurate personal data.
- Corrections are applied within 7 business days.

5.3 Right to Erasure (Article 17)
- Erasure requests are evaluated against legal retention obligations.
- Approved erasure is executed within 30 days across all systems and backups.
- A deletion certificate is provided to the data subject.

5.4 Right to Data Portability (Article 20)
- Data is provided in machine-readable format (JSON or CSV).
- Transfer to another controller is facilitated upon request.

5.5 Data Breach Notification (Article 33/34)
- Supervisory authority notification within 72 hours of breach discovery.
- Data subject notification without undue delay if high risk to rights.
- Breach register maintained with all incident details.

6. MONITORING AND REVIEW

- SIEM platform monitors all security events in real-time.
- Monthly vulnerability scans and quarterly penetration tests.
- Annual internal ISMS audit conducted by the internal audit function.
- External certification audit conducted annually by accredited body.
- Management review meetings held quarterly.

DOCUMENT APPROVAL
Approved by: Management Committee
Date: May 20, 2024
Next Review: May 20, 2025
```

**Expected compliance gaps for ISO 27001 + GDPR:**
- **Physical controls (A.7):** **Non-Compliant** — No physical security controls documented (secure areas, equipment protection, media handling)
- **People controls (A.6):** **Non-Compliant** — No screening procedures, terms and conditions of employment, security awareness training, or disciplinary process documented
- **GDPR consent management:** **Partial** — Data subject rights documented but no lawful basis / consent mechanism described
- **GDPR DPIA:** **Non-Compliant** — No Data Protection Impact Assessment process documented
- **Incident management (A.5.24-28):** **Partial** — Breach notification documented but no formal incident management planning or evidence collection procedures

---

## Talking Points for Presenter

Use these key messages throughout the demo:

1. **Local regulation expertise:** "DocProc supports Indonesian banking regulations out of the box — POJK, PBI, OJK circulars. Compliance teams do not need to manually cross-reference 100-page regulation documents."

2. **International standards:** "The same platform handles NIST CSF, ISO 27001, GDPR, HIPAA, and SOX. One tool for local and international compliance."

3. **Specific, actionable findings:** "The AI provides specific findings with risk levels and section references, not generic advice. It tells you which POJK section you are failing and exactly what is missing."

4. **Bilingual support:** "The compliance chat supports Bahasa Indonesia for local compliance teams. Ask in Bahasa, get answers in Bahasa — with the same regulatory accuracy."

5. **Data sovereignty:** "For sensitive documents — bank policies, financial data — run everything on-premises with Ollama. No data leaves your infrastructure. Switch to cloud APIs when you need deeper analysis."

6. **Cross-regulation analysis:** "Ask DocProc to compare POJK requirements with NIST or ISO 27001. It maps equivalent controls across frameworks, saving hours of manual cross-referencing."

7. **Compliance democratization:** "Business users can verify compliance without specialized legal or regulatory training. The AI translates dense regulation language into plain findings."

8. **Audit trail:** "Every compliance check is logged — which document, which regulations, which model, what score. Ready for internal audit and regulatory examination."

---

## Demo Timing Guide

| Segment | Duration | Steps |
|---------|----------|-------|
| Login and navigation | 1 min | Step 1 |
| Browse regulations | 2 min | Step 2 |
| Select and upload | 2 min | Steps 3-4 |
| Review compliance report | 4 min | Step 5 |
| Compliance chat (5-6 questions) | 5 min | Step 6 |
| Model comparison | 2 min | Step 7 |
| **Total** | **~16 min** | |

For an extended demo (25 min), repeat Steps 3-6 with a second persona and different regulations.

---

## API Walkthrough (Technical Demo)

```bash
# --- Authentication ---

TOKEN=$(curl -s -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@docproc.demo","password":"demo1234"}' | jq -r '.access_token')

# --- List available regulations ---

curl -s http://localhost:8000/api/v1/compliance/regulations \
  -H "Authorization: Bearer $TOKEN" | jq

# --- Run compliance check ---

curl -s -X POST http://localhost:8000/api/v1/compliance/check \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@it_security_policy.pdf" \
  -F 'regulation_ids=["pojk-6-2022","nist-csf-2-0"]' | jq

# --- Compliance chat ---

curl -s -X POST http://localhost:8000/api/v1/compliance/chat \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Which sections of POJK 6/2022 require incident reporting within 24 hours?",
    "regulation_ids": ["pojk-6-2022"],
    "has_document": true
  }' | jq

# --- Switch model ---

curl -s -X PUT http://localhost:8000/api/v1/models/current \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"provider":"anthropic","model":"claude-sonnet-4-20250514"}' | jq
```

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Compliance page blank / no regulations | Check backend is running: `./services.sh status` — the page falls back to demo data if API is unreachable |
| "Run Compliance Check" button disabled | Ensure both a regulation is selected AND a file is uploaded |
| Compliance check hangs at 90% | LLM may be slow — check Ollama logs: `docker compose logs ollama` |
| Chat returns generic responses | Verify LLM provider is configured: check `.env` for `LLM_PROVIDER` and API keys |
| Model dropdown is empty | The `/api/v1/models/available` endpoint may not be responding — check backend logs |
| Bahasa questions get English responses | Some smaller models default to English — switch to a larger model or Anthropic |
| Login fails (401) | Run `cd backend && .venv/bin/python seed_demo.py` to ensure demo users exist |
| Regulation JSON not loading | Verify files exist: `ls backend/app/data/regulations/` |
| Export report button missing | Export only appears after a compliance report is generated |
| Slow response on Ollama | Ensure sufficient RAM (8GB+ recommended for llama3.1:8b) — check `docker stats` |

---

## ESG Compliance Scenario (LON-158)

### Overview

The ESG scenario extends the Compliance module with **sustainability reporting frameworks** to check ESG/Sustainability Reports against Indonesian regulations and international standards. This enables comparison with real-world benchmarks like BNI's published Sustainability Report 2025.

### Additional ESG Frameworks

| Regulation | Issuer | Sections | Focus |
|-----------|--------|----------|-------|
| POJK No.51/POJK.03/2017 | OJK | 8 | Sustainable Finance Implementation |
| SASB Commercial Banks (FN-CB) | SASB/ISSB | 6 | ESG Disclosure for Commercial Banks |
| IFRS S1 | ISSB/IFRS Foundation | 4 | General Sustainability Disclosures |
| IFRS S2 | ISSB/IFRS Foundation | 6 | Climate-related Disclosures |

### ESG Persona

| Role | Name | Email | Password | Focus |
|------|------|-------|----------|-------|
| ESG & Sustainability Officer | Sarah Chen | `admin@docproc.demo` | `demo1234` | POJK 51, SASB, ISSB, BNI benchmark comparison |

### ESG Demo Walkthrough

#### ESG Step 1 — Login and Select ESG Regulations

1. Login as **Sarah Chen** (`admin@docproc.demo` / `demo1234`)
2. Navigate to **Compliance**
3. Open the **Regulations** dropdown
4. Select the following ESG frameworks:
   - **POJK No.51/POJK.03/2017** (Sustainable Finance)
   - **SASB Commercial Banks (FN-CB)**
   - **IFRS S2** (Climate-related Disclosures)
5. The regulation cards appear grouped — note the `esg_sustainability` category tags

> **Presenter tip:** "For ESG compliance, DocProc ships with POJK 51 — the OJK mandate for sustainable finance — alongside SASB and ISSB international standards. Banks like BNI are required to report against POJK 51, and investors increasingly demand SASB/ISSB alignment."

#### ESG Step 2 — Upload ESG Report

1. Upload the file **04-ESG-Sustainability-Report-BankNusantara.txt** from `demo-data/compliance-demo/`
   - This is a fictional bank "PT Bank Nusantara Hijau" with deliberate compliance gaps
2. Click **Run Compliance Check**
3. Wait for the AI to analyze each regulation section (~30-90 seconds per regulation with Ollama)

> **Presenter tip:** "The AI reads the full sustainability report and checks each metric, disclosure, and governance requirement against the selected frameworks — the same analysis that would take a sustainability team days to perform manually."

#### ESG Step 3 — Review ESG Compliance Report

Switch to the **Compliance Report** tab. Expected findings:

**POJK 51/POJK.03/2017 Findings:**

| Section | Status | Key Finding |
|---------|--------|-------------|
| Responsible Investment | ✅ Compliant | ESG integrated in investment policy, negative screening applied |
| Sustainable Business Strategy | ⚠️ Partial | No RAKB (Sustainable Finance Action Plan) filed with OJK |
| Social & Environmental Risk Mgmt | ⚠️ Partial | ESG screening only for loans >IDR 50B (54% of book unscreened) |
| Informative Communication | ❌ Non-Compliant | No independent assurance/verification of sustainability data |
| Priority Sector Development | ✅ Compliant | 23.4% green portfolio, IDR 58T green financing |
| Inclusiveness | ✅ Compliant | 150K financial literacy participants, MSME focus |
| Coordination & Collaboration | ⚠️ Partial | Member of industry forums but no formal partnerships documented |

**SASB FN-CB Findings:**

| Section | Status | Key Finding |
|---------|--------|-------------|
| Data Security (FN-CB-230a) | ❌ Non-Compliant | 2 data breaches (47K accounts affected) NOT disclosed in report |
| Financial Inclusion (FN-CB-240a) | ✅ Compliant | 150K financial literacy participants, community lending programs |
| ESG Integration (FN-CB-410a) | ⚠️ Partial | ESG only in corporate segment, no industry exposure breakdown |
| Financed Emissions (FN-CB-410b) | ❌ Non-Compliant | No Scope 3, no PCAF methodology, only 65% portfolio coverage |
| Business Ethics (FN-CB-510a) | ❌ Non-Compliant | No ESG-specific whistleblower policy |

**IFRS S2 Findings:**

| Section | Status | Key Finding |
|---------|--------|-------------|
| Climate Governance | ⚠️ Partial | CSO reports to CFO, not directly to Board |
| Climate Strategy | ❌ Non-Compliant | Only 2°C scenario (no 1.5°C or 4°C); no transition plan |
| Climate Risk Management | ❌ Non-Compliant | No climate stress testing performed |
| GHG Emissions | ❌ Non-Compliant | Only Scope 1+2 reported; no Scope 3 value chain emissions |
| Financed Emissions | ⚠️ Partial | 65% coverage; proprietary methodology instead of PCAF |
| Climate Targets | ❌ Non-Compliant | No net-zero commitment; no science-based targets (SBT) |

> **Presenter tip:** "The most critical gap? Undisclosed data breaches — SASB requires breach disclosure, and this bank omitted 2 incidents affecting 47,000 accounts. The AI caught what a human reviewer might miss. Also notice the financed emissions gap — BNI covers 90.1% with PCAF, while this bank only covers 65% with proprietary methodology."

#### ESG Step 4 — BNI Benchmark Comparison Chat

Use the compliance chat to compare the uploaded report against BNI's published data:

| # | Question | Expected Insight |
|---|----------|-----------------|
| 1 | "Compare our ESG performance with BNI benchmarks" | BNI: IDR 196.7T sustainable financing (22.3%), MSCI A, 6.7% emission reduction vs Bank Nusantara: IDR 145T (23.4%), MSCI BBB, 5.2% reduction |
| 2 | "What is POJK 51 and what does it require for RAKB?" | 8 principles of sustainable finance, mandatory RAKB (action plan) filing with OJK, Sections A-G reporting |
| 3 | "Explain SASB financed emissions requirements for banks" | FN-CB-410b metrics: absolute Scope 1/2/3, industry exposure, PCAF methodology, coverage % |
| 4 | "What are the IFRS S2 requirements for scenario analysis?" | Mandatory 1.5°C and 4°C pathways, quantified financial effects, transition plan alignment |
| 5 | "Apa persyaratan POJK 51 untuk laporan keberlanjutan?" | POJK 51 reporting sections A-G in Bahasa Indonesia |
| 6 | "How do we achieve net-zero and what are science-based targets?" | SBTi framework, interim targets, Scope 3 inclusion, carbon credit disclosure under IFRS S2 |
| 7 | "What are the top 5 ESG remediation priorities?" | 1) File RAKB with OJK, 2) Disclose data breaches, 3) Calculate Scope 3/financed emissions with PCAF, 4) Set SBT net-zero targets, 5) Get independent assurance |

> **Presenter tip:** "The chat understands cross-framework mapping — it can tell you that POJK 51's sustainability governance maps to IFRS S1 Governance pillar and SASB's systemic risk management. One question covers multiple frameworks."

#### ESG Step 5 — Model Comparison

1. Run the same ESG check with **Ollama** (on-prem) and then switch to **Anthropic Claude** (cloud)
2. Compare: Claude typically provides more nuanced ESG analysis with specific regulatory citations
3. Note: For sensitive ESG data (pre-publication reports), use Ollama to keep data on-premises

### BNI Benchmark Data (for reference during demo)

From BNI Sustainability Report 2025:

| Metric | BNI (2025) | Bank Nusantara (dummy) | Gap |
|--------|-----------|----------------------|-----|
| Sustainable Financing | IDR 196.7T (22.3%) | IDR 145T (23.4%) | — |
| Green Financing (KUBL) | IDR 78T (8.8%) | IDR 58T (9.4%) | — |
| MSME Financing | IDR 118.8T | IDR 87T | — |
| Scope 1+2 Emissions | 44,822,789 ton CO2eq* | 42,500 ton CO2eq | Scale differs |
| Scope 1+2 Reduction | 6.7% YoY | 5.2% YoY | BNI leads |
| Financed Emissions Coverage | 90.1% (PCAF) | 65% (proprietary) | Critical gap |
| MSCI ESG Rating | A | BBB | BNI leads |
| Employee Training | 146.7 hrs/employee | 120 hrs/employee | — |
| Women Employees | 52.2% | 51% | — |
| Green Bond | IDR 5.0T | IDR 3.5T | — |
| Net-Zero Target | Operations by 2028 | None | Critical gap |
| Independent Assurance | Yes (ASRRAT Gold) | None | Critical gap |
| SBT Commitment | In progress | None | Critical gap |

*Note: BNI's Scope 1+2 includes all operational emissions across 1,400+ branches. Bank Nusantara is a smaller bank.

### ESG Demo Timing

| Segment | Duration | Steps |
|---------|----------|-------|
| Select ESG regulations | 1 min | ESG Step 1 |
| Upload ESG report | 1 min | ESG Step 2 |
| Review ESG compliance report | 5 min | ESG Step 3 |
| BNI benchmark comparison chat | 5 min | ESG Step 4 |
| Model comparison | 2 min | ESG Step 5 |
| **Total** | **~14 min** | |

### Talking Points for ESG Demo

1. **Regulatory landscape:** "Indonesian banks face a dual mandate — POJK 51 from OJK for domestic compliance, plus SASB and ISSB for international investor expectations. DocProc checks both in a single workflow."

2. **Greenwashing detection:** "The AI cross-references claims against actual data. If a bank claims 'comprehensive ESG integration' but only screens 46% of its lending portfolio, DocProc flags it."

3. **Undisclosed incidents:** "SASB requires data breach disclosure. The AI detected that 2 breach incidents were omitted from the sustainability report — a material omission that could affect investor decisions."

4. **Climate readiness:** "IFRS S2 requires mandatory scenario analysis at 1.5°C and 4°C pathways. This bank only analyzed 2°C — meaning they haven't stress-tested for the Paris Agreement target or worst-case scenarios."

5. **BNI as benchmark:** "BNI is a gold standard in Indonesian ESG reporting — ASRRAT Gold for 4 consecutive years, MSCI A rating, 90.1% PCAF coverage. DocProc can benchmark any bank's ESG report against BNI's published metrics."

6. **Scope 3 gap:** "The biggest gap globally in ESG reporting is Scope 3 and financed emissions. Under IFRS S2, this is now mandatory for financial institutions. Banks that don't calculate financed emissions using PCAF will face increasing investor scrutiny."
