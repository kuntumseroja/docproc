# Security Guard Attendance Form — Demo Documents

Workflow: `templates/forms/security-guard-attendance.json`

## How to use

1. Dashboard → **Security Attendance Form Review** Quick Start card
2. The new workflow auto-creates and you land on `/upload?workflow=...`
3. Upload a **scan or photo** of a filled-and-signed security attendance form
   (PDF, PNG, JPG, TIFF, or WebP)
4. The backend routes the document through **IBM granite-docling-258M**
   (because the workflow's `extraction_engine = "granite-docling"`)
5. Open the document detail page from the Repository

## What the review page shows

- **Status banner** — green APPROVED or red REJECTED, with the failed rule names
- **Element counts** — pages / signatures / handwritten fields / headings
- **Validation table** — every rule with PASS/REJECT/FAIL tags
- **Signatures** panel — cropped image of every detected signature, with
  page number and confidence
- **Handwritten fields** panel — cropped image of each handwritten value,
  alongside the extracted text and label
- **Extracted form text** — full markdown view of the printed text

## Rejection rules

The form is auto-rejected if either:
- No guard signature is detected (`guard_signature_present == false`)
- Fewer than 3 fields filled in by hand (`handwritten_field_count < 3`)

Other validations (date, check-in time, check-out time, post location) raise
warnings but don't reject the form.

## Where to source samples

- A real photographed/scanned **filled** attendance form (best for demo)
- A blank attendance form (should be rejected — no handwriting)
- A handwritten-but-unsigned form (should be rejected — no signature)

A clean blank PDF template is sufficient to demo the rejection path. Any
filled-in security log book photo from a building lobby works for the
approval path.

## Related templates

- `templates/compliance/uu-pdp-privacy-policy.json` — text-only LLM extraction
- `templates/forms/security-guard-attendance.json` — multimodal granite path

The two templates demonstrate when granite-docling is worth the extra
dependency: form-heavy, handwriting-heavy, signature-required documents.
