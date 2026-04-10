# Sprint 6 — HR Operations Workflows

## Overview
Sprint 6 focuses on comprehensive HR operations automation covering payroll, leave management, performance appraisals, training compliance, compensation analysis, and disciplinary/exit processing. All workflows integrate with document templates, validation engines, and Carbon UI dashboards.

---

## LON-152: Payroll & Tax Processing Workflow Template

### Summary
Comprehensive payroll and tax processing workflow for Indonesian companies. Extracts and validates payslip components including base salary, allowances, overtime, BPJS contributions, and PPh 21 tax calculations. Supports 8 document types with automated calculation verification and compliance validation.

### File Artifacts
- **Template**: `backend/templates/hr/hr-payroll-tax.json`
- **Frontend Route**: `/workflows/payroll-tax`

### Template Structure (22 Extraction Fields)

```json
{
  "workflowId": "payroll-tax",
  "name": "Payroll & Tax Processing",
  "extractionFields": [
    {
      "id": "employeeId",
      "label": "Employee ID",
      "type": "string",
      "required": true
    },
    {
      "id": "period",
      "label": "Payroll Period",
      "type": "date",
      "required": true
    },
    {
      "id": "baseSalary",
      "label": "Base Salary (Gaji Pokok)",
      "type": "currency",
      "required": true
    },
    {
      "id": "transportAllowance",
      "label": "Transport Allowance (Tunjangan Transportasi)",
      "type": "currency",
      "required": false
    },
    {
      "id": "mealAllowance",
      "label": "Meal Allowance (Tunjangan Makan)",
      "type": "currency",
      "required": false
    },
    {
      "id": "housingAllowance",
      "label": "Housing Allowance (Tunjangan Perumahan)",
      "type": "currency",
      "required": false
    },
    {
      "id": "functionalAllowance",
      "label": "Functional Allowance (Tunjangan Fungsional)",
      "type": "currency",
      "required": false
    },
    {
      "id": "overtimeHours",
      "label": "Overtime Hours",
      "type": "number",
      "required": false
    },
    {
      "id": "overtimeAmount",
      "label": "Overtime Amount",
      "type": "currency",
      "required": false
    },
    {
      "id": "grossSalary",
      "label": "Gross Salary (Gaji Bruto)",
      "type": "currency",
      "required": true
    },
    {
      "id": "bpjsTkDeduction",
      "label": "BPJS Ketenagakerjaan Deduction",
      "type": "currency",
      "required": true
    },
    {
      "id": "bpjsKesDeduction",
      "label": "BPJS Kesehatan Deduction",
      "type": "currency",
      "required": true
    },
    {
      "id": "bpjsKesFamily",
      "label": "BPJS Kesehatan Family Deduction",
      "type": "currency",
      "required": false
    },
    {
      "id": "pph21",
      "label": "PPh 21 Tax",
      "type": "currency",
      "required": true
    },
    {
      "id": "otherDeductions",
      "label": "Other Deductions",
      "type": "currency",
      "required": false
    },
    {
      "id": "netSalary",
      "label": "Net Salary (Gaji Bersih)",
      "type": "currency",
      "required": true
    },
    {
      "id": "pph21Annual",
      "label": "Annual PPh 21 (Tahunan)",
      "type": "currency",
      "required": false
    },
    {
      "id": "ptkp",
      "label": "PTKP Amount",
      "type": "currency",
      "required": true
    },
    {
      "id": "taxableIncome",
      "label": "Taxable Income",
      "type": "currency",
      "required": true
    },
    {
      "id": "biayaJabatan",
      "label": "Biaya Jabatan Deduction",
      "type": "currency",
      "required": true
    },
    {
      "id": "employerBpjsTk",
      "label": "Employer BPJS Ketenagakerjaan",
      "type": "currency",
      "required": false
    },
    {
      "id": "dokumentationType",
      "label": "Document Type",
      "type": "enum",
      "values": ["slip-gaji", "spt-1721", "bukti-potong-pph21", "bpjs-statement", "payroll-reconciliation", "overtime-form", "thr-sheet", "other"],
      "required": true
    }
  ],
  "validationRules": [
    {
      "id": "pph21-bracket-validation",
      "description": "PPh 21 must follow progressive tax brackets",
      "formula": "validatePPh21Brackets(taxableIncome, pph21)"
    },
    {
      "id": "bpjs-tk-rate-validation",
      "description": "BPJS TK deduction must match employee rate (2%)",
      "formula": "bpjsTkDeduction == baseSalary * 0.02"
    },
    {
      "id": "bpjs-kes-rate-validation",
      "description": "BPJS Kes deduction must follow 1% employee + 4% employer rate",
      "formula": "bpjsKesDeduction == baseSalary * 0.01"
    },
    {
      "id": "gross-income-sum",
      "description": "Gross salary must equal base + allowances + overtime",
      "formula": "grossSalary == baseSalary + allowances + overtimeAmount"
    },
    {
      "id": "net-salary-calculation",
      "description": "Net salary calculation: Gross - BPJS - PPh21 - Other",
      "formula": "netSalary == grossSalary - bpjsTkDeduction - bpjsKesDeduction - pph21 - otherDeductions"
    },
    {
      "id": "overtime-rate-validation",
      "description": "Overtime must be 1.5x hourly rate",
      "formula": "validateOvertimeRate(baseSalary, overtimeHours, overtimeAmount)"
    },
    {
      "id": "thr-minimum-validation",
      "description": "THR minimum is 1 month base salary",
      "formula": "documentationType != 'thr-sheet' || thr >= baseSalary"
    },
    {
      "id": "salary-ump-requirement",
      "description": "Salary must be at or above regional UMR",
      "formula": "baseSalary >= ump"
    }
  ],
  "actionTriggers": [
    {
      "id": "calculation-mismatch-flag",
      "trigger": "net-salary-calculation fails",
      "action": "flag for manual review",
      "assignTo": "payroll-manager"
    },
    {
      "id": "tax-filing-reminder",
      "trigger": "spt-1721 document type",
      "action": "create task: prepare annual tax filing",
      "dueDate": "end-of-quarter"
    },
    {
      "id": "bpjs-discrepancy-alert",
      "trigger": "bpjs deduction mismatch",
      "action": "alert HR: BPJS contribution discrepancy detected",
      "priority": "high"
    },
    {
      "id": "auto-approve-payroll",
      "trigger": "all validations pass",
      "action": "auto-approve for payment processing",
      "notifyFinance": true
    },
    {
      "id": "generate-bukti-potong",
      "trigger": "pph21 > 0",
      "action": "generate Bukti Potong PPh 21 document",
      "format": "PDF"
    }
  ]
}
```

### PPh 21 Tax Calculator Module
Location: `backend/services/hr/pph21Calculator.ts`

Implement progressive tax bracket calculator with:
- **PTKP Lookup**: Unmarried (Rp15,300,000), Married (Rp17,150,000), Spouse (Rp1,320,000), Children (Rp1,320,000 each, max 3)
- **Biaya Jabatan Deduction**: 5% of gross salary (max Rp500,000/month)
- **Annualization Method**: Calculate annual PPh 21, divide by 12 for monthly
- **Tax Brackets**:
  - 0–50 million: 5%
  - 50–250 million: 15%
  - 250–500 million: 25%
  - 500 million–5 billion: 30%
  - Above 5 billion: 35%

```typescript
interface PPh21CalculationInput {
  grossSalary: number;
  ptkpStatus: 'TK/0' | 'K/0' | 'K/1' | 'K/2' | 'K/3';
  monthInYear: number;
  previousMonthDeduction: number;
}

function calculatePPh21(input: PPh21CalculationInput): {
  ptkp: number;
  biayaJabatan: number;
  taxableIncome: number;
  annualTax: number;
  monthlyPPh21: number;
  taxBracket: string;
}
```

### BPJS Contribution Validator
Location: `backend/services/hr/bpjsValidator.ts`

Validate all four BPJS programs:
- **JHT (Pension)**: 2% employee, 3.7% employer
- **JKK (Work Accident)**: 0.24%–1.74% employer (by industry)
- **JKM (Death Benefit)**: 0.3% employer
- **JP (Supplementary Pension)**: 1% employee, 1% employer (optional)

```typescript
interface BPJSContribution {
  jht: number;       // 2% employee
  jkk: number;       // Employer only
  jkm: number;       // Employer only
  jp: number;        // Optional
  totalEmployee: number;
  totalEmployer: number;
}

function validateBPJSContributions(
  baseSalary: number,
  employmentStatus: string,
  industryCode: string
): BPJSContribution
```

### Payroll Reconciliation View
Location: `frontend/components/hr/PayrollReconciliation.tsx`

Implement Carbon DataTable with:
- Employee list with YTD (year-to-date) salary totals
- Running total for BPJS, PPh 21, net salary
- Month-over-month variance detection
- Export to Excel with formula preservation
- Sort by employee ID, department, salary

### Document Types Supported
1. **Slip Gaji** (Payslip): Monthly salary slip
2. **SPT 1721** (Annual Tax Report): Yearly tax filing
3. **Bukti Potong PPh 21** (Tax Deduction Certificate): Monthly tax proof
4. **BPJS Statement**: Monthly BPJS contribution
5. **Payroll Reconciliation**: Department-level summary
6. **Overtime Form**: Extra hours documentation
7. **THR Sheet** (Holiday Allowance): Annual bonus calculation
8. **Other**: Miscellaneous payroll documents

### Acceptance Criteria
- [ ] Template JSON validates against schema
- [ ] PPh 21 calculator matches tax authority rates (Lampiran PMK-262/2010)
- [ ] BPJS rates current as of latest regulation (UU No. 24 Tahun 2011)
- [ ] All 8 validation rules execute without error
- [ ] All 5 action triggers fire correctly
- [ ] Payroll reconciliation view renders 1000+ records in <2 seconds
- [ ] Export function includes all 22 fields
- [ ] Handles edge cases: partial month salary, leave without pay
- [ ] Unit tests cover all tax brackets and BPJS combinations
- [ ] Integration with payroll payment system (triggers auto-approve)

---

## LON-153: Leave & Benefits Claims Workflow Template

### Summary
Comprehensive leave and benefits workflow supporting annual leave, sick leave, maternity/paternity, bereavement, and insurance claims. Validates against policy limits, maintains leave balance tracking, and routes claims through appropriate approvers.

### File Artifacts
- **Template**: `backend/templates/hr/hr-leave-benefits.json`
- **Frontend Route**: `/workflows/leave-benefits`

### Template Structure (15 Extraction Fields)

```json
{
  "workflowId": "leave-benefits",
  "name": "Leave & Benefits Claims",
  "extractionFields": [
    {
      "id": "employeeId",
      "label": "Employee ID",
      "type": "string",
      "required": true
    },
    {
      "id": "leaveType",
      "label": "Leave Type",
      "type": "enum",
      "values": [
        "annual-leave",
        "sick-leave",
        "maternity-leave",
        "paternity-leave",
        "bereavement-leave",
        "marriage-leave",
        "religious-leave",
        "unpaid-leave"
      ],
      "required": true
    },
    {
      "id": "startDate",
      "label": "Leave Start Date",
      "type": "date",
      "required": true
    },
    {
      "id": "endDate",
      "label": "Leave End Date",
      "type": "date",
      "required": true
    },
    {
      "id": "duration",
      "label": "Duration (Days)",
      "type": "number",
      "required": true
    },
    {
      "id": "reason",
      "label": "Reason/Details",
      "type": "text",
      "required": true
    },
    {
      "id": "medicalCertRequired",
      "label": "Medical Certificate Attached",
      "type": "boolean",
      "required": false
    },
    {
      "id": "medicalCertFile",
      "label": "Medical Certificate File",
      "type": "file",
      "required": false
    },
    {
      "id": "supportingDocuments",
      "label": "Supporting Documents",
      "type": "file[]",
      "required": false
    },
    {
      "id": "availableBalance",
      "label": "Available Leave Balance",
      "type": "number",
      "required": true
    },
    {
      "id": "balanceAfter",
      "label": "Balance After Approval",
      "type": "number",
      "required": true
    },
    {
      "id": "approverName",
      "label": "Supervisor/Approver",
      "type": "string",
      "required": true
    },
    {
      "id": "claimType",
      "label": "Claim Type (if benefits)",
      "type": "enum",
      "values": [
        "insurance-claim",
        "medical-reimbursement",
        "bpjs-claim",
        "hospitalization",
        "dental",
        "optical",
        "none"
      ],
      "required": false
    },
    {
      "id": "claimAmount",
      "label": "Claim Amount",
      "type": "currency",
      "required": false
    },
    {
      "id": "noticePeriodDays",
      "label": "Days Before Leave Start",
      "type": "number",
      "required": true
    }
  ],
  "validationRules": [
    {
      "id": "annual-leave-balance",
      "description": "Employee must have sufficient annual leave balance",
      "formula": "leaveType != 'annual-leave' || availableBalance >= duration"
    },
    {
      "id": "sick-leave-medical-cert",
      "description": "Sick leave >2 days requires medical certificate",
      "formula": "leaveType != 'sick-leave' || duration <= 2 || medicalCertRequired == true"
    },
    {
      "id": "maternity-leave-duration",
      "description": "Maternity leave must be exactly 90 days",
      "formula": "leaveType != 'maternity-leave' || duration == 90"
    },
    {
      "id": "paternity-leave-duration",
      "description": "Paternity leave must be exactly 2 days",
      "formula": "leaveType != 'paternity-leave' || duration == 2"
    },
    {
      "id": "bereavement-duration-validation",
      "description": "Bereavement leave max 3 days for immediate family",
      "formula": "leaveType != 'bereavement-leave' || duration <= 3"
    },
    {
      "id": "claim-within-policy",
      "description": "Claim must be within policy limits",
      "formula": "claimType == null || claimAmount <= getPolicyLimit(claimType)"
    },
    {
      "id": "no-overlapping-leave",
      "description": "No overlapping leave requests for same employee",
      "formula": "!hasOverlappingLeave(employeeId, startDate, endDate)"
    },
    {
      "id": "advance-notice-14-days",
      "description": "Annual leave requires 14 days advance notice",
      "formula": "leaveType != 'annual-leave' || noticePeriodDays >= 14"
    }
  ],
  "actionTriggers": [
    {
      "id": "notify-approver",
      "trigger": "leave request submitted",
      "action": "send notification to supervisor",
      "template": "leave-request-approval"
    },
    {
      "id": "update-calendar",
      "trigger": "leave request approved",
      "action": "add to employee calendar and publish",
      "system": "calendar-service"
    },
    {
      "id": "alert-hr-extended-sick",
      "trigger": "sick-leave > 5 consecutive days",
      "action": "alert HR department",
      "priority": "medium"
    },
    {
      "id": "route-claims-to-finance",
      "trigger": "claims request with claimAmount > 0",
      "action": "route to finance for reimbursement processing",
      "assignTo": "finance-team"
    },
    {
      "id": "low-balance-notification",
      "trigger": "balanceAfter < 5 days",
      "action": "notify employee of low leave balance",
      "template": "low-balance-reminder"
    }
  ]
}
```

### Leave Balance Tracker
Location: `frontend/components/hr/LeaveBalanceTracker.tsx`

Implement interactive component showing:
- Annual entitlement vs. used vs. carry-over
- Accrual schedule (monthly breakdown)
- Carryover rules (max 5 days to next year, expires)
- Sick leave separate pool
- Visual progress bars for each leave type
- Year-to-date usage

### Benefits Claim Processor
Location: `backend/services/hr/benefitsClaimProcessor.ts`

Handle claim routing:
- Medical claims route to insurance provider
- BPJS claims submitted to government system
- Hospitalization requires pre-auth verification
- Reimbursement processing with receipt validation

### Leave Calendar Widget
Location: `frontend/components/hr/LeaveCalendarWidget.tsx`

Display:
- Team leave calendar (month view)
- Color-coded by leave type
- Hover to show details (employee name, duration, approver)
- Filter by department/team
- Print functionality

### Document Types Supported
1. **Leave Form**: Standard leave request
2. **Medical Certificate**: Doctor's note for sick leave
3. **Hospital Invoice**: For hospitalization claims
4. **Insurance Claim**: Third-party insurance submission
5. **BPJS Claim**: Government health/social insurance
6. **Maternity/Paternity Certificate**: Birth documentation
7. **Bereavement Notice**: Death certificate or announcement
8. **Marriage Certificate**: For marriage leave

### Acceptance Criteria
- [ ] Template JSON validates against schema
- [ ] All 8 validation rules execute correctly
- [ ] All 5 action triggers fire and notify appropriate stakeholders
- [ ] Leave balance tracker shows accurate accrual/carryover
- [ ] Benefits claim processor routes to correct department
- [ ] Calendar widget renders 50+ concurrent leave requests smoothly
- [ ] Medical certificate validation checks file format/signature
- [ ] No double-approvals (concurrent requests blocked)
- [ ] Advance notice rule enforces 14 days for annual leave
- [ ] Maternity/paternity durations non-editable (enforced as 90 and 2)
- [ ] Integration with payroll (unpaid leave reduces salary)

---

## LON-154: Performance Appraisal Workflow Template

### Summary
Comprehensive performance management workflow supporting annual reviews, mid-year checkpoints, KPI scorecards, 360-degree feedback, and performance improvement plans. Enables talent pool management and compensation decisions.

### File Artifacts
- **Template**: `backend/templates/hr/hr-performance-appraisal.json`
- **Frontend Route**: `/workflows/performance-appraisal`

### Template Structure (20 Extraction Fields + KPI Arrays)

```json
{
  "workflowId": "performance-appraisal",
  "name": "Performance Appraisal",
  "extractionFields": [
    {
      "id": "employeeId",
      "label": "Employee ID",
      "type": "string",
      "required": true
    },
    {
      "id": "employeeName",
      "label": "Employee Name",
      "type": "string",
      "required": true
    },
    {
      "id": "appraisalType",
      "label": "Appraisal Type",
      "type": "enum",
      "values": [
        "annual-review",
        "mid-year-review",
        "promotion-review",
        "probation-review"
      ],
      "required": true
    },
    {
      "id": "reviewPeriodStart",
      "label": "Review Period Start",
      "type": "date",
      "required": true
    },
    {
      "id": "reviewPeriodEnd",
      "label": "Review Period End",
      "type": "date",
      "required": true
    },
    {
      "id": "ratingScale",
      "label": "Overall Rating (1-5)",
      "type": "number",
      "min": 1,
      "max": 5,
      "required": true
    },
    {
      "id": "kpiArray",
      "label": "KPI Scorecard",
      "type": "array",
      "items": {
        "kpiName": "string",
        "weight": "number (0-100)",
        "target": "number",
        "actual": "number",
        "score": "number (1-5)",
        "comments": "string"
      },
      "required": true,
      "minItems": 3,
      "maxItems": 10
    },
    {
      "id": "competencyRatings",
      "label": "Competency Ratings",
      "type": "array",
      "items": {
        "competency": "string",
        "rating": "number (1-5)",
        "evidence": "string"
      },
      "required": true
    },
    {
      "id": "strengths",
      "label": "Key Strengths",
      "type": "text",
      "required": true
    },
    {
      "id": "areasForImprovement",
      "label": "Areas for Improvement",
      "type": "text",
      "required": true
    },
    {
      "id": "developmentPlan",
      "label": "Development Plan",
      "type": "text",
      "required": false
    },
    {
      "id": "promotionRecommendation",
      "label": "Promotion Recommended",
      "type": "boolean",
      "required": false
    },
    {
      "id": "pipRequired",
      "label": "Performance Improvement Plan Required",
      "type": "boolean",
      "required": false
    },
    {
      "id": "supervisorName",
      "label": "Supervisor Name",
      "type": "string",
      "required": true
    },
    {
      "id": "supervisorSignature",
      "label": "Supervisor Signature",
      "type": "signature",
      "required": true
    },
    {
      "id": "employeeSignature",
      "label": "Employee Signature",
      "type": "signature",
      "required": true
    },
    {
      "id": "hrReview",
      "label": "HR Review Comments",
      "type": "text",
      "required": false
    },
    {
      "id": "calibrationScore",
      "label": "Calibration Adjusted Score",
      "type": "number",
      "min": 1,
      "max": 5,
      "required": false
    },
    {
      "id": "360FeedbackIncluded",
      "label": "360 Degree Feedback Included",
      "type": "boolean",
      "required": false
    },
    {
      "id": "talentPoolNomination",
      "label": "Talent Pool Nomination",
      "type": "enum",
      "values": ["high-potential", "ready-now", "not-nominated", "exit-risk"],
      "required": false
    }
  ],
  "validationRules": [
    {
      "id": "kpi-weights-sum-100",
      "description": "All KPI weights must sum to 100%",
      "formula": "sum(kpiArray[*].weight) == 100"
    },
    {
      "id": "scores-within-range",
      "description": "All scores must be between 1-5",
      "formula": "ratingScale >= 1 && ratingScale <= 5 && all(kpiArray[*].score >= 1 && <= 5)"
    },
    {
      "id": "rating-consistency-with-kpi",
      "description": "Overall rating must align with KPI average",
      "formula": "abs(ratingScale - avg(kpiArray[*].score)) <= 0.5"
    },
    {
      "id": "pip-required-for-low-rating",
      "description": "PIP required if overall rating < 2.5",
      "formula": "ratingScale >= 2.5 || pipRequired == true"
    },
    {
      "id": "both-signatures-required",
      "description": "Both supervisor and employee must sign",
      "formula": "supervisorSignature != null && employeeSignature != null"
    },
    {
      "id": "review-period-complete",
      "description": "Review period must be at least 3 months",
      "formula": "dateDiff(reviewPeriodEnd, reviewPeriodStart) >= 90"
    }
  ],
  "actionTriggers": [
    {
      "id": "archive-review",
      "trigger": "both signatures complete",
      "action": "archive to employee performance history",
      "system": "hr-record-system"
    },
    {
      "id": "route-promotion-to-committee",
      "trigger": "promotionRecommendation == true && ratingScale >= 4",
      "action": "route to succession planning committee",
      "assignTo": "succession-committee"
    },
    {
      "id": "create-pip",
      "trigger": "pipRequired == true",
      "action": "create PIP workflow and set 90-day review",
      "notifyEmployee": true
    },
    {
      "id": "add-to-talent-pool",
      "trigger": "talentPoolNomination in ['high-potential', 'ready-now']",
      "action": "add to talent pool and schedule development",
      "priority": "high"
    },
    {
      "id": "generate-analytics",
      "trigger": "annual review completion",
      "action": "update performance analytics dashboard",
      "metrics": ["bell-curve", "year-over-year-trend", "department-comparison"]
    }
  ]
}
```

### Performance Analytics Engine
Location: `backend/services/hr/performanceAnalytics.ts`

Generate:
- **Bell Curve Analysis**: Distribution of ratings by department/level
- **Year-over-Year Trends**: Rating migration, improvement patterns
- **Forced Ranking**: Top/bottom performers identification
- **Succession Pipeline**: Ready-now and high-potential tracking

```typescript
interface PerformanceAnalytics {
  bellCurveData: {
    rating: number;
    count: number;
    percentage: number;
    department?: string;
  }[];
  yoyTrends: {
    year: number;
    avgRating: number;
    ratingDistribution: Record<number, number>;
  }[];
  forcedRanking: {
    rank: number;
    employeeId: string;
    rating: number;
    kpiAverage: number;
  }[];
}
```

### Rating Distribution Widget
Location: `frontend/components/hr/RatingDistributionWidget.tsx`

Display:
- Carbon bar chart of rating counts (1–5)
- Percentage breakdown
- Comparison to previous year
- Drilldown to individual employees
- Export data capability

### Document Types Supported
1. **Annual Review**: Yearly comprehensive appraisal
2. **Mid-Year Review**: 6-month checkpoint
3. **KPI Scorecard**: Detailed KPI performance
4. **360 Feedback**: Multi-rater feedback summary
5. **Self-Assessment**: Employee self-evaluation
6. **PIP** (Performance Improvement Plan): Remedial action plan
7. **Promotion Form**: Advancement recommendation
8. **Calibration Summary**: HR-adjusted ratings

### Acceptance Criteria
- [ ] Template JSON validates against schema
- [ ] All 6 validation rules enforce constraints
- [ ] KPI weight sum validated at submission
- [ ] All 5 action triggers execute correctly
- [ ] PIP automatically created for low ratings (<2.5)
- [ ] Promotion routing goes to designated committee
- [ ] Bell curve analytics computed accurately
- [ ] Year-over-year trends track rating migration
- [ ] Signatures validated (not blank, properly formatted)
- [ ] Rating consistency check within 0.5 of KPI average
- [ ] Talent pool nominations segregated correctly
- [ ] 360 feedback aggregation handles 5+ raters
- [ ] Analytics dashboard updates within 1 hour of review completion

---

## LON-155: Training & Certification Workflow Template

### Summary
Comprehensive training and certification compliance workflow. Tracks mandatory training (AML, fraud prevention), CPD requirements, certifications, and expiry management. Integrates with LMS and compliance systems.

### File Artifacts
- **Template**: `backend/templates/hr/hr-training-certification.json`
- **Frontend Route**: `/workflows/training-certification`

### Template Structure (14 Extraction Fields)

```json
{
  "workflowId": "training-certification",
  "name": "Training & Certification",
  "extractionFields": [
    {
      "id": "employeeId",
      "label": "Employee ID",
      "type": "string",
      "required": true
    },
    {
      "id": "trainingType",
      "label": "Training Type",
      "type": "enum",
      "values": [
        "mandatory-compliance",
        "aml-training",
        "fraud-prevention",
        "data-protection",
        "health-safety",
        "cpd-course",
        "external-workshop",
        "elearning",
        "certification"
      ],
      "required": true
    },
    {
      "id": "trainingName",
      "label": "Training/Certification Name",
      "type": "string",
      "required": true
    },
    {
      "id": "provider",
      "label": "Training Provider",
      "type": "string",
      "required": true
    },
    {
      "id": "completionDate",
      "label": "Completion Date",
      "type": "date",
      "required": true
    },
    {
      "id": "expiryDate",
      "label": "Expiry/Renewal Date",
      "type": "date",
      "required": false
    },
    {
      "id": "score",
      "label": "Test Score (%)",
      "type": "number",
      "min": 0,
      "max": 100,
      "required": false
    },
    {
      "id": "cpdHours",
      "label": "CPD Hours Earned",
      "type": "number",
      "required": false
    },
    {
      "id": "certificateFile",
      "label": "Certificate/Completion Proof",
      "type": "file",
      "required": true
    },
    {
      "id": "cost",
      "label": "Training Cost",
      "type": "currency",
      "required": false
    },
    {
      "id": "budget",
      "label": "Budget Allocation ID",
      "type": "string",
      "required": false
    },
    {
      "id": "isMandatory",
      "label": "Mandatory Requirement",
      "type": "boolean",
      "required": true
    },
    {
      "id": "approverName",
      "label": "Approver/Manager",
      "type": "string",
      "required": true
    },
    {
      "id": "recordedInLms",
      "label": "Recorded in Learning Management System",
      "type": "boolean",
      "required": false
    }
  ],
  "validationRules": [
    {
      "id": "aml-annual-requirement",
      "description": "AML training required annually",
      "formula": "trainingType != 'aml-training' || expiryDate >= today() + 365"
    },
    {
      "id": "fraud-prevention-annual",
      "description": "Fraud prevention training required annually",
      "formula": "trainingType != 'fraud-prevention' || expiryDate >= today() + 365"
    },
    {
      "id": "minimum-cpd-hours",
      "description": "Minimum 30 CPD hours per year",
      "formula": "trainingType != 'cpd-course' || getCumulativeCPD(employeeId, year) >= 30"
    },
    {
      "id": "score-passing",
      "description": "Test score must be >= 70%",
      "formula": "score == null || score >= 70"
    },
    {
      "id": "budget-within-limit",
      "description": "Training cost within budget allocation",
      "formula": "cost == null || cost <= getBudgetRemaining(budget)"
    },
    {
      "id": "mandatory-completion",
      "description": "Mandatory training must be completed",
      "formula": "!isMandatory || (completionDate != null && completionDate <= today())"
    }
  ],
  "actionTriggers": [
    {
      "id": "update-lms",
      "trigger": "certificate file accepted",
      "action": "update LMS record and send to learning platform",
      "system": "lms"
    },
    {
      "id": "escalate-overdue-mandatory",
      "trigger": "mandatory training overdue by 30 days",
      "action": "escalate to HR manager and employee",
      "priority": "high"
    },
    {
      "id": "alert-compliance-overdue",
      "trigger": "30 days before training expiry",
      "action": "alert compliance team and employee",
      "notifyBefore": 30,
      "unit": "days"
    },
    {
      "id": "cpd-threshold-notification",
      "trigger": "employee reaches 30 CPD hours",
      "action": "congratulate and record achievement",
      "template": "cpd-milestone"
    },
    {
      "id": "certificate-expiry-reminder",
      "trigger": "90 days before expiry",
      "action": "send renewal reminder to employee and manager",
      "notifyBefore": 90,
      "unit": "days"
    }
  ]
}
```

### Mandatory Training Tracker
Location: `frontend/components/hr/MandatoryTrainingTracker.tsx`

Display:
- Annual compliance calendar (AML, fraud prevention, data protection)
- Overdue vs. upcoming training
- Employee status (completed/overdue/pending)
- Batch import/export capability
- Department-level compliance score

### Training Compliance Dashboard
Location: `frontend/components/hr/TrainingComplianceDashboard.tsx`

Show:
- **Heatmap**: Department vs. training type compliance
- **CPD Progress**: Individual and aggregate hours tracking
- **Expiry Calendar**: Upcoming certifications by type
- **Budget Utilization**: Spending vs. allocation
- **Non-Compliance List**: Overdue employees by training type

### Document Types Supported
1. **Training Certificate**: Completion proof
2. **CPD Log**: Continuous professional development hours
3. **E-Learning Report**: Online course completion
4. **Workshop Attendance**: Event attendance record
5. **Mandatory Compliance**: Annual mandatory training
6. **AML Certificate**: Anti-money laundering training
7. **Fraud Prevention Cert**: Fraud prevention training
8. **External Training Invoice**: Third-party training cost documentation

### Acceptance Criteria
- [ ] Template JSON validates against schema
- [ ] All 6 validation rules execute correctly
- [ ] AML annual requirement tracked per employee
- [ ] Fraud prevention annual requirement tracked
- [ ] CPD 30-hour minimum enforced per year
- [ ] All 5 action triggers fire and notify stakeholders
- [ ] LMS integration pushes record on certificate acceptance
- [ ] Mandatory training escalation at 30 days overdue
- [ ] Expiry reminders sent 30 and 90 days before renewal
- [ ] Training compliance heatmap renders 50+ employees/training types
- [ ] Budget validation prevents overspend
- [ ] Certificate file validation (PDF, image format)
- [ ] CPD hours aggregation accurate
- [ ] Email reminders deliver to employee and manager

---

## LON-156: Compensation & Bonus Calculation Workflow Template

### Summary
Comprehensive compensation and bonus management workflow supporting salary adjustments, performance-based bonuses, market benchmarking, and compliance with salary band structures. Integrates compensation data with payroll and talent management.

### File Artifacts
- **Template**: `backend/templates/hr/hr-compensation-bonus.json`
- **Frontend Route**: `/workflows/compensation-bonus`

### Template Structure (14 Extraction Fields)

```json
{
  "workflowId": "compensation-bonus",
  "name": "Compensation & Bonus Calculation",
  "extractionFields": [
    {
      "id": "employeeId",
      "label": "Employee ID",
      "type": "string",
      "required": true
    },
    {
      "id": "currentSalary",
      "label": "Current Salary",
      "type": "currency",
      "required": true
    },
    {
      "id": "proposedSalary",
      "label": "Proposed Salary",
      "type": "currency",
      "required": true
    },
    {
      "id": "effectiveDate",
      "label": "Effective Date",
      "type": "date",
      "required": true
    },
    {
      "id": "adjustmentReason",
      "label": "Adjustment Reason",
      "type": "enum",
      "values": [
        "merit-increase",
        "promotion",
        "market-adjustment",
        "role-change",
        "performance-bonus",
        "annual-adjustment",
        "cost-of-living",
        "retention-bonus"
      ],
      "required": true
    },
    {
      "id": "bonusType",
      "label": "Bonus Type",
      "type": "enum",
      "values": [
        "thr-annual-holiday",
        "performance-based",
        "project-bonus",
        "year-end-bonus",
        "sign-on-bonus",
        "referral-bonus",
        "none"
      ],
      "required": false
    },
    {
      "id": "bonusAmount",
      "label": "Bonus Amount",
      "type": "currency",
      "required": false
    },
    {
      "id": "performanceRating",
      "label": "Performance Rating (1-5)",
      "type": "number",
      "min": 1,
      "max": 5,
      "required": false
    },
    {
      "id": "bonusMultiplier",
      "label": "Bonus Multiplier (% of salary)",
      "type": "number",
      "min": 0,
      "max": 300,
      "required": false
    },
    {
      "id": "salaryBand",
      "label": "Salary Band",
      "type": "string",
      "required": true
    },
    {
      "id": "marketBenchmark",
      "label": "Market Benchmark Salary",
      "type": "currency",
      "required": false
    },
    {
      "id": "budgetCode",
      "label": "Budget Code/Cost Center",
      "type": "string",
      "required": true
    },
    {
      "id": "approverName",
      "label": "Approver",
      "type": "string",
      "required": true
    },
    {
      "id": "approvalSignature",
      "label": "Approval Signature",
      "type": "signature",
      "required": true
    }
  ],
  "validationRules": [
    {
      "id": "increase-within-salary-band",
      "description": "Proposed salary must be within salary band range",
      "formula": "proposedSalary >= getSalaryBandMin(salaryBand) && proposedSalary <= getSalaryBandMax(salaryBand)"
    },
    {
      "id": "performance-alignment",
      "description": "Bonus aligned with performance rating (low rating = no bonus)",
      "formula": "bonusType == null || performanceRating == null || (performanceRating >= 3 && bonusAmount > 0) || (performanceRating < 3 && bonusAmount == 0)"
    },
    {
      "id": "budget-compliance",
      "description": "Compensation increase within allocated budget",
      "formula": "getBudgetRemaining(budgetCode) >= (proposedSalary - currentSalary)"
    },
    {
      "id": "compa-ratio-compliance",
      "description": "Compa-ratio between 0.8–1.2",
      "formula": "let compa = currentSalary / marketBenchmark; compa >= 0.8 && compa <= 1.2"
    },
    {
      "id": "thr-minimum-validation",
      "description": "THR minimum is 1 month base salary",
      "formula": "bonusType != 'thr-annual-holiday' || bonusAmount >= currentSalary"
    },
    {
      "id": "approval-complete",
      "description": "Approver signature required",
      "formula": "approvalSignature != null"
    }
  ],
  "actionTriggers": [
    {
      "id": "update-payroll",
      "trigger": "approval signed",
      "action": "update payroll system with new salary",
      "effectiveFrom": "effectiveDate",
      "system": "payroll"
    },
    {
      "id": "schedule-bonus-payment",
      "trigger": "bonusAmount > 0",
      "action": "schedule bonus payment in payroll",
      "paymentDate": "first-of-month",
      "notifyFinance": true
    },
    {
      "id": "flag-above-band-max",
      "trigger": "proposedSalary > getSalaryBandMax(salaryBand)",
      "action": "flag for exception approval",
      "assignTo": "compensation-committee",
      "priority": "high"
    },
    {
      "id": "market-review-outliers",
      "trigger": "compa-ratio > 1.2",
      "action": "schedule market review to assess outlier status",
      "dueDate": "end-of-quarter"
    },
    {
      "id": "generate-summary",
      "trigger": "all approvals complete",
      "action": "generate compensation adjustment letter",
      "format": "PDF",
      "sendTo": "employee"
    }
  ]
}
```

### Compensation Calculator
Location: `backend/services/hr/compensationCalculator.ts`

Implement:
- **Salary Band Lookup**: Min/mid/max by level and location
- **Compa-Ratio**: Current salary ÷ market benchmark
- **Performance-to-Increase Matrix**: Rating (1–5) → increase %
- **Bonus Multiplier**: Performance × salary × multiplier

```typescript
interface CompensationCalculation {
  currentSalary: number;
  proposedSalary: number;
  increase: number;
  increasePercentage: number;
  compaRatio: number;
  bandMin: number;
  bandMid: number;
  bandMax: number;
  bonusAmount: number;
  totalCost: number;
}

function calculateCompensation(input: {
  currentSalary: number;
  performanceRating: number;
  salaryBand: string;
  marketBenchmark: number;
}): CompensationCalculation
```

### Compensation Analytics Widget
Location: `frontend/components/hr/CompensationAnalyticsWidget.tsx`

Display:
- **Box Plots**: Salary distribution by level, band, and location
- **Distribution Charts**: Compa-ratio spread (0.8–1.2 target zone)
- **Trend Analysis**: Year-over-year salary movement
- **Budget vs. Actual**: Spending against allocation
- **Equity Analysis**: Gender and diversity pay gap metrics

### Document Types Supported
1. **Salary Adjustment Letter**: Formal salary change notification
2. **Bonus Letter**: Bonus award communication
3. **Comp Review Form**: Compensation review and adjustment form
4. **Market Benchmarking**: External salary survey data
5. **Salary Structure**: Band definitions and parameters
6. **THR Calculation**: Holiday allowance calculation
7. **Incentive Statement**: Bonus/incentive plan details
8. **Adjustment Approval**: Manager/HR approval documentation

### Acceptance Criteria
- [ ] Template JSON validates against schema
- [ ] All 6 validation rules enforce constraints
- [ ] Salary band lookup returns correct min/mid/max
- [ ] Compa-ratio calculated accurately (0.8–1.2 target)
- [ ] Performance-to-increase matrix maps correctly
- [ ] All 5 action triggers execute correctly
- [ ] Payroll integration updates salary effective immediately
- [ ] Bonus payment scheduled for first of following month
- [ ] Exception approvals route to compensation committee
- [ ] Market review scheduled for outliers (compa >1.2)
- [ ] Adjustment letter generated as PDF with all details
- [ ] Budget validation prevents overspend
- [ ] Box plot widget renders 500+ employees with salary data
- [ ] Pay equity metrics calculated and visualized
- [ ] YoY trend analysis accurate and up-to-date

---

## LON-157: Disciplinary & Exit Processing Workflow Template

### Summary
Comprehensive disciplinary and exit management workflow supporting progressive discipline (SP1/SP2/SP3), resignation processing, termination, mutual separation (PHK), exit interviews, clearance procedures, and final settlements. Includes severance calculation per Indonesian labor law.

### File Artifacts
- **Template**: `backend/templates/hr/hr-disciplinary-exit.json`
- **Frontend Route**: `/workflows/disciplinary-exit`

### Template Structure (18 Extraction Fields)

```json
{
  "workflowId": "disciplinary-exit",
  "name": "Disciplinary & Exit Processing",
  "extractionFields": [
    {
      "id": "employeeId",
      "label": "Employee ID",
      "type": "string",
      "required": true
    },
    {
      "id": "employeeName",
      "label": "Employee Name",
      "type": "string",
      "required": true
    },
    {
      "id": "processType",
      "label": "Process Type",
      "type": "enum",
      "values": [
        "disciplinary-sp1",
        "disciplinary-sp2",
        "disciplinary-sp3",
        "resignation",
        "termination-cause",
        "termination-no-cause",
        "phk-mutual-separation",
        "exit-interview"
      ],
      "required": true
    },
    {
      "id": "incidentDate",
      "label": "Incident Date",
      "type": "date",
      "required": true
    },
    {
      "id": "incidentDescription",
      "label": "Incident/Violation Description",
      "type": "text",
      "required": true
    },
    {
      "id": "violationType",
      "label": "Violation Type",
      "type": "enum",
      "values": [
        "absence-without-notice",
        "conduct-violation",
        "policy-breach",
        "performance-failure",
        "insubordination",
        "gross-misconduct",
        "competency-mismatch",
        "other"
      ],
      "required": true
    },
    {
      "id": "priorWarningCount",
      "label": "Prior Warning Count (SP1, SP2)",
      "type": "number",
      "required": true
    },
    {
      "id": "warningValidityEndDate",
      "label": "Last Warning Validity End Date",
      "type": "date",
      "required": false
    },
    {
      "id": "resignationDate",
      "label": "Resignation/Exit Date",
      "type": "date",
      "required": true
    },
    {
      "id": "noticeGivenDate",
      "label": "Notice Given Date",
      "type": "date",
      "required": false
    },
    {
      "id": "severanceEligible",
      "label": "Severance Eligible",
      "type": "boolean",
      "required": true
    },
    {
      "id": "yearsOfService",
      "label": "Years of Service",
      "type": "number",
      "required": true
    },
    {
      "id": "grossSalary",
      "label": "Gross Monthly Salary",
      "type": "currency",
      "required": true
    },
    {
      "id": "outstandingLoans",
      "label": "Outstanding Loans/Advances",
      "type": "currency",
      "required": false
    },
    {
      "id": "accrualLeaveBalance",
      "label": "Accrued Leave Days (Payment Due)",
      "type": "number",
      "required": true
    },
    {
      "id": "clearanceChecklistComplete",
      "label": "Clearance Checklist Complete",
      "type": "boolean",
      "required": true
    },
    {
      "id": "accessRevoked",
      "label": "System Access Revoked",
      "type": "boolean",
      "required": true
    },
    {
      "id": "approverName",
      "label": "Approver/HR Manager",
      "type": "string",
      "required": true
    }
  ],
  "validationRules": [
    {
      "id": "warning-sequence",
      "description": "Warnings must follow SP1→SP2→SP3 sequence",
      "formula": "(processType != 'disciplinary-sp1' && processType != 'disciplinary-sp2' && processType != 'disciplinary-sp3') || (processType == 'disciplinary-sp1' && priorWarningCount == 0) || (processType == 'disciplinary-sp2' && priorWarningCount == 1) || (processType == 'disciplinary-sp3' && priorWarningCount == 2)"
    },
    {
      "id": "sp-validity-6-months",
      "description": "Warning valid for 6 months; if expired, restart at SP1",
      "formula": "processType not in ['disciplinary-sp1', 'disciplinary-sp2', 'disciplinary-sp3'] || (warningValidityEndDate == null || dateDiff(today(), warningValidityEndDate) <= 180)"
    },
    {
      "id": "severance-uu-cipta-kerja",
      "description": "Severance max 9 months per UU Cipta Kerja",
      "formula": "!severanceEligible || calculateSeverance(yearsOfService, grossSalary) <= (grossSalary * 9)"
    },
    {
      "id": "notice-period-30-days",
      "description": "Notice period minimum 30 days",
      "formula": "processType not in ['resignation', 'phk-mutual-separation'] || dateDiff(resignationDate, noticeGivenDate) >= 30"
    },
    {
      "id": "clearance-complete",
      "description": "Clearance checklist must be complete before final settlement",
      "formula": "clearanceChecklistComplete == true"
    },
    {
      "id": "access-revoked",
      "description": "All system access must be revoked",
      "formula": "accessRevoked == true"
    },
    {
      "id": "no-outstanding-loans",
      "description": "No outstanding loans when processing exit",
      "formula": "outstandingLoans == null || outstandingLoans == 0"
    },
    {
      "id": "leave-payment-calculated",
      "description": "Accrued leave balance converted to payment",
      "formula": "accrualLeaveBalance >= 0"
    }
  ],
  "actionTriggers": [
    {
      "id": "update-hr-record",
      "trigger": "disciplinary action or exit process initiated",
      "action": "update employee HR record with action details",
      "system": "hr-record-system"
    },
    {
      "id": "calculate-severance",
      "trigger": "exit approved and severanceEligible == true",
      "action": "calculate severance per UU Cipta Kerja formula",
      "notifyFinance": true
    },
    {
      "id": "initiate-clearance",
      "trigger": "resignation or termination approved",
      "action": "send clearance form to IT, Finance, Facilities, Manager",
      "clearanceDepts": ["IT", "Finance", "Facilities", "Legal"]
    },
    {
      "id": "process-final-settlement",
      "trigger": "clearance complete and access revoked",
      "action": "process final salary settlement and accrued leave payment",
      "assignTo": "payroll"
    },
    {
      "id": "revoke-access",
      "trigger": "exit date reached",
      "action": "disable email, system logins, badge access",
      "system": "iam-system",
      "priority": "critical"
    },
    {
      "id": "generate-experience-letter",
      "trigger": "exit processing complete",
      "action": "generate experience letter for employee",
      "format": "PDF",
      "sendTo": "employee"
    }
  ]
}
```

### Severance Calculator
Location: `backend/services/hr/severanceCalculator.ts`

Implement UU Cipta Kerja severance formula:
- **Uang Pesangon** (Severance): 1 month × years of service (max 9 months)
- **UPMK** (Supplementary Severance): Percentage multiplier table by reason
- **Uang Penggantian Hak**: Accrued leave (full payment) + 15% housing allowance + 15% medical allowance
- **Termination Reason Multiplier**: With cause (lower), without cause (higher)

```typescript
interface SeveranceCalculation {
  uangPesangon: number;        // 1 month × years
  upmk: number;                // Table-based multiplier
  uangPenggantiHak: {
    accrualLeavePayment: number;
    housingAllowance15pct: number;
    medicalAllowance15pct: number;
    total: number;
  };
  totalSeverance: number;
  terminationReason: string;
  multiplier: number;
}

function calculateSeverance(input: {
  yearsOfService: number;
  grossSalary: number;
  accrualLeaveDays: number;
  terminationReason: string;
}): SeveranceCalculation
```

### Exit Clearance Workflow
Location: `frontend/components/hr/ExitClearanceWorkflow.tsx`

Implement multi-department tracking:
- **IT**: System access, email archival, equipment return
- **Finance**: Loan settlement, final paycheck processing
- **Facilities**: Badge, keys, parking access return
- **Legal**: Contract conclusion, NDA compliance
- **Manager**: Knowledge transfer, handover checklist
- Dashboard status showing clearance progress per department

### Exit Analytics Widget
Location: `frontend/components/hr/ExitAnalyticsWidget.tsx`

Display:
- **Turnover Rate**: Voluntary vs. involuntary by month/quarter/year
- **Exit Reasons**: Categorized breakdown (resignation, termination, etc.)
- **Tenure Analysis**: Average tenure by department, role, exit type
- **Trend Analysis**: Year-over-year comparison
- **Retention Risk**: Employees with high exit probability

### Document Types Supported
1. **SP1 Warning**: First written warning
2. **SP2 Warning**: Second written warning
3. **SP3 Warning**: Final written warning
4. **Resignation Letter**: Employee resignation
5. **Termination Letter**: Company termination (with/without cause)
6. **PHK Letter** (Mutual Separation): Mutual agreement termination
7. **Exit Interview**: Feedback on employment experience
8. **Clearance Form**: Multi-department clearance checklist
9. **Final Settlement**: Severance and benefit payout documentation
10. **Experience Letter**: Employment verification letter

### Acceptance Criteria
- [ ] Template JSON validates against schema
- [ ] All 8 validation rules enforce constraints
- [ ] Warning sequence enforced (SP1→SP2→SP3)
- [ ] Warning validity 6-month check prevents double-counting
- [ ] Severance calculation per UU Cipta Kerja (max 9 months)
- [ ] UPMK table applied correctly based on termination reason
- [ ] Notice period 30-day minimum enforced
- [ ] All 6 action triggers execute correctly
- [ ] Clearance workflow routes to all 4+ departments
- [ ] Access revocation immediate on exit date
- [ ] Final settlement includes accrued leave + housing/medical allowance (15% each)
- [ ] Experience letter generated as PDF with all details
- [ ] Turnover analytics computed month-over-month
- [ ] Exit reasons categorized and visualized
- [ ] Tenure analysis by department/role/exit type
- [ ] Clearance tracking dashboard shows department progress
- [ ] No dual-processing (prevent multiple exits for same employee)

---

## Integration Points

### Cross-Workflow Dependencies
- **Payroll → Leave**: Unpaid leave reduces salary (LON-152 ← LON-153)
- **Performance → Compensation**: Rating affects bonus eligibility (LON-154 → LON-156)
- **Performance → Disciplinary**: Low ratings may trigger PIP; repeated low ratings lead to exit (LON-154 → LON-157)
- **Training → Compliance**: Mandatory training tracked for exit clearance (LON-155 → LON-157)
- **Exit → Payroll**: Final settlement includes accrued leave and severance (LON-157 → LON-152)

### System Integrations
- **Payroll System**: Updates salary, schedules payments
- **LMS (Learning Management System)**: Logs training completions
- **Calendar Service**: Publishes leave dates
- **IAM System**: Revokes access on exit
- **Finance System**: Processes bonus and severance payments
- **HR Records System**: Archives all appraisals, disciplinary actions, exit data

### Compliance & Legal
- **Indonesian Labor Law**: UU Ketenagakerjaan, UU Cipta Kerja (severance formula)
- **Tax Authority**: PPh 21 rates and PTKP per Lampiran PMK-262/2010
- **BPJS**: Contribution rates and employer/employee split
- **Data Protection**: GDPR/local regulations for PII handling in exit files

---

## Testing & Deployment

### Unit Test Coverage
- PPh 21 tax bracket calculations
- BPJS contribution validation
- Severance calculations (all termination reasons)
- Leave balance accrual and carry-over
- KPI weight sum validation
- Warning sequence enforcement
- Compa-ratio compliance checks

### Integration Tests
- End-to-end payroll workflow from slip entry to payment
- Leave request → approval → calendar update → payroll deduction
- Performance review → compensation update → payroll change
- Exit process → clearance → final settlement → access revocation

### UAT Scenarios
1. Process one complete payroll cycle with 50+ employees (LON-152)
2. Request 3 leave types (annual, sick, maternity) from intake to approval (LON-153)
3. Conduct annual performance review with promotion recommendation (LON-154)
4. Enroll employee in mandatory AML training with expiry tracking (LON-155)
5. Calculate performance bonus and update payroll (LON-156)
6. Execute full exit workflow from resignation to final settlement (LON-157)

### Deployment Checklist
- [ ] All template JSONs deployed to `backend/templates/hr/`
- [ ] Database migrations for new fields/tables completed
- [ ] All validators and calculators unit tested
- [ ] Frontend routes created and linked to templates
- [ ] Integration tests passing (all 6 workflows)
- [ ] UAT sign-off from HR stakeholders
- [ ] Compliance review completed
- [ ] Training materials prepared for HR team
- [ ] Documentation updated in Confluence/Wiki
- [ ] Rollback plan documented
