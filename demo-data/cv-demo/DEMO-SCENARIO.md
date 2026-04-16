# CV Skill Mapping — Demo Scenario

## Overview

This demo showcases DocProc's CV/Resume processing workflow that automatically extracts candidate information, maps skills against role requirements, and provides fit assessment with gap analysis.

---

## Demo Candidates

| # | Candidate | Target Role | Experience | Education | Expected Fit |
|---|-----------|------------|-----------|-----------|-------------|
| 1 | **Rina Pratiwi** | Software Engineer | 5 years (Banking, E-commerce) | S1 CS — Universitas Indonesia | **Strong Fit** (90%+) |
| 2 | **Budi Santoso** | Risk Analyst (Banking) | 4 years (Banking) | S2 Finance — UGM | **Strong Fit** (85%+) |
| 3 | **Maya Kusuma** | Data Scientist | 3 years (Fintech, Telco) | S1 Statistics — ITB | **Strong Fit** (85%+) |
| 4 | **Ahmad Fauzan** | Software Engineer | Fresh Graduate (Intern only) | S1 Informatics — UGM | **Partial Fit** (55%) |

---

## Demo Flow

### Step 1: Upload CVs

1. Go to **Upload** page
2. Select workflow: **CV Skill Mapping**
3. Upload the 4 CV files from `demo-data/cv-demo/`
4. Documents appear in the processing queue

### Step 2: Review Extractions

1. Go to **Repository** page
2. Click on a completed CV document (e.g., Rina Pratiwi)
3. Review extracted fields:
   - Candidate info (name, email, phone)
   - Technical skills list
   - Work history timeline
   - Education & certifications
   - Years of experience

### Step 3: Chat — Individual Analysis

Go to **Chat** page and try these queries:

```
Summarize Rina Pratiwi's CV
```
> Expected: Structured summary with contact info, 5 years experience, key skills (Python, React, AWS, K8s), certifications (AWS SA, CKAD, GCP), banking domain expertise.

```
Does Budi Santoso fit the Risk Analyst role?
```
> Expected: Strong fit assessment. Has BSMR Level 2 (required), FRM Part I, OJK Fit & Proper. 4 years banking risk experience. Minor gap: no BSMR Level 3 (preferred).

```
What skills is Ahmad Fauzan missing for Software Engineer?
```
> Expected: Missing production experience, no cloud certifications, limited to intern-level Go/PostgreSQL. Strengths: good CS fundamentals, hackathon winner, Meta Backend cert. Trainable candidate.

### Step 4: Chat — Comparative Analysis

```
Compare all CV candidates and rank them for Software Engineer role
```
> Expected ranking:
> 1. Rina Pratiwi — Strong Fit (5yr exp, AWS/K8s certified, banking API lead)
> 2. Maya Kusuma — Good Fit (3yr, strong Python/ML, but more DS than SWE)
> 3. Ahmad Fauzan — Partial Fit (fresh grad, good potential, needs mentoring)
> 4. Budi Santoso — Weak Fit for SWE (risk domain, no SWE skills)

```
Which candidate is best for a Data Scientist position?
```
> Expected: Maya Kusuma — Strong Fit (TensorFlow, PyTorch, MLOps, 96% fraud detection model, Google ML Engineer certified)

### Step 5: Chat — Gap Analysis

```
What certifications does each candidate have?
```
> Expected: Table comparing all 4 candidates' certifications.

```
If we hire Ahmad Fauzan, what training program should we plan?
```
> Expected: Cloud certification (AWS/GCP), Docker/K8s training, testing best practices, mentoring program with senior engineer, 6-month development plan.

---

## Role-Skill Matrix Reference

The skill matching uses `templates/hr/data/role-skill-matrix.json` which defines requirements for 12 roles:

| Role | Required Skills | Required Certs |
|------|----------------|---------------|
| Software Engineer | Programming, Data Structures, Git, REST API, SQL | — |
| Data Scientist | Machine Learning, Statistics, Python, Data Analysis | — |
| Risk Analyst (Banking) | Credit Risk, Financial Modeling, Regulatory Knowledge | BSMR Level 2 |
| Compliance Officer | AML/KYC, Regulatory Compliance, Policy Development | BSMR Level 2, OJK Fit & Proper |
| Frontend Developer | HTML, CSS, JavaScript, React, Responsive Design | — |
| DevOps/SRE | Linux, Docker, CI/CD, Cloud, Monitoring | — |
| Product Manager | Product Strategy, User Research, Agile, Data Analysis | — |
| Cybersecurity Analyst | Security Monitoring, Incident Response, SIEM | — |

---

## Scoring Methodology

| Factor | Weight |
|--------|--------|
| Required Skills Match | 35% |
| Experience (years) | 20% |
| Preferred Skills Match | 15% |
| Education Level | 10% |
| Certifications | 10% |
| Industry Relevance | 10% |

**Fit Levels:**
- **Strong Fit** (85-100%) — Proceed to interview
- **Good Fit** (70-84%) — Consider for interview, minor gaps
- **Partial Fit** (50-69%) — Significant gaps, assess if trainable
- **Weak Fit** (0-49%) — Does not meet minimum requirements

---

## Key Talking Points for Demo

1. **Automated Extraction** — LLM extracts structured data from unstructured CV text
2. **Skill Matching** — Compares candidate skills against role-specific competency matrix
3. **Gap Analysis** — Identifies missing skills and certifications with recommendations
4. **Candidate Ranking** — Compare multiple candidates for a single position
5. **Training Recommendations** — Suggests development plan for candidates with gaps
6. **Multi-role Assessment** — Same candidate can be evaluated against different roles
7. **Indonesian Context** — Supports Indonesian education levels (S1/S2/S3), local certifications (BSMR, OJK), and IDR salary bands
