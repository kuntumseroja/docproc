# UU PDP Workflow — Demo Documents

Two sample privacy-policy documents for testing the **UU PDP Privacy Policy Review** workflow (`templates/compliance/uu-pdp-privacy-policy.json`).

## 1. `bank-nusantara-privacy-policy.txt` — Compliant sample

A realistic Indonesian bank privacy policy that complies with UU No. 27/2022 (UU PDP). Expected extraction and validation results:

- **Extraction**: All 22 mandatory fields present.
- **Validation**: All 10 rules should pass — DPO appointed, lawful basis listed, all 9 data-subject rights disclosed (Pasal 5-13), retention period specific (10 years, not indefinite), breach notification mentions "3x24 jam" (Pasal 46), cross-border transfer has safeguards (SCC + TIA + encryption), complaint channel disclosed.

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
