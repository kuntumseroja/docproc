# UU PDP Workflow — Demo Documents

Two sample privacy-policy documents for testing the **UU PDP Privacy Policy Review** workflow (`templates/compliance/uu-pdp-privacy-policy.json`).

## 1. `bank-nusantara-privacy-policy.txt` — Compliant sample

A realistic Indonesian bank privacy policy that complies with UU No. 27/2022 (UU PDP). Expected extraction and validation results:

- **Extraction**: All 41 mandatory + best-practice fields present (controller + business registration, DPO, policy version, Bahasa Indonesia availability, data collection methods, subject categories, sensitive data, purpose/data minimization statements, legal basis, consent mechanism and withdrawal, retention per category, all 9 data subject rights, rights-request SLA and free-of-charge statement, third-party sharing and named processors, storage location, cross-border transfer with SCC+TIA, security measures, TLS 1.3 in transit, AES-256 at rest, RBAC/MFA, staff training, DPIA Q4 2024, ROPA, breach notification 3x24 jam, children data handling, marketing opt-out, complaint channels, automated-decision disclosure).
- **Validation**: All 15 rules should pass.

Use this to demonstrate a passing workflow.

## 2. `fintech-startup-privacy-policy-incomplete.txt` — Non-compliant sample

A deliberately under-specified privacy policy from a fintech startup. Expected validation findings (this is what the workflow should **flag**):

| Rule | Expected finding |
|---|---|
| `dpo_required_for_large_scale` | FAIL — sensitive biometric data collected but no DPO contact listed |
| `lawful_basis_required` | FAIL — no explicit legal basis stated (no consent / contract / legal obligation etc.) |
| `mandatory_subject_rights` | FAIL — only mentions profile update and unsubscribe; missing access, deletion, withdrawal, portability, object-to-automated-decision |
| `retention_period_specified` | FAIL — "retained indefinitely for regulatory reasons" violates Pasal 30 |
| `breach_notification_timeline` | FAIL — no mention of 3x24 jam timeline (Pasal 46) |
| `cross_border_safeguards_required` | FAIL — mentions transfer to Singapore/US but no safeguards documented (Pasal 56 violation) |
| `consent_withdrawal_mechanism` | FAIL — no procedure described (Pasal 9 right) |
| `children_data_parental_consent` | N/A — children's data not mentioned |
| `complaint_channel_disclosed` | PARTIAL — only generic support email, no reference to OJK or Badan PDP |

Use this to demonstrate the workflow catching real compliance gaps.

## How to use

1. From Dashboard, click **"UU PDP Privacy Policy Review"** in Quick Start.
2. You're taken to the Upload page with the workflow pre-selected.
3. Upload one of the `.txt` files above (or a real PDF privacy policy).
4. Review the extracted fields and validation findings.

The demo text files can be renamed to `.pdf` or converted via any PDF generator for more realistic upload testing.
