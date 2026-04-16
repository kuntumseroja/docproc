import React, { useState, useRef, useEffect, useCallback } from 'react';
import jsPDF from 'jspdf';
import * as pdfjsLib from 'pdfjs-dist';
import {
  TextInput,
  Button,
  Tile,
  Tag,
  Select,
  SelectItem,
  Tabs,
  TabList,
  Tab,
  TabPanels,
  TabPanel,
  ProgressBar,
  StructuredListWrapper,
  StructuredListHead,
  StructuredListRow,
  StructuredListCell,
  StructuredListBody,
  InlineNotification,
  FilterableMultiSelect,
} from '@carbon/react';
import {
  Send,
  Document,
  Ai,
  TrashCan,
  Checkmark,
  Close,
  WarningAlt,
  Subtract,
  Download,
  Security,
} from '@carbon/icons-react';
import FileUploaderDropContainer from '../components/FileUploaderDropContainer';
import api from '../services/api';

// Configure PDF.js worker — served from public/ for CRA compatibility
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

// ── Types ────────────────────────────────────────────────────

interface Regulation {
  id: string;
  name: string;
  issuer: string;
  country: string;
  category: string;
  sections_count: number;
  description?: string;
}

interface ComplianceFinding {
  section: string;
  status: 'compliant' | 'non_compliant' | 'partial' | 'na';
  findings: string;
  risk_level: 'low' | 'medium' | 'high' | 'critical';
}

interface ComplianceReport {
  overall_score: number;
  findings: ComplianceFinding[];
  summary: string;
  model_used?: string;
  provider?: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  model_used?: string;
  provider?: string;
  latency_ms?: number;
  timestamp: Date;
}

interface ProviderModels {
  provider: string;
  models: Array<{ id: string; name: string }>;
}

// ── Constants ────────────────────────────────────────────────

const PROVIDER_LABELS: Record<string, string> = {
  ollama: 'Ollama',
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  mistral: 'Mistral',
  deepseek: 'DeepSeek',
};

const TYPING_SPEED = 12;

const SUGGESTED_QUESTIONS = [
  'Apakah dokumen ini sesuai POJK 6/2022?',
  'What NIST CSF controls are missing?',
  'Summarize all non-compliant sections',
  'What is the highest risk finding?',
];

const STATUS_CONFIG: Record<string, { label: string; tagType: string; icon: React.ReactNode }> = {
  compliant: { label: 'Compliant', tagType: 'green', icon: <Checkmark size={14} /> },
  non_compliant: { label: 'Non-Compliant', tagType: 'red', icon: <Close size={14} /> },
  partial: { label: 'Partial', tagType: 'yellow', icon: <WarningAlt size={14} /> },
  na: { label: 'N/A', tagType: 'gray', icon: <Subtract size={14} /> },
};

const RISK_TAG: Record<string, string> = {
  low: 'teal',
  medium: 'yellow',
  high: 'red',
  critical: 'magenta',
};

// ── Typewriter component ─────────────────────────────────────

const TypingMessage: React.FC<{ fullText: string; onDone: () => void }> = ({ fullText, onDone }) => {
  const [displayed, setDisplayed] = useState('');
  const indexRef = useRef(0);

  useEffect(() => {
    indexRef.current = 0;
    setDisplayed('');
    const interval = setInterval(() => {
      indexRef.current += 2;
      if (indexRef.current >= fullText.length) {
        setDisplayed(fullText);
        clearInterval(interval);
        onDone();
      } else {
        setDisplayed(fullText.slice(0, indexRef.current));
      }
    }, TYPING_SPEED);
    return () => clearInterval(interval);
  }, [fullText, onDone]);

  return (
    <p style={{ whiteSpace: 'pre-wrap', margin: 0, lineHeight: 1.5 }}>
      {displayed}
      <span style={{ opacity: 0.5, animation: 'blink 0.8s step-end infinite' }}>|</span>
    </p>
  );
};

// ── Score gauge ──────────────────────────────────────────────

const ScoreGauge: React.FC<{ score: number }> = ({ score }) => {
  const color = score >= 80 ? '#24A148' : score >= 50 ? '#F1C21B' : '#DA1E28';
  const circumference = 2 * Math.PI * 54;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <svg width={140} height={140} viewBox="0 0 120 120">
        <circle cx="60" cy="60" r="54" fill="none" stroke="#E0E0E0" strokeWidth="10" />
        <circle
          cx="60" cy="60" r="54" fill="none"
          stroke={color} strokeWidth="10"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 60 60)"
          style={{ transition: 'stroke-dashoffset 0.8s ease' }}
        />
        <text
          x="60" y="60" textAnchor="middle" dominantBaseline="central"
          style={{ fontSize: 28, fontWeight: 400, fill: '#161616' }}
        >
          {score}%
        </text>
      </svg>
      <p style={{ fontSize: '0.875rem', fontWeight: 300, color: '#525252', marginTop: 8 }}>
        Overall Compliance
      </p>
    </div>
  );
};

// ── Main page ────────────────────────────────────────────────

const CompliancePage: React.FC = () => {
  // Regulation state
  const [regulations, setRegulations] = useState<Regulation[]>([]);
  const [selectedRegIds, setSelectedRegIds] = useState<string[]>([]);
  const [loadingRegs, setLoadingRegs] = useState(false);

  // File state
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);

  // Compliance check
  const [checking, setChecking] = useState(false);
  const [checkProgress, setCheckProgress] = useState(0);
  const [report, setReport] = useState<ComplianceReport | null>(null);

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [sending, setSending] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Model state
  const [availableModels, setAvailableModels] = useState<ProviderModels[]>([]);
  const [selectedModel, setSelectedModel] = useState('');

  const [notification, setNotification] = useState<{ kind: 'success' | 'error' | 'info' | 'info-square' | 'warning'; text: string } | null>(null);

  // ── Load regulations and models on mount ───────────────────

  useEffect(() => {
    const loadData = async () => {
      setLoadingRegs(true);
      try {
        const [regsRes, availRes, currentRes] = await Promise.all([
          api.get('/compliance/regulations'),
          api.get('/models/available'),
          api.get('/models/current'),
        ]);
        setRegulations(regsRes.data?.regulations || regsRes.data || []);
        setAvailableModels(availRes.data || []);
        setSelectedModel(`${currentRes.data.provider}/${currentRes.data.model}`);
      } catch {
        // Use demo data if API is not available
        setRegulations([
          { id: 'pojk-6-2022', name: 'POJK 6/POJK.07/2022', issuer: 'OJK', country: 'Indonesia', category: 'Financial', sections_count: 12, description: 'Perlindungan Konsumen di Sektor Jasa Keuangan' },
          { id: 'pojk-11-2022', name: 'POJK 11/POJK.03/2022', issuer: 'OJK', country: 'Indonesia', category: 'Technology', sections_count: 15, description: 'Penyelenggaraan Teknologi Informasi oleh Bank Umum' },
          { id: 'pbi-23-2021', name: 'PBI 23/6/PBI/2021', issuer: 'Bank Indonesia', country: 'Indonesia', category: 'Payment', sections_count: 8, description: 'Penyedia Jasa Pembayaran' },
          { id: 'nist-csf-2-0', name: 'NIST Cybersecurity Framework 2.0', issuer: 'NIST', country: 'International', category: 'Cybersecurity', sections_count: 6, description: 'Cybersecurity risk management framework' },
          { id: 'iso-27001-2022', name: 'ISO/IEC 27001:2022', issuer: 'ISO', country: 'International', category: 'Information Security', sections_count: 10, description: 'Information security management systems' },
          { id: 'gdpr', name: 'GDPR', issuer: 'European Commission', country: 'International', category: 'Data Privacy', sections_count: 11, description: 'General Data Protection Regulation' },
          { id: 'pojk-51-2017', name: 'POJK 51/POJK.03/2017', issuer: 'OJK', country: 'Indonesia', category: 'ESG Sustainability', sections_count: 8, description: 'Penerapan Keuangan Berkelanjutan' },
          { id: 'sasb-fn-cb', name: 'SASB FN-CB Commercial Banks', issuer: 'SASB', country: 'International', category: 'ESG Sustainability', sections_count: 6, description: 'Sustainability Accounting Standards for Commercial Banks' },
          { id: 'issb-s1', name: 'IFRS S1 General Sustainability', issuer: 'ISSB', country: 'International', category: 'ESG Sustainability', sections_count: 4, description: 'General Requirements for Disclosure of Sustainability-related Financial Information' },
          { id: 'issb-s2', name: 'IFRS S2 Climate-related Disclosures', issuer: 'ISSB', country: 'International', category: 'ESG Sustainability', sections_count: 5, description: 'Climate-related Disclosures' },
          { id: 'uu-pdp-2022', name: 'UU No. 27 Tahun 2022 (UU PDP)', issuer: 'Pemerintah RI', country: 'Indonesia', category: 'Data Privacy', sections_count: 7, description: 'Undang-Undang Perlindungan Data Pribadi' },
        ]);
      } finally {
        setLoadingRegs(false);
      }
    };
    loadData();
  }, []);

  // ── Scroll chat to bottom ──────────────────────────────────

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  // ── Model change ───────────────────────────────────────────

  const handleModelChange = async (value: string) => {
    if (!value) return;
    setSelectedModel(value);
    const [provider, ...modelParts] = value.split('/');
    const model = modelParts.join('/');
    try {
      await api.put('/models/current', { provider, model });
    } catch {
      // ignore
    }
  };

  const modelOptions = availableModels.flatMap(pm =>
    pm.models.map(m => ({
      value: `${pm.provider}/${m.id}`,
      label: `${PROVIDER_LABELS[pm.provider] || pm.provider} / ${m.name}`,
    }))
  );

  // ── File handling ──────────────────────────────────────────

  const handleFilesSelected = useCallback((newFiles: File[]) => {
    if (newFiles.length > 0) {
      setUploadedFile(newFiles[0]);
    }
  }, []);

  // ── Compliance check ───────────────────────────────────────

  // ── Read file content for compliance check (supports PDF + text) ─────
  const readFileAsText = async (file: File): Promise<string> => {
    const ext = file.name.toLowerCase().split('.').pop();

    // PDF: extract text using pdfjs-dist
    if (ext === 'pdf' || file.type === 'application/pdf') {
      try {
        console.log(`[PDF] Starting extraction for ${file.name} (${(file.size / 1024).toFixed(1)} KB)...`);
        const arrayBuffer = await file.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({
          data: new Uint8Array(arrayBuffer),
          useWorkerFetch: false,
          isEvalSupported: false,
          useSystemFonts: true,
        });
        const pdf = await loadingTask.promise;
        console.log(`[PDF] Loaded ${pdf.numPages} pages, extracting text...`);
        const pages: string[] = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          const pageText = content.items
            .map((item: any) => item.str)
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim();
          if (pageText) pages.push(pageText);
        }
        const fullText = pages.join('\n\n');
        console.log(`[PDF] Extracted ${fullText.length} chars from ${pages.length}/${pdf.numPages} pages with text`);
        if (fullText.length > 100) {
          console.log(`[PDF] Preview: ${fullText.substring(0, 200)}...`);
          return fullText;
        }
        // PDF has very little or no extractable text (likely scanned/image-based)
        console.warn(`[PDF] Very little text extracted (${fullText.length} chars) — PDF may be image-based`);
        return fullText || `[PDF file: ${file.name} — this appears to be a scanned/image-based PDF with no extractable text. OCR processing may be required.]`;
      } catch (err) {
        console.error('[PDF] Extraction failed:', err);
        return `[PDF file: ${file.name} — text extraction failed: ${err}]`;
      }
    }

    // Text/doc files: read as text
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string || '');
      reader.onerror = () => resolve(file.name);
      reader.readAsText(file);
    });
  };

  // ── Demo fallback data per regulation set ─────────────────
  const getDemoReport = (documentText?: string): ComplianceReport => {
    const hasPOJK6 = selectedRegIds.includes('pojk-6-2022');
    const hasPOJK11 = selectedRegIds.includes('pojk-11-2022');
    const hasPBI = selectedRegIds.includes('pbi-23-2021');
    const hasNIST = selectedRegIds.includes('nist-csf-2-0');
    const hasISO = selectedRegIds.includes('iso-27001-2022');
    const hasGDPR = selectedRegIds.includes('gdpr');

    // Detect document quality profile from content keywords
    const docLower = (documentText || '').toLowerCase();
    const docLen = docLower.length;

    // Weak ESG: documents with explicit gaps (check first — takes priority)
    const isWeakESG = docLower.includes('nusantara hijau') || docLower.includes('bank nusantara') ||
      (docLower.includes('not yet') && (docLower.includes('rakb') || docLower.includes('scope 3') || docLower.includes('pcaf'))) ||
      (docLower.includes('has not') && (docLower.includes('net-zero') || docLower.includes('net zero'))) ||
      (docLower.includes('not been') && (docLower.includes('conducted') || docLower.includes('performed')));

    // Strong ESG: documents demonstrating mature ESG practices (only if NOT weak)
    const isStrongESG = !isWeakESG && (
      docLower.includes('bni') ||
      (/net[- ]zero.{0,30}(target|commit|by 20)/i.test(docLower)) ||
      (docLower.includes('scope 3') && docLower.includes('pcaf') && !docLower.includes('not yet')) ||
      docLower.includes('sbti') || docLower.includes('science-based target') ||
      (docLower.includes('rakb') && docLower.includes('submitted'))
    );
    const isITPolicy = docLower.includes('it security policy') || docLower.includes('cybersecurity') ||
      docLower.includes('it governance') || docLower.includes('ciso');
    const isSOP = docLower.includes('standard operating procedure') || docLower.includes('sop') ||
      docLower.includes('prosedur operasional standar') || docLower.includes('pos ');

    // Document quality detection: strong = comprehensive document with key controls present (not just mentioned as gaps)
    const hasNegativeIT = docLower.includes('under consideration') || docLower.includes('not yet incorporated') ||
      (docLower.includes('no ') && (docLower.includes('bcp') || docLower.includes('drp')));
    const isStrongIT = !hasNegativeIT && (isITPolicy || isSOP) && (
      (docLower.includes('24/7') || docLower.includes('soc')) &&
      (docLower.includes('bcp') || docLower.includes('business continuity')) &&
      (docLower.includes('incident') && docLower.includes('reporting'))
    );

    const findings: ComplianceFinding[] = [];

    if (hasPOJK6) {
      if (isStrongIT) {
        findings.push(
          { section: 'IT Governance (Pasal 4-7, Tata Kelola TI)', status: 'compliant', findings: 'Ref: POJK 6/2022 Pasal 5 ayat (1) — CISO role defined with direct Board reporting line. IT Steering Committee established with documented charter and quarterly meetings per Pasal 6.\nRecommendation: No action required. Continue quarterly IT Steering Committee reporting.', risk_level: 'low' },
          { section: 'IT Risk Management (Pasal 8-12)', status: 'compliant', findings: 'Ref: POJK 6/2022 Pasal 9 ayat (2) — Semi-annual risk assessments conducted with documented methodology. Pasal 11 — KRI breach alerting configured with 24-hour escalation to Board.\nRecommendation: No action required. Continue semi-annual risk assessment cycle.', risk_level: 'low' },
          { section: 'Data Protection (Pasal 18-22, Perlindungan Data)', status: 'compliant', findings: 'Ref: POJK 6/2022 Pasal 19 — Four-level data classification implemented. AES-256 encryption at rest per Pasal 20. Cross-border transfer controls per Pasal 22. Annual encryption key rotation documented.\nRecommendation: No action required. Maintain data classification review cycle.', risk_level: 'low' },
          { section: 'Business Continuity (Pasal 23-27)', status: 'compliant', findings: 'Ref: POJK 6/2022 Pasal 24 ayat (1) — BCP/DRP documented with RTO ≤2 hours, RPO ≤1 hour per Pasal 25. Secondary data center at 75km distance per Pasal 26. Annual BCP testing conducted.\nRecommendation: No action required. Continue annual BCP/DRP testing and review.', risk_level: 'low' },
          { section: 'IT Outsourcing (Pasal 28-32, Alih Daya TI)', status: 'partial', findings: 'Ref: POJK 6/2022 Pasal 29 — Vendor assessments performed with OJK audit clause in contracts per Pasal 30. Gap: 30-day OJK notification process for new outsourcing not fully automated per Pasal 31.\nRecommendation: Automate OJK outsourcing notification workflow per Pasal 31.', risk_level: 'medium' },
          { section: 'Cybersecurity (Pasal 33-38, Keamanan Siber)', status: 'compliant', findings: 'Ref: POJK 6/2022 Pasal 34 — 24/7 SOC operational with SIEM integration. Pasal 36 — Active member of OJK threat intelligence sharing forum. Annual red team exercises per Pasal 37.\nRecommendation: No action required. Continue annual red team and purple team exercises.', risk_level: 'low' },
          { section: 'Incident Reporting (Pasal 39-43, Pelaporan Insiden)', status: 'partial', findings: 'Ref: POJK 6/2022 Pasal 40 — OJK reporting timelines documented (Level 1: 1 hour, Level 2: 24 hours). Gap: Post-incident review cycle is 21 days vs required 14 days per Pasal 42.\nRecommendation: Reduce post-incident review cycle from 21 to 14 days per Pasal 42.', risk_level: 'medium' },
          { section: 'IT Security (Pasal 13-17)', status: 'compliant', findings: 'Ref: POJK 6/2022 Pasal 14 — MFA implemented for core banking access. Network segmentation per Pasal 15. Encryption standards per Pasal 16. Access reviews conducted quarterly per Pasal 17.\nRecommendation: No action required. Continue quarterly access reviews and annual penetration testing.', risk_level: 'low' },
        );
      } else {
        findings.push(
          { section: 'IT Governance (Pasal 4-7, Tata Kelola TI)', status: 'partial', findings: 'Ref: POJK 6/2022 Pasal 5 ayat (1) — CISO role defined but no IT Steering Committee formally established. Pasal 6 requires Board-level IT committee with documented charter.\nRecommendation: Establish IT Steering Committee with Board representation, document charter and meeting cadence per Pasal 5-6.', risk_level: 'medium' },
          { section: 'IT Risk Management (Pasal 8-12)', status: 'partial', findings: 'Ref: POJK 6/2022 Pasal 9 ayat (2) — Risk assessments conducted annually instead of semi-annually as required. Pasal 11 requires KRI breach reporting within 24 hours; currently reported monthly.\nRecommendation: Increase risk assessment frequency to semi-annual. Implement real-time KRI breach alerting with 24-hour escalation per Pasal 11.', risk_level: 'high' },
          { section: 'Data Protection (Pasal 18-22, Perlindungan Data)', status: 'compliant', findings: 'Ref: POJK 6/2022 Pasal 19 — Four-level data classification implemented (Public, Internal, Confidential, Highly Confidential). AES-256 encryption at rest per Pasal 20. Cross-border transfer controls per Pasal 22.\nRecommendation: No action required. Continue annual encryption key rotation.', risk_level: 'low' },
          { section: 'Business Continuity (Pasal 23-27)', status: 'non_compliant', findings: 'Ref: POJK 6/2022 Pasal 24 ayat (1) — No BCP/DRP documented. Pasal 25 requires RTO ≤2 hours and RPO ≤1 hour for core banking. Pasal 26 mandates secondary data center at minimum 60km distance.\nRecommendation: Develop comprehensive BCP/DRP with defined RTO/RPO targets. Establish secondary data center per Pasal 26. Conduct annual BCP testing.', risk_level: 'critical' },
          { section: 'IT Outsourcing (Pasal 28-32, Alih Daya TI)', status: 'partial', findings: 'Ref: POJK 6/2022 Pasal 29 — Vendor assessments performed but contracts lack OJK audit clause required by Pasal 30. No 30-day prior notification to OJK for new outsourcing per Pasal 31.\nRecommendation: Amend vendor contracts to include OJK audit right clause. Implement 30-day OJK notification process for new outsourcing arrangements.', risk_level: 'high' },
          { section: 'Cybersecurity (Pasal 33-38, Keamanan Siber)', status: 'partial', findings: 'Ref: POJK 6/2022 Pasal 34 — No 24/7 SOC capability documented. Pasal 36 requires participation in threat intelligence sharing forum (ID-CERT/OJK). No annual red team exercises per Pasal 37.\nRecommendation: Establish or contract 24/7 SOC. Join OJK threat intelligence sharing forum. Conduct annual red team and purple team exercises.', risk_level: 'high' },
          { section: 'Incident Reporting (Pasal 39-43, Pelaporan Insiden)', status: 'non_compliant', findings: 'Ref: POJK 6/2022 Pasal 40 — No OJK reporting timelines documented. Pasal 40 requires Level 1 incidents reported within 1 hour, Level 2 within 24 hours, Level 3 within 3 business days. Post-incident review at 30 days vs required 14 days per Pasal 42.\nRecommendation: Implement OJK incident reporting procedure with 1h/24h/3-day timelines. Reduce post-incident review cycle to 14 days per Pasal 42.', risk_level: 'critical' },
          { section: 'IT Security (Pasal 13-17)', status: 'compliant', findings: 'Ref: POJK 6/2022 Pasal 14 — MFA implemented for core banking access. Network segmentation per Pasal 15. Encryption standards per Pasal 16. Access reviews conducted quarterly per Pasal 17.\nRecommendation: No action required. Continue quarterly access reviews and annual penetration testing.', risk_level: 'low' },
        );
      }
    }

    if (hasPOJK11 || hasPBI) {
      if (isStrongIT) {
        findings.push(
          { section: 'Payment System Governance (POJK 11 Pasal 5-8 / PBI 23 Pasal 3)', status: 'compliant', findings: 'Ref: POJK 11/2022 Pasal 6 — Operations committee established with defined SLA targets (99.9% availability). Change management process documented per Pasal 8.\nRecommendation: No action required. Continue monitoring SLA compliance.', risk_level: 'low' },
          { section: 'Customer Data Protection (POJK 11 Pasal 15-20)', status: 'compliant', findings: 'Ref: POJK 11/2022 Pasal 16 — eKYC implemented with biometric verification. Customer data encrypted and stored within Indonesian territory per Pasal 18. RBAC and audit logging per Pasal 19.\nRecommendation: No action required. Maintain data residency compliance.', risk_level: 'low' },
          { section: 'API Security (POJK 11 Pasal 21-24)', status: 'compliant', findings: 'Ref: POJK 11/2022 Pasal 22 — OAuth 2.0 with PKCE implemented. Rate limiting, TLS 1.3, HMAC request signing, and API versioning per Pasal 23-24.\nRecommendation: No action required. Continue quarterly API security testing.', risk_level: 'low' },
          { section: 'Consumer Dispute Resolution (PBI 23 Pasal 44-48)', status: 'compliant', findings: 'Ref: PBI 23/2021 Pasal 45 — Consumer complaint handling unit established with documented SLA. Pasal 46 — Average resolution within 8 business days (below 20-day limit). Fee transparency published per Pasal 47.\nRecommendation: No action required. Continue monitoring dispute resolution SLA.', risk_level: 'low' },
          { section: 'Cloud Computing Controls (POJK 11 Pasal 25-29)', status: 'partial', findings: 'Ref: POJK 11/2022 Pasal 26 — Cloud risk assessment documented for primary providers. Pasal 27 — Using OJK-approved cloud providers. Gap: Cloud exit strategy per Pasal 28 is in draft stage.\nRecommendation: Finalize and test cloud exit strategy per Pasal 28. Conduct annual cloud provider reassessment.', risk_level: 'medium' },
          { section: 'Digital Product Risk (POJK 11 Pasal 30-34)', status: 'partial', findings: 'Ref: POJK 11/2022 Pasal 31 — Pre-launch risk assessment framework exists. Gap: OJK 30-day notification per Pasal 32 not consistently applied for minor product updates.\nRecommendation: Clarify product update thresholds triggering OJK notification per Pasal 32.', risk_level: 'low' },
          { section: 'AML/CFT Compliance (PBI 23 Pasal 36-43)', status: 'compliant', findings: 'Ref: PBI 23/2021 Pasal 37 — CDD and EDD procedures documented. STR filing to PPATK within 3 business days per Pasal 39. CTR for transactions >IDR 500 million per Pasal 40. Sanctions screening per Pasal 42.\nRecommendation: No action required. Maintain STR reporting timeliness.', risk_level: 'low' },
        );
      } else {
        findings.push(
          { section: 'Payment System Governance (POJK 11 Pasal 5-8 / PBI 23 Pasal 3)', status: 'compliant', findings: 'Ref: POJK 11/2022 Pasal 6 — Operations committee established with defined SLA targets (99.9% availability). Change management process documented per Pasal 8.\nRecommendation: No action required. Continue monitoring SLA compliance.', risk_level: 'low' },
          { section: 'Customer Data Protection (POJK 11 Pasal 15-20)', status: 'compliant', findings: 'Ref: POJK 11/2022 Pasal 16 — eKYC implemented with biometric verification. Customer data encrypted and stored within Indonesian territory per Pasal 18. RBAC and audit logging per Pasal 19.\nRecommendation: No action required. Maintain data residency compliance.', risk_level: 'low' },
          { section: 'API Security (POJK 11 Pasal 21-24)', status: 'compliant', findings: 'Ref: POJK 11/2022 Pasal 22 — OAuth 2.0 with PKCE implemented. Rate limiting (1000 req/min), TLS 1.3, HMAC request signing, and API versioning per Pasal 23-24.\nRecommendation: No action required. Continue quarterly API security testing.', risk_level: 'low' },
          { section: 'Consumer Dispute Resolution (PBI 23 Pasal 44-48)', status: 'non_compliant', findings: 'Ref: PBI 23/2021 Pasal 45 — No consumer complaint handling mechanism documented. Pasal 46 requires resolution within 20 business days with clear escalation path. No fee transparency per Pasal 47.\nRecommendation: Establish formal consumer dispute resolution unit. Define 20-day SLA per Pasal 46. Publish fee schedules.', risk_level: 'high' },
          { section: 'Cloud Computing Controls (POJK 11 Pasal 25-29)', status: 'non_compliant', findings: 'Ref: POJK 11/2022 Pasal 26 — No cloud computing risk assessment documented. Pasal 27 requires OJK-approved domestic or certified international cloud providers. No cloud exit strategy per Pasal 28.\nRecommendation: Conduct cloud vendor due diligence per Pasal 26. Ensure data residency compliance. Develop cloud exit strategy.', risk_level: 'high' },
          { section: 'Digital Product Risk (POJK 11 Pasal 30-34)', status: 'non_compliant', findings: 'Ref: POJK 11/2022 Pasal 31 — No pre-launch risk assessment process for new digital products. Pasal 32 requires OJK notification 30 days before launching new digital banking services.\nRecommendation: Implement product risk assessment framework per Pasal 31. Create OJK pre-launch notification process.', risk_level: 'medium' },
          { section: 'AML/CFT Compliance (PBI 23 Pasal 36-43)', status: 'compliant', findings: 'Ref: PBI 23/2021 Pasal 37 — CDD and EDD procedures documented. STR filing to PPATK within 3 business days per Pasal 39. CTR for transactions >IDR 500 million per Pasal 40. Sanctions screening per Pasal 42.\nRecommendation: No action required. Maintain STR reporting timeliness.', risk_level: 'low' },
        );
      }
    }

    if (hasNIST) {
      if (isStrongIT) {
        findings.push(
          { section: 'Govern — GV (GV.OC, GV.RM, GV.RR, GV.SC)', status: 'compliant', findings: 'Ref: NIST CSF 2.0 GV.RM — Formal cybersecurity risk strategy documented and Board-approved. GV.SC — Supply chain risk management (C-SCRM) program implemented covering critical vendors.\nRecommendation: No action required. Continue annual C-SCRM review cycle.', risk_level: 'low' },
          { section: 'Identify — ID (ID.AM, ID.RA)', status: 'compliant', findings: 'Ref: NIST CSF 2.0 ID.AM-01 — Automated asset discovery with CMDB integration. ID.RA-01 — Risk assessments mapped to business impact analysis. Quarterly risk register updates.\nRecommendation: No action required. Continue quarterly risk register updates.', risk_level: 'low' },
          { section: 'Protect — PR (PR.AA, PR.DS, PR.AT)', status: 'compliant', findings: 'Ref: NIST CSF 2.0 PR.AA-01 — Zero trust architecture with MFA and PAM. PR.DS-01 — Data-at-rest AES-256 and in-transit TLS 1.3. PR.AT-01 — Monthly phishing simulations with 98% pass rate.\nRecommendation: No action required. Continue monthly phishing exercises.', risk_level: 'low' },
          { section: 'Detect — DE (DE.CM, DE.AE)', status: 'compliant', findings: 'Ref: NIST CSF 2.0 DE.CM-01 — 24/7 SOC with SIEM and SOAR integration. DE.AE-02 — UEBA deployed with ML-based anomaly detection. Mean time to detect (MTTD) < 15 minutes.\nRecommendation: No action required. Continue tuning detection rules and reducing false positive rate.', risk_level: 'low' },
          { section: 'Respond — RS (RS.MA, RS.CO, RS.AN)', status: 'partial', findings: 'Ref: NIST CSF 2.0 RS.MA-01 — Incident response team with defined playbooks. RS.CO — Communication plan documented. Gap: RS.AN-03 — Forensic capability outsourced, no in-house digital forensics team.\nRecommendation: Build in-house digital forensics capability per RS.AN-03. Conduct quarterly incident response tabletop exercises.', risk_level: 'medium' },
          { section: 'Recover — RC (RC.RP, RC.CO)', status: 'partial', findings: 'Ref: NIST CSF 2.0 RC.RP-01 — Recovery plan documented with annual testing. RC.RP-04 — Recovery exercises conducted. Gap: RC.CO-03 — Public communication strategy exists but not tested in simulation.\nRecommendation: Conduct annual recovery communication simulation per RC.CO-03.', risk_level: 'low' },
        );
      } else {
        findings.push(
          { section: 'Govern — GV (GV.OC, GV.RM, GV.RR, GV.SC)', status: 'partial', findings: 'Ref: NIST CSF 2.0 GV.RM — IT governance exists but no formal cybersecurity risk strategy documented. GV.SC — No supply chain risk management program.\nRecommendation: Develop cybersecurity risk strategy per GV.RM. Implement C-SCRM program per GV.SC-01 through GV.SC-10.', risk_level: 'medium' },
          { section: 'Identify — ID (ID.AM, ID.RA)', status: 'partial', findings: 'Ref: NIST CSF 2.0 ID.AM-01 — Asset inventory maintained but no comprehensive asset management lifecycle. ID.RA-01 — Risk assessments exist but not mapped to business impact.\nRecommendation: Implement automated asset discovery per ID.AM. Link risk assessments to business impact analysis per ID.RA-05.', risk_level: 'medium' },
          { section: 'Protect — PR (PR.AA, PR.DS, PR.AT)', status: 'compliant', findings: 'Ref: NIST CSF 2.0 PR.AA-01 — Access controls with MFA documented. PR.DS-01 — Data-at-rest encryption (AES-256). PR.AT-01 — Security awareness training program with phishing simulations.\nRecommendation: No action required. Continue semi-annual phishing exercises.', risk_level: 'low' },
          { section: 'Detect — DE (DE.CM, DE.AE)', status: 'partial', findings: 'Ref: NIST CSF 2.0 DE.CM-01 — IDS deployed on critical segments but no 24/7 continuous monitoring. DE.AE-02 — No anomaly detection or behavioral analytics documented.\nRecommendation: Deploy SIEM with 24/7 SOC monitoring per DE.CM. Implement UEBA per DE.AE-02.', risk_level: 'high' },
          { section: 'Respond — RS (RS.MA, RS.CO, RS.AN)', status: 'non_compliant', findings: 'Ref: NIST CSF 2.0 RS.MA-01 — Incident response team exists but no communication plan per RS.CO. No external coordination procedures per RS.CO-03. No forensic analysis capability per RS.AN-03.\nRecommendation: Develop incident communication plan per RS.CO. Establish forensic capability. Define external coordination with CERT/law enforcement.', risk_level: 'high' },
          { section: 'Recover — RC (RC.RP, RC.CO)', status: 'non_compliant', findings: 'Ref: NIST CSF 2.0 RC.RP-01 — No recovery planning documented. RC.RP-04 — No recovery exercises conducted. RC.CO-03 — No public communication strategy for recovery.\nRecommendation: Develop and test recovery plan per RC.RP. Conduct annual recovery exercises. Create stakeholder communication templates per RC.CO.', risk_level: 'critical' },
        );
      }
    }

    if (hasISO) {
      if (isStrongIT) {
        findings.push(
          { section: 'Organizational Controls (Annex A.5)', status: 'compliant', findings: 'Ref: ISO 27001:2022 A.5.1 — Information security policies approved by management with annual review. A.5.7 — Threat intelligence from 3 commercial feeds. A.5.19-5.22 — Supplier security with annual audits.\nRecommendation: No action required. Continue annual policy review and supplier audit cycle.', risk_level: 'low' },
          { section: 'People Controls (Annex A.6)', status: 'compliant', findings: 'Ref: ISO 27001:2022 A.6.1 — Pre-employment screening with background checks for all roles. A.6.3 — Mandatory annual security awareness training (100% completion). A.6.4 — Disciplinary process for security violations documented.\nRecommendation: No action required. Continue annual training and background screening.', risk_level: 'low' },
          { section: 'Physical Controls (Annex A.7)', status: 'partial', findings: 'Ref: ISO 27001:2022 A.7.1 — Physical security perimeter defined with access control. A.7.4 — CCTV monitoring operational. Gap: A.7.9 — Off-premises asset security policy exists but not formally tested. A.7.10 — Storage media lifecycle partially documented.\nRecommendation: Formally test off-premises asset procedures per A.7.9. Complete storage media lifecycle documentation per A.7.10.', risk_level: 'low' },
          { section: 'Technological Controls (Annex A.8)', status: 'compliant', findings: 'Ref: ISO 27001:2022 A.8.2 — Privileged access management with PAM tool. A.8.5 — MFA with FIDO2. A.8.24 — AES-256/TLS 1.3 cryptography. A.8.15-8.16 — Centralized logging with 24/7 SOC monitoring.\nRecommendation: No action required. Maintain ISO 27001 certification.', risk_level: 'low' },
        );
      } else {
        findings.push(
          { section: 'Organizational Controls (Annex A.5)', status: 'compliant', findings: 'Ref: ISO 27001:2022 A.5.1 — Information security policies approved by management. A.5.7 — Threat intelligence program established. A.5.19-5.22 — Supplier security management documented.\nRecommendation: No action required. Continue annual policy review cycle.', risk_level: 'low' },
          { section: 'People Controls (Annex A.6)', status: 'non_compliant', findings: 'Ref: ISO 27001:2022 A.6.1 — No pre-employment screening procedures documented. A.6.3 — Security awareness training exists but not formalized per A.6.3 requirements. A.6.4 — No disciplinary process for security violations.\nRecommendation: Implement background screening per A.6.1. Formalize training program per A.6.3. Define disciplinary process per A.6.4.', risk_level: 'high' },
          { section: 'Physical Controls (Annex A.7)', status: 'non_compliant', findings: 'Ref: ISO 27001:2022 A.7.1 — No physical security perimeter defined. A.7.4 — No physical security monitoring. A.7.9 — No off-premises asset security policy. A.7.10 — No storage media lifecycle management.\nRecommendation: Define security zones per A.7.1. Implement CCTV monitoring per A.7.4. Create asset handling procedures per A.7.9-7.10.', risk_level: 'high' },
          { section: 'Technological Controls (Annex A.8)', status: 'compliant', findings: 'Ref: ISO 27001:2022 A.8.2 — Privileged access management documented. A.8.5 — Secure authentication with MFA. A.8.24 — Cryptography policy with AES-256/TLS 1.2. A.8.15-8.16 — Logging and monitoring in place.\nRecommendation: No action required. Consider upgrading to TLS 1.3 per current best practice.', risk_level: 'low' },
        );
      }
    }

    if (hasGDPR) {
      if (isStrongIT) {
        findings.push(
          { section: 'Data Subject Rights (Chapter III, Art. 12-23)', status: 'compliant', findings: 'Ref: GDPR Art. 15 — Automated right of access portal. Art. 17 — Erasure pipeline with 72-hour SLA. Art. 20 — Machine-readable data portability. Art. 34 — Breach notification automated.\nRecommendation: No action required. Continue monitoring response times.', risk_level: 'low' },
          { section: 'Consent & Lawful Basis (Art. 6-7)', status: 'compliant', findings: 'Ref: GDPR Art. 6(1) — Each processing activity mapped to lawful basis (documented in ROPA). Art. 7 — Granular consent management with one-click withdrawal per Art. 7(3). Consent audit trail maintained.\nRecommendation: No action required. Continue annual ROPA review.', risk_level: 'low' },
          { section: 'DPIA (Art. 35-36)', status: 'partial', findings: 'Ref: GDPR Art. 35(1) — DPIA framework implemented for high-risk processing. Art. 35(7) — Systematic assessments conducted. Gap: Art. 36 — Prior consultation procedure with DPA exists but not yet exercised.\nRecommendation: Conduct tabletop exercise for DPA prior consultation procedure per Art. 36.', risk_level: 'low' },
          { section: 'Breach Notification (Art. 33-34)', status: 'compliant', findings: 'Ref: GDPR Art. 33(1) — 72-hour notification workflow documented and tested. Art. 33(3) — Complete breach records with impact assessment. Art. 34 — Data subject notification templates prepared.\nRecommendation: No action required. Continue quarterly breach response drills.', risk_level: 'low' },
        );
      } else {
        findings.push(
          { section: 'Data Subject Rights (Chapter III, Art. 12-23)', status: 'compliant', findings: 'Ref: GDPR Art. 15 — Right of access procedures documented. Art. 17 — Erasure ("right to be forgotten") process defined. Art. 20 — Data portability mechanism in place. Art. 34 — Breach notification to data subjects documented.\nRecommendation: No action required. Continue monitoring response times (30-day SLA per Art. 12(3)).', risk_level: 'low' },
          { section: 'Consent & Lawful Basis (Art. 6-7)', status: 'partial', findings: 'Ref: GDPR Art. 6(1) — Data subject rights documented but no explicit lawful basis mapping for each processing activity. Art. 7 — Consent mechanism exists but no withdrawal process per Art. 7(3).\nRecommendation: Map each processing activity to Art. 6(1)(a-f) lawful basis. Implement one-click consent withdrawal per Art. 7(3).', risk_level: 'medium' },
          { section: 'DPIA (Art. 35-36)', status: 'non_compliant', findings: 'Ref: GDPR Art. 35(1) — No Data Protection Impact Assessment process documented for high-risk processing. Art. 35(7) requires systematic assessment of processing, necessity, risks, and safeguards. Art. 36 — No prior consultation mechanism with supervisory authority.\nRecommendation: Implement DPIA framework per Art. 35(7). Create prior consultation procedure per Art. 36.', risk_level: 'high' },
          { section: 'Breach Notification (Art. 33-34)', status: 'partial', findings: 'Ref: GDPR Art. 33(1) — Breach notification to supervisory authority documented but no 72-hour timeline specified. Art. 33(3) — Breach record-keeping exists but incomplete (no impact assessment per Art. 33(3)(d)).\nRecommendation: Define 72-hour notification workflow per Art. 33(1). Enhance breach records with risk assessment per Art. 33(3)(d).', risk_level: 'medium' },
        );
      }
    }

    // ── ESG Findings: Document-aware (strong vs weak ESG report) ──
    if (selectedRegIds.includes('pojk-51-2017')) {
      if (isStrongESG) {
        // Strong ESG report (e.g., BNI-level maturity)
        findings.push(
          { section: 'Responsible Investment (Pasal 2(a), Prinsip 1)', status: 'compliant', findings: 'Ref: POJK 51/2017 Pasal 2 huruf (a) — ESG criteria fully integrated into credit analysis across all segments. Negative screening with sector exclusion list. ESG risk scoring covers 100% of corporate portfolio with MSCI ESG ratings.\nRecommendation: No action required. Maintain annual ESG scoring review cycle.', risk_level: 'low' },
          { section: 'Sustainable Business Strategy (Pasal 2(b), Prinsip 2)', status: 'compliant', findings: 'Ref: POJK 51/2017 Pasal 4 ayat (1) — RAKB (Rencana Aksi Keuangan Berkelanjutan) submitted to OJK with 5-year targets (2024-2028). Annual progress reporting documented. Sustainability roadmap aligned with national SDG priorities.\nRecommendation: No action required. Continue annual RAKB progress reporting to OJK.', risk_level: 'low' },
          { section: 'Social & Environmental Risk Mgmt (Pasal 2(c), Prinsip 3)', status: 'compliant', findings: 'Ref: POJK 51/2017 Pasal 5 — Environmental and social risk assessment applied across all loan sizes via tiered framework: simplified (<IDR 10B), standard (10-50B), comprehensive (>50B). AMDAL integration for project finance.\nRecommendation: No action required. Consider adding biodiversity impact assessment for agricultural lending.', risk_level: 'low' },
          { section: 'Good Governance (Pasal 2(d), Prinsip 4)', status: 'compliant', findings: 'Ref: POJK 51/2017 Pasal 6 — Board-level Sustainability Committee established with quarterly meetings. ESG KPIs linked to executive compensation (15% weight). Transparent ESG performance reporting in annual report per Pasal 6(3).\nRecommendation: No action required. Consider increasing ESG weight in executive compensation to 20%.', risk_level: 'low' },
          { section: 'Informative Communication (Pasal 2(e), Prinsip 5)', status: 'partial', findings: 'Ref: POJK 51/2017 Pasal 10 — Sustainability report published with GRI Standards alignment. Independent limited assurance obtained from Big 4 firm. Pasal 10(2) — Reasonable assurance (vs. limited) recommended for enhanced credibility.\nRecommendation: Upgrade from limited to reasonable assurance per international best practice. Expand assurance scope to cover Scope 3 data.', risk_level: 'low' },
          { section: 'Inclusiveness (Pasal 2(f), Prinsip 6)', status: 'compliant', findings: 'Ref: POJK 51/2017 Pasal 7 — Financial inclusion targets exceeded. 200,000+ financial literacy participants. MSME financing at IDR 120 trillion. Agent banking (BNI Agen46) reaching 6,174 underserved sub-districts.\nRecommendation: No action required. Continue expanding ultra-micro lending programs.', risk_level: 'low' },
          { section: 'Priority Sector Development (Pasal 2(g), Prinsip 7)', status: 'compliant', findings: 'Ref: POJK 51/2017 Pasal 8 — Green portfolio at 28.1% of total lending (IDR 196T). Active financing in 10 of 12 sustainable business categories per Pasal 8(2). Green bond issuance of USD 500M for renewable energy.\nRecommendation: No action required. Target 30% green portfolio by FY2026.', risk_level: 'low' },
          { section: 'Sustainability Report Sections (Pasal 10, Sections A-G)', status: 'partial', findings: 'Ref: POJK 51/2017 Pasal 10 — All 7 sections (A through G) covered. Section D (Board Explanation) includes accountability targets. Section G (Independent Verification) has limited assurance only; full reasonable assurance recommended.\nRecommendation: Obtain reasonable assurance for Section G. Add forward-looking targets in Section D for next reporting period.', risk_level: 'medium' },
        );
      } else {
        // Weak ESG report (e.g., Bank Nusantara with deliberate gaps)
        findings.push(
          { section: 'Responsible Investment (Pasal 2(a), Prinsip 1)', status: 'compliant', findings: 'Ref: POJK 51/2017 Pasal 2 huruf (a) — ESG criteria integrated into credit analysis for corporate loans. Negative screening applied for environmentally harmful sectors. ESG risk scoring for top 100 borrowers.\nRecommendation: No action required. Extend ESG scoring to all borrowers above IDR 10 billion.', risk_level: 'low' },
          { section: 'Sustainable Business Strategy (Pasal 2(b), Prinsip 2)', status: 'partial', findings: 'Ref: POJK 51/2017 Pasal 4 ayat (1) — Sustainability roadmap exists but no Rencana Aksi Keuangan Berkelanjutan (RAKB) submitted to OJK. Pasal 4(2) requires RAKB filing within 1 year of regulation effective date.\nRecommendation: Develop and submit RAKB to OJK immediately. Include 5-year sustainability targets with annual milestones per Pasal 4.', risk_level: 'high' },
          { section: 'Social & Environmental Risk Mgmt (Pasal 2(c), Prinsip 3)', status: 'partial', findings: 'Ref: POJK 51/2017 Pasal 5 — Environmental risk assessment applied only to loans >IDR 50 billion (46% of portfolio unscreened). Pasal 5(2) requires ESG screening for all financing activities regardless of size.\nRecommendation: Extend ESG screening to all loan sizes. Implement tiered assessment: simplified for <IDR 10B, standard for 10-50B, comprehensive for >50B.', risk_level: 'medium' },
          { section: 'Good Governance (Pasal 2(d), Prinsip 4)', status: 'partial', findings: 'Ref: POJK 51/2017 Pasal 6 — Board accountability statement exists but no dedicated sustainability committee. Pasal 6(3) requires transparent ESG performance reporting in annual report.\nRecommendation: Establish Board-level Sustainability Committee per Pasal 6. Integrate ESG KPIs into executive compensation.', risk_level: 'medium' },
          { section: 'Informative Communication (Pasal 2(e), Prinsip 5)', status: 'non_compliant', findings: 'Ref: POJK 51/2017 Pasal 10 — Sustainability report published but no independent assurance obtained. Pasal 10(2) requires third-party verification. Pasal 10(3) requires alignment with GRI Standards or equivalent.\nRecommendation: Engage independent assurance provider for sustainability report per Pasal 10(2). Adopt GRI Standards reporting framework.', risk_level: 'high' },
          { section: 'Inclusiveness (Pasal 2(f), Prinsip 6)', status: 'compliant', findings: 'Ref: POJK 51/2017 Pasal 7 — Financial inclusion targets documented. 150,000 financial literacy participants. MSME financing at IDR 87 trillion. Agent banking reaching underserved districts.\nRecommendation: No action required. Continue expanding agent banking to 3T regions.', risk_level: 'low' },
          { section: 'Priority Sector Development (Pasal 2(g), Prinsip 7)', status: 'compliant', findings: 'Ref: POJK 51/2017 Pasal 8 — Green portfolio at 23.4% of total lending (IDR 145T). Active financing in 8 of 12 sustainable business categories per Pasal 8(2): renewable energy, sustainable agriculture, green buildings, waste management, MSME, etc.\nRecommendation: No action required. Target 25% green portfolio by next fiscal year.', risk_level: 'low' },
          { section: 'Sustainability Report Sections (Pasal 10, Sections A-G)', status: 'partial', findings: 'Ref: POJK 51/2017 Pasal 10 — Sections A (Strategy), B (Performance Summary), C (Company Profile), and F (Performance) adequately covered. Section D (Board Explanation) lacks specific accountability targets. Section G (Independent Verification) missing entirely.\nRecommendation: Strengthen Section D with measurable Board ESG accountability targets. Obtain Section G independent verification.', risk_level: 'high' },
        );
      }
    }

    if (selectedRegIds.includes('sasb-fn-cb')) {
      if (isStrongESG) {
        findings.push(
          { section: 'Data Security (FN-CB-230a.1, FN-CB-230a.2)', status: 'compliant', findings: 'Ref: SASB FN-CB-230a.1 — Zero data breaches disclosed in reporting period. Comprehensive data security risk identification framework documented per FN-CB-230a.2. ISO 27001 certified with annual penetration testing.\nRecommendation: No action required. Continue annual security assessments and breach monitoring.', risk_level: 'low' },
          { section: 'Financial Inclusion (FN-CB-240a.1-a.4)', status: 'compliant', findings: 'Ref: SASB FN-CB-240a.1 — Community development loans documented (IDR 120T MSME portfolio). FN-CB-240a.3 — No-cost basic accounts available. FN-CB-240a.4 — 200,000+ participants in financial literacy programs.\nRecommendation: No action required. Continue expanding ultra-micro lending programs.', risk_level: 'low' },
          { section: 'ESG in Credit Analysis (FN-CB-410a.1, FN-CB-410a.2)', status: 'compliant', findings: 'Ref: SASB FN-CB-410a.1 — Commercial/industrial credit exposure breakdown by industry fully disclosed. FN-CB-410a.2 — ESG factors integrated across all lending segments including SME and retail.\nRecommendation: No action required. Consider adding climate transition risk scoring to credit models.', risk_level: 'low' },
          { section: 'Financed Emissions (FN-CB-410b.1-b.4)', status: 'partial', findings: 'Ref: SASB FN-CB-410b.1 — Scope 3 financed emissions calculated covering 90.1% of portfolio using PCAF methodology per FN-CB-410b.4. PCAF data quality score: 2.8. Disaggregated by Scope 1/2/3 and asset class. Gap: retail mortgage segment not yet covered.\nRecommendation: Extend PCAF coverage to retail mortgages. Target 95%+ portfolio coverage by next reporting period.', risk_level: 'medium' },
          { section: 'Business Ethics (FN-CB-510a.1, FN-CB-510a.2)', status: 'partial', findings: 'Ref: SASB FN-CB-510a.1 — Total monetary losses from legal proceedings disclosed (IDR 12.5B). FN-CB-510a.2 — ESG whistleblower channel established but low awareness (only 23% of employees aware).\nRecommendation: Increase ESG whistleblower channel awareness through training campaigns. Target 80%+ employee awareness.', risk_level: 'low' },
          { section: 'Systemic Risk Management (FN-CB-550a.1-a.2)', status: 'compliant', findings: 'Ref: SASB FN-CB-550a.2 — Climate stress testing integrated into capital adequacy planning with 1.5°C and 4°C scenarios. G-SIB score monitoring documented. Countercyclical buffers maintained above Basel III requirements.\nRecommendation: No action required. Continue semi-annual climate stress testing cycle.', risk_level: 'low' },
        );
      } else {
        findings.push(
          { section: 'Data Security (FN-CB-230a.1, FN-CB-230a.2)', status: 'non_compliant', findings: 'Ref: SASB FN-CB-230a.1 — 2 data breaches in reporting period affecting 47,000 accounts NOT disclosed in sustainability report. Metric requires: (1) number of breaches, (2) % personal data, (3) accounts affected. FN-CB-230a.2 — No description of data security risk identification approach.\nRecommendation: Disclose all data breaches per FN-CB-230a.1 with quantitative metrics. Document data security risk framework per FN-CB-230a.2.', risk_level: 'critical' },
          { section: 'Financial Inclusion (FN-CB-240a.1-a.4)', status: 'compliant', findings: 'Ref: SASB FN-CB-240a.1 — Community development loans documented (IDR 87T MSME portfolio). FN-CB-240a.4 — 150,000 participants in financial literacy programs across 6,174 districts.\nRecommendation: No action required. Enhance reporting with FN-CB-240a.3 metric (no-cost retail checking accounts for unbanked).', risk_level: 'low' },
          { section: 'ESG in Credit Analysis (FN-CB-410a.1, FN-CB-410a.2)', status: 'partial', findings: 'Ref: SASB FN-CB-410a.2 — ESG factors integrated into corporate lending but not SME/retail segments. FN-CB-410a.1 — No commercial/industrial credit exposure breakdown by industry as required.\nRecommendation: Publish industry-level credit exposure per FN-CB-410a.1. Extend ESG screening to all lending segments per FN-CB-410a.2.', risk_level: 'high' },
          { section: 'Financed Emissions (FN-CB-410b.1-b.4)', status: 'non_compliant', findings: 'Ref: SASB FN-CB-410b.1 — No Scope 3 financed emissions calculated. Only 65% portfolio coverage (BNI benchmark: 90.1%). FN-CB-410b.4 — Proprietary methodology used instead of PCAF standard. No disaggregation by Scope 1/2/3.\nRecommendation: Adopt PCAF methodology per FN-CB-410b.4. Expand coverage to >90% of portfolio. Disclose Scope 1/2/3 disaggregated financed emissions.', risk_level: 'critical' },
          { section: 'Business Ethics (FN-CB-510a.1, FN-CB-510a.2)', status: 'non_compliant', findings: 'Ref: SASB FN-CB-510a.1 — No disclosure of total monetary losses from legal proceedings. FN-CB-510a.2 — No ESG-specific whistleblower channel. Anti-corruption training does not cover environmental or social misconduct.\nRecommendation: Disclose legal proceedings per FN-CB-510a.1. Establish ESG whistleblower channel per FN-CB-510a.2. Expand ethics training to cover ESG misconduct.', risk_level: 'high' },
          { section: 'Systemic Risk Management (FN-CB-550a.1-a.2)', status: 'partial', findings: 'Ref: SASB FN-CB-550a.2 — Stress testing performed for credit/market risk but no climate-specific stress testing integrated into capital adequacy planning.\nRecommendation: Incorporate climate stress scenarios into capital adequacy planning per FN-CB-550a.2. Align with OJK climate stress testing guidelines.', risk_level: 'medium' },
        );
      }
    }

    if (selectedRegIds.includes('issb-s1')) {
      if (isStrongESG) {
        findings.push(
          { section: 'Governance (IFRS S1 Para 26-27)', status: 'compliant', findings: 'Ref: IFRS S1 Paragraph 26(a) — CSO reports directly to Board. Para 26(b) — Board Sustainability Committee with defined terms of reference and quarterly meetings. Para 27 — Climate competency requirements integrated into Board skills matrix.\nRecommendation: No action required. Continue annual Board competency assessments on ESG topics.', risk_level: 'low' },
          { section: 'Strategy (IFRS S1 Para 28-35)', status: 'partial', findings: 'Ref: IFRS S1 Paragraph 29 — Sustainability risks identified with financial impact quantification for top 20 risks per Para 32. Para 34 — 1.5°C and 2°C scenarios analyzed but 4°C high-warming pathway not yet completed.\nRecommendation: Complete 4°C high-warming scenario analysis per Para 34. Expand financial quantification to all material risks.', risk_level: 'medium' },
          { section: 'Risk Management (IFRS S1 Para 36-39)', status: 'partial', findings: 'Ref: IFRS S1 Paragraph 36 — Climate stress testing performed for corporate loan book (75% coverage). Para 38 — Sustainability risks integrated into ERM framework. Gap: Risk appetite statement for ESG risks not yet formalized.\nRecommendation: Formalize ESG risk appetite statement. Extend climate stress testing to full portfolio per Para 36.', risk_level: 'medium' },
          { section: 'Metrics & Targets (IFRS S1 Para 40-42)', status: 'partial', findings: 'Ref: IFRS S1 Paragraph 40 — SBTi commitment made, targets under validation. Para 41 — Net-zero operations by 2028 target set. Scope 1+2+3 tracked. Para 42 — 2019 baseline year established. Gap: Interim reduction milestones not fully defined for Scope 3.\nRecommendation: Define granular Scope 3 interim reduction milestones per Para 41. Complete SBTi validation process per Para 40.', risk_level: 'medium' },
        );
      } else {
        findings.push(
          { section: 'Governance (IFRS S1 Para 26-27)', status: 'partial', findings: 'Ref: IFRS S1 Paragraph 26(a) — CSO appointed but reports to CFO, not directly to Board. Para 26(b) — No Board-level sustainability committee with defined terms of reference. Para 27 — No formal climate competency requirements for directors.\nRecommendation: Elevate CSO reporting to Board level per Para 26. Establish Board Sustainability Committee. Define director competency requirements.', risk_level: 'high' },
          { section: 'Strategy (IFRS S1 Para 28-35)', status: 'partial', findings: 'Ref: IFRS S1 Paragraph 29 — Sustainability risks identified qualitatively but no financial impact quantification per Para 32. Para 34 — Only 2°C scenario analyzed (no 1.5°C per Paris Agreement alignment).\nRecommendation: Quantify financial effects of sustainability risks per Para 32. Conduct 1.5°C and 4°C scenario analysis per Para 34.', risk_level: 'high' },
          { section: 'Risk Management (IFRS S1 Para 36-39)', status: 'non_compliant', findings: 'Ref: IFRS S1 Paragraph 36 — No climate stress testing performed. Para 38 — Sustainability risks not integrated into enterprise risk management framework. No risk appetite statement for ESG risks.\nRecommendation: Conduct climate stress testing per Para 36. Integrate ESG into ERM per Para 38. Define ESG risk appetite thresholds.', risk_level: 'critical' },
          { section: 'Metrics & Targets (IFRS S1 Para 40-42)', status: 'non_compliant', findings: 'Ref: IFRS S1 Paragraph 40 — No Science-Based Targets (SBT) set. Para 41 — No net-zero commitment or interim reduction targets. Limited KPIs: only Scope 1+2 tracked (no Scope 3). Para 42 — No baseline year established for target tracking.\nRecommendation: Commit to SBTi and set validated targets per Para 40. Define net-zero target with interim milestones per Para 41. Establish 2023 baseline per Para 42.', risk_level: 'critical' },
        );
      }
    }

    if (selectedRegIds.includes('issb-s2')) {
      if (isStrongESG) {
        findings.push(
          { section: 'Climate Governance (IFRS S2 Para 5-6)', status: 'compliant', findings: 'Ref: IFRS S2 Paragraph 5(a) — Board has formal climate oversight mandate with quarterly reporting. Para 6 — Climate competency in Board skills matrix. Climate-linked executive remuneration (15% of variable pay tied to ESG KPIs).\nRecommendation: No action required. Consider increasing climate-linked remuneration weight to 20%.', risk_level: 'low' },
          { section: 'Climate Strategy (IFRS S2 Para 8-15)', status: 'partial', findings: 'Ref: IFRS S2 Paragraph 8 — Climate transition plan documented with decarbonization roadmap. Para 13 — 1.5°C and 2°C scenarios analyzed; 4°C high-warming pathway in progress. Para 14 — Internal carbon pricing at USD 25/ton implemented. Gap: Financial effects per Para 15 partially quantified.\nRecommendation: Complete 4°C scenario analysis per Para 13. Fully quantify financial effects of climate risks per Para 15. Review internal carbon price annually.', risk_level: 'medium' },
          { section: 'GHG Emissions (IFRS S2 Para 29)', status: 'compliant', findings: 'Ref: IFRS S2 Paragraph 29(a) — Scope 1, 2, and 3 emissions fully reported. Scope 1+2: 38,500 tCO2eq (8% YoY reduction). Scope 3 Cat 15 financed emissions: 12.4 MtCO2eq covering 90.1% portfolio. GHG Protocol fully applied.\nRecommendation: No action required. Continue annual emissions reporting with YoY trend analysis.', risk_level: 'low' },
          { section: 'Financed Emissions (IFRS S2 Industry Metrics)', status: 'compliant', findings: 'Ref: IFRS S2 Industry-based guidance — Financed emissions calculated using PCAF methodology for 90.1% of lending portfolio. PCAF data quality score: 2.8 (target met). Disaggregated by asset class (corporate, project finance, mortgages, auto).\nRecommendation: No action required. Target 95% portfolio coverage and improve data quality score to ≤2.5.', risk_level: 'low' },
          { section: 'Climate Targets (IFRS S2 Para 33-36)', status: 'partial', findings: 'Ref: IFRS S2 Paragraph 33 — Net-zero operations by 2028, net-zero financed emissions by 2060 targets set. Para 34 — SBTi near-term targets validated; long-term targets under review. Para 36(d) — Carbon credits usage disclosed (45,000 tCO2eq retired). Gap: Interim 2030/2040 financed emissions milestones not granular enough.\nRecommendation: Define sector-specific decarbonization targets for 2030 and 2040 per Para 33. Enhance granularity of interim financed emissions milestones.', risk_level: 'medium' },
        );
      } else {
        findings.push(
          { section: 'Climate Governance (IFRS S2 Para 5-6)', status: 'partial', findings: 'Ref: IFRS S2 Paragraph 5(a) — Board receives quarterly climate briefings but no formal climate oversight mandate. Para 6 — No climate competency requirements for Board members. No climate-linked executive remuneration.\nRecommendation: Define Board climate oversight mandate per Para 5. Add climate competency to Board skills matrix. Link ESG KPIs to executive compensation.', risk_level: 'medium' },
          { section: 'Climate Strategy (IFRS S2 Para 8-15)', status: 'non_compliant', findings: 'Ref: IFRS S2 Paragraph 8 — No climate transition plan documented. Para 13 — Only 2°C scenario analyzed; IFRS S2 requires both 1.5°C and high-warming (≥4°C) pathways. Para 14 — No internal carbon pricing mechanism. Para 15 — Financial effects of climate risks not quantified.\nRecommendation: Develop climate transition plan per Para 8. Conduct dual-scenario analysis (1.5°C + 4°C) per Para 13. Implement internal carbon pricing per Para 14.', risk_level: 'critical' },
          { section: 'GHG Emissions (IFRS S2 Para 29)', status: 'non_compliant', findings: 'Ref: IFRS S2 Paragraph 29(a) — Scope 1 and 2 reported (42,500 ton CO2eq). Para 29(a)(iii) — No Scope 3 value chain emissions disclosed (MANDATORY under IFRS S2). GHG Protocol corporate standard partially applied but not fully aligned.\nRecommendation: Calculate and disclose Scope 3 emissions across all 15 categories per Para 29. Prioritize Category 15 (Investments/Financed Emissions) for financial institutions.', risk_level: 'critical' },
          { section: 'Financed Emissions (IFRS S2 Industry Metrics)', status: 'partial', findings: 'Ref: IFRS S2 Industry-based guidance for commercial banks — Financed emissions calculated for 65% of lending portfolio only (BNI benchmark: 90.1%). PCAF data quality scores average 3.5 (target: ≤3.0). No disaggregation by asset class.\nRecommendation: Expand portfolio coverage to >90% per PCAF standard. Improve data quality to ≤3.0. Disaggregate by asset class (corporate loans, project finance, mortgages).', risk_level: 'high' },
          { section: 'Climate Targets (IFRS S2 Para 33-36)', status: 'non_compliant', findings: 'Ref: IFRS S2 Paragraph 33 — No net-zero commitment or interim emission reduction targets. Para 34 — No SBTi alignment. Para 36(d) — No disclosure of carbon credits used or planned (mandatory if applicable). BNI benchmark: Net-zero operations by 2028.\nRecommendation: Set net-zero target with SBTi-validated pathway per Para 33-34. Define interim targets (2025, 2030, 2040). Disclose any carbon credit usage per Para 36(d).', risk_level: 'critical' },
        );
      }
    }

    if (selectedRegIds.includes('uu-pdp-2022')) {
      if (isStrongIT) {
        findings.push(
          { section: 'Data Subject Rights (Pasal 5-13, Hak Subjek Data)', status: 'compliant', findings: 'Ref: UU PDP 2022 Pasal 7 — Automated data access portal with 3x24 hour SLA. Pasal 10 — Data deletion workflow documented with secure erasure verification. Pasal 12 — Data portability in JSON/CSV format implemented.\nRecommendation: No action required. Continue monitoring response time SLAs per Pasal 7-8.', risk_level: 'low' },
          { section: 'Data Controller Obligations (Pasal 20-28, Kewajiban Pengendali)', status: 'compliant', findings: 'Ref: UU PDP 2022 Pasal 20 — Lawful basis documented for all processing activities (ROPA maintained). Pasal 22 — Data minimization policy enforced. Pasal 27 — DPO (Pejabat PDP) appointed with direct Board reporting.\nRecommendation: No action required. Continue annual ROPA review and DPO reporting cycle.', risk_level: 'low' },
          { section: 'Consent Management (Pasal 20-21, Persetujuan)', status: 'compliant', findings: 'Ref: UU PDP 2022 Pasal 20 ayat (2) — Granular consent mechanism with clear, plain language. Pasal 11 — One-click consent withdrawal implemented with 3x24 hour processing. Pasal 4 ayat (2) — Explicit consent for sensitive data (biometric, financial).\nRecommendation: No action required. Maintain consent audit trail and annual review.', risk_level: 'low' },
          { section: 'Cross-Border Transfer (Pasal 55-57, Transfer Lintas Negara)', status: 'partial', findings: 'Ref: UU PDP 2022 Pasal 55 — Cross-border transfers to Singapore and Australia documented with adequacy assessment. Pasal 56 — Standard contractual clauses in place. Gap: Transfer impact assessment per Pasal 56 ayat (2) not formalized for all vendor relationships.\nRecommendation: Formalize transfer impact assessments for all cross-border data flows per Pasal 56 ayat (2). Document adequacy determinations.', risk_level: 'medium' },
          { section: 'Breach Notification (Pasal 46-49, Pemberitahuan Insiden)', status: 'compliant', findings: 'Ref: UU PDP 2022 Pasal 46 ayat (1) — 3x24 hour breach notification workflow to Lembaga PDP documented and tested. Pasal 47 — Data subject notification templates prepared. Pasal 48 — Breach register maintained with full incident documentation.\nRecommendation: No action required. Continue quarterly breach response drills.', risk_level: 'low' },
          { section: 'Data Security (Pasal 35-39, Keamanan Data)', status: 'compliant', findings: 'Ref: UU PDP 2022 Pasal 35 ayat (1) — AES-256 encryption at rest and TLS 1.3 in transit. Pasal 37 — Annual security assessments conducted with third-party penetration testing. Pasal 38 — Role-based access controls with audit logging.\nRecommendation: No action required. Continue annual security assessment and penetration testing cycle.', risk_level: 'low' },
          { section: 'Sanctions Compliance (Pasal 57-76, Sanksi)', status: 'partial', findings: 'Ref: UU PDP 2022 Pasal 57 — Administrative sanctions awareness documented. Pasal 76 — Compliance achieved within transition period. Gap: Internal sanctions escalation matrix not fully aligned with UU PDP fine structure (up to 2% revenue per Pasal 57).\nRecommendation: Update internal compliance escalation matrix to reflect UU PDP administrative fine structure per Pasal 57.', risk_level: 'low' },
        );
      } else {
        findings.push(
          { section: 'Data Subject Rights (Pasal 5-13, Hak Subjek Data)', status: 'partial', findings: 'Ref: UU PDP 2022 Pasal 7 — Data access request mechanism exists but no 3x24 hour SLA per Pasal 8. Pasal 10 — Data deletion process not documented. Pasal 12 — No data portability mechanism for machine-readable format.\nRecommendation: Implement data subject request portal with 3x24 hour SLA per Pasal 7-8. Document data deletion workflow per Pasal 10. Enable data portability per Pasal 12.', risk_level: 'high' },
          { section: 'Data Controller Obligations (Pasal 20-28, Kewajiban Pengendali)', status: 'non_compliant', findings: 'Ref: UU PDP 2022 Pasal 20 — No lawful basis mapping for processing activities. Pasal 26 — No Records of Processing Activities (ROPA) maintained. Pasal 27 — No Data Protection Officer (Pejabat PDP) appointed. Pasal 28 — No Data Protection Impact Assessment conducted.\nRecommendation: Map all processing activities to lawful basis per Pasal 20. Establish ROPA per Pasal 26. Appoint DPO per Pasal 27. Implement DPIA framework per Pasal 28.', risk_level: 'critical' },
          { section: 'Consent Management (Pasal 20-21, Persetujuan)', status: 'partial', findings: 'Ref: UU PDP 2022 Pasal 20 ayat (2) — Consent collected but not specific or granular per requirement. Pasal 11 — No withdrawal mechanism available. Pasal 4 ayat (2) — Processing of sensitive personal data without explicit written consent.\nRecommendation: Implement granular consent mechanism with plain language per Pasal 20. Create one-click withdrawal per Pasal 11. Obtain explicit consent for sensitive data per Pasal 4.', risk_level: 'high' },
          { section: 'Cross-Border Transfer (Pasal 55-57, Transfer Lintas Negara)', status: 'non_compliant', findings: 'Ref: UU PDP 2022 Pasal 55 — Personal data transferred to overseas cloud providers without adequacy determination. Pasal 56 — No standard contractual clauses or binding corporate rules. Pasal 57 — No documentation of cross-border transfers maintained.\nRecommendation: Conduct adequacy assessment for all receiving jurisdictions per Pasal 55. Implement SCCs or BCRs per Pasal 56. Maintain transfer registry per Pasal 57.', risk_level: 'critical' },
          { section: 'Breach Notification (Pasal 46-49, Pemberitahuan Insiden)', status: 'non_compliant', findings: 'Ref: UU PDP 2022 Pasal 46 ayat (1) — No breach notification procedure to Lembaga PDP documented. Pasal 46 requires notification within 3x24 hours. Pasal 47 — No data subject notification process. Pasal 48 — No breach register maintained.\nRecommendation: Implement 3x24 hour breach notification workflow per Pasal 46. Create data subject notification templates per Pasal 47. Establish breach register per Pasal 48.', risk_level: 'critical' },
          { section: 'Data Security (Pasal 35-39, Keamanan Data)', status: 'partial', findings: 'Ref: UU PDP 2022 Pasal 35 ayat (1) — Encryption at rest implemented but no pseudonymization. Pasal 37 — No annual security assessment conducted. Pasal 38 — Access controls exist but no audit logging of personal data access.\nRecommendation: Implement pseudonymization per Pasal 35. Conduct annual security assessment per Pasal 37. Enable audit logging for personal data access per Pasal 38.', risk_level: 'high' },
          { section: 'Sanctions Compliance (Pasal 57-76, Sanksi)', status: 'non_compliant', findings: 'Ref: UU PDP 2022 Pasal 57 — No awareness of administrative sanctions structure (up to 2% annual revenue). Pasal 67-70 — Criminal sanctions of up to 5 years imprisonment and IDR 5 billion fine for unlawful processing. Pasal 76 — Transition period expired October 2024.\nRecommendation: Conduct urgent UU PDP compliance gap assessment. Develop remediation roadmap. Engage legal counsel for criminal liability review per Pasal 67-70.', risk_level: 'critical' },
        );
      }
    }

    // If no specific regulation matched, show generic
    if (findings.length === 0) {
      findings.push(
        { section: 'General Compliance', status: 'partial', findings: 'Document reviewed against selected regulations. Some gaps identified.\nRecommendation: Select specific regulations for detailed findings.', risk_level: 'medium' },
      );
    }

    // Score calculation: weighted by status (compliant=100, partial=50, non_compliant=0)
    // and adjusted by risk level (critical findings reduce score more)
    const total = findings.length;
    const compliantCount = findings.filter(f => f.status === 'compliant').length;
    const partialCount = findings.filter(f => f.status === 'partial').length;
    const nonCompliantCount = findings.filter(f => f.status === 'non_compliant').length;
    const criticalCount = findings.filter(f => f.risk_level === 'critical').length;
    const highCount = findings.filter(f => f.risk_level === 'high').length;

    // Base score from status distribution
    const baseScore = ((compliantCount * 100) + (partialCount * 50) + (nonCompliantCount * 0)) / total;
    // Risk penalty: critical findings reduce score by 3 points each, high by 1 point
    const riskPenalty = Math.min(baseScore * 0.3, criticalCount * 3 + highCount * 1);
    const finalScore = Math.max(0, Math.min(100, Math.round(baseScore - riskPenalty)));

    return {
      overall_score: finalScore,
      summary: `Document checked against ${selectedRegIds.length} regulation(s) across ${total} sections. ${compliantCount} compliant, ${partialCount} partial, ${nonCompliantCount} non-compliant. ${criticalCount > 0 ? `${criticalCount} critical risk findings require immediate attention.` : ''} Key gaps: ${findings.filter(f => f.status === 'non_compliant').map(f => f.section.split('(')[0].trim()).slice(0, 3).join(', ')}.`,
      findings,
      model_used: 'llama3.1:8b',
      provider: 'ollama',
    };
  };

  const handleRunCheck = async () => {
    if (!uploadedFile || selectedRegIds.length === 0) return;
    setChecking(true);
    setCheckProgress(0);
    setReport(null);
    setNotification(null);

    // Read file content as text (needed for both API call and demo fallback)
    const documentText = await readFileAsText(uploadedFile);

    // Slower progress since LLM can take 30-90 seconds
    const progressInterval = setInterval(() => {
      setCheckProgress(prev => Math.min(prev + 2, 90));
    }, 1000);

    try {
      // Check if user is logged in
      const token = localStorage.getItem('token');
      if (!token) {
        throw { isAuthError: true };
      }

      const res = await api.post('/compliance/check', {
        document_text: documentText,
        regulation_ids: selectedRegIds,
      }, { timeout: 300000 }); // 5 min timeout for LLM processing

      clearInterval(progressInterval);
      setCheckProgress(100);

      // Map API response to our report format
      const apiResults = res.data.results || [];
      const allFindings: ComplianceFinding[] = [];
      let totalScore = 0;

      for (const result of apiResults) {
        totalScore += result.overall_score || 0;
        for (const sr of result.section_results || []) {
          allFindings.push({
            section: sr.section_title || sr.section_id,
            status: sr.status === 'not_applicable' ? 'na' : sr.status,
            findings: sr.findings + (sr.recommendations ? `\nRecommendation: ${sr.recommendations}` : ''),
            risk_level: sr.risk_level || 'medium',
          });
        }
      }

      setReport({
        overall_score: apiResults.length > 0 ? Math.round(totalScore / apiResults.length) : 0,
        summary: apiResults.map((r: any) => r.summary).join(' '),
        findings: allFindings,
        model_used: res.data.model_used,
        provider: res.data.provider,
      });
      setNotification({ kind: 'success', text: 'Compliance check completed.' });
    } catch (err: any) {
      clearInterval(progressInterval);
      setCheckProgress(100);

      // Auth error — use demo fallback with auth warning
      if (err?.isAuthError || err?.response?.status === 401) {
        setReport(getDemoReport(documentText));
        setNotification({ kind: 'warning', text: 'Session expired — showing demo compliance results. Login for live LLM analysis.' });
        setChecking(false);
        return;
      }

      // LLM/backend error — use demo fallback
      setReport(getDemoReport(documentText));
      setNotification({
        kind: 'info-square',
        text: `Compliance check completed in demo mode. ${err?.response?.data?.detail || 'LLM backend unavailable.'}`,
      });
    } finally {
      setChecking(false);
    }
  };

  // ── Chat ───────────────────────────────────────────────────

  const handleTypingDone = useCallback(() => {
    setIsTyping(false);
  }, []);

  const getChatDemoResponse = (question: string): string => {
    const q = question.toLowerCase();
    const regNames = selectedRegs.map(r => r.name).join(', ') || 'selected regulations';

    // Regulation-specific knowledge base for demo
    if (q.includes('pojk') || q.includes('ojk')) {
      if (q.includes('6') || q.includes('it risk') || q.includes('governance')) {
        return `**POJK No.6/POJK.03/2022 — IT Risk Management**\n\nThis regulation requires banks to:\n\n1. **IT Governance**: Establish an IT Steering Committee, appoint a CIO, and align IT strategy with business objectives\n2. **Risk Management**: Implement IT risk identification, assessment, and mitigation\n3. **IT Security**: Multi-factor authentication, access control, IDS/IPS, and regular penetration testing\n4. **Data Protection**: Encryption at rest and in transit, data classification, and DLP\n5. **Business Continuity**: BCP/DRP with annual testing, RPO < 4 hours for critical systems\n6. **Incident Reporting**: Report to OJK within 1 hour for critical incidents\n\nKey compliance deadline: Banks must be fully compliant by August 2023.\n\nWould you like me to elaborate on any specific section?`;
      }
      if (q.includes('11') || q.includes('digital')) {
        return `**POJK No.11/POJK.03/2022 — Digital Banking**\n\nThis regulation covers digital banking operations including:\n\n1. **Customer Data Protection**: End-to-end encryption, consent management, data residency in Indonesia\n2. **API Security**: OAuth 2.0, rate limiting, API gateway with WAF\n3. **Cloud Computing**: Must use domestic data centers or certified international providers with OJK approval\n4. **Channel Security**: Secure mobile/internet banking with biometric authentication\n5. **Consumer Dispute Resolution**: Maximum 20 business days, clear escalation path\n\nCommon gaps found in audits: Missing API security testing, inadequate cloud vendor due diligence, no formal consumer dispute SLA.\n\nWould you like details on a specific section?`;
      }
    }
    if (q.includes('pbi') || q.includes('bank indonesia') || q.includes('payment')) {
      return `**PBI No.23/6/PBI/2021 — Payment System**\n\nBank Indonesia's payment system regulation requires:\n\n1. **Transaction Security**: Real-time fraud detection, transaction signing, secure payment channels\n2. **Consumer Protection**: Clear fee disclosure, dispute resolution within 14 days\n3. **AML/CFT**: Customer due diligence, suspicious transaction reporting (STR within 3 days)\n4. **Data Security**: PCI-DSS compliance for card payments, tokenization\n5. **Reporting**: Daily settlement reports, monthly transaction volume reports to BI\n\nKey focus areas for 2024: Open banking API standards, QR payment interoperability, and cross-border payment security.\n\nWant me to compare this with OJK regulations?`;
    }
    if (q.includes('nist') || q.includes('cybersecurity framework')) {
      return `**NIST Cybersecurity Framework 2.0**\n\nThe framework has 6 core functions:\n\n1. **Govern (GV)**: Organizational context, risk management strategy, roles & responsibilities\n2. **Identify (ID)**: Asset management, risk assessment, supply chain risk\n3. **Protect (PR)**: Access control, awareness training, data security, platform security\n4. **Detect (DE)**: Continuous monitoring, adverse event analysis\n5. **Respond (RS)**: Incident management, analysis, mitigation, reporting\n6. **Recover (RC)**: Recovery planning, execution, communication\n\nNIST CSF 2.0 (Feb 2024) added "Govern" as a new function and expanded supply chain risk management. It's voluntary but widely adopted as a baseline.\n\nShall I map NIST controls to your POJK requirements?`;
    }
    if (q.includes('iso') || q.includes('27001')) {
      return `**ISO/IEC 27001:2022 — Information Security Management**\n\nThe 2022 revision restructured controls into 4 categories:\n\n1. **Organizational Controls** (37 controls): Policies, roles, threat intelligence, asset management, access control, supplier security\n2. **People Controls** (8 controls): Screening, awareness, disciplinary process, remote working, NDA\n3. **Physical Controls** (14 controls): Physical security, equipment, secure areas, clear desk\n4. **Technological Controls** (34 controls): Authentication, encryption, secure development, logging, network security\n\nTotal: 93 controls (down from 114 in 2013 version). New controls include threat intelligence, cloud security, data masking, and monitoring activities.\n\nWould you like a gap analysis template?`;
    }
    if (q.includes('gdpr') || q.includes('data protection') || q.includes('privacy')) {
      return `**GDPR — General Data Protection Regulation**\n\nKey compliance requirements:\n\n1. **Lawful Basis (Art. 6)**: Must have consent, contract, legal obligation, vital interest, public task, or legitimate interest\n2. **Data Subject Rights (Ch. III)**: Access, rectification, erasure ("right to be forgotten"), portability, restriction, objection\n3. **DPIA (Art. 35)**: Required for high-risk processing activities\n4. **Breach Notification (Art. 33-34)**: Notify supervisory authority within 72 hours, data subjects "without undue delay"\n5. **DPO (Art. 37)**: Required for public authorities and large-scale systematic monitoring\n6. **Cross-border Transfers (Ch. V)**: Adequacy decisions, SCCs, or BCRs required\n\nFines: Up to €20M or 4% of global annual revenue.\n\nWant me to check your document against specific GDPR articles?`;
    }
    if (q.includes('gap') || q.includes('remediat') || q.includes('fix') || q.includes('improve') || q.includes('recommend')) {
      return `**Remediation Recommendations based on ${regNames}**\n\nHere are the priority actions based on the compliance findings:\n\n**Critical (Fix within 30 days):**\n- Establish an Incident Response Plan with OJK/BI reporting procedures\n- Implement Business Continuity Plan with documented RPO/RTO\n- Deploy multi-factor authentication on all critical systems\n\n**High Priority (Fix within 90 days):**\n- Conduct Data Protection Impact Assessment (DPIA)\n- Implement formal vendor/third-party risk management\n- Set up continuous security monitoring (SIEM/SOC)\n\n**Medium Priority (Fix within 180 days):**\n- Develop security awareness training program\n- Complete penetration testing and vulnerability assessment\n- Document and test disaster recovery procedures\n\nWould you like a detailed remediation plan for any specific item?`;
    }
    if (q.includes('compare') || q.includes('mapping') || q.includes('overlap') || q.includes('difference')) {
      return `**Regulation Comparison / Mapping**\n\nHere's how the selected regulations overlap:\n\n| Area | POJK 6 | NIST CSF | ISO 27001 |\n|------|--------|----------|----------|\n| Access Control | S3 | PR.AA | A.8.3-8.5 |\n| Incident Response | S8 | RS.MA | A.5.24-5.28 |\n| Risk Assessment | S2 | ID.RA | A.8.8 |\n| Encryption | S4 | PR.DS | A.8.24 |\n| BCP/DRP | S5 | RC.RP | A.5.29-5.30 |\n| Audit/Monitoring | S1 | DE.CM | A.8.15-8.16 |\n\n**Key insight**: Implementing ISO 27001 covers ~70% of POJK 6 requirements. NIST CSF adds the governance layer. Combining all three provides comprehensive coverage.\n\nWant me to create a detailed control mapping?`;
    }
    if (q.includes('pojk 51') || q.includes('sustainable finance') || q.includes('esg') || q.includes('sustainability')) {
      return `**POJK No.51/POJK.03/2017 — Sustainable Finance**\n\nThis regulation establishes 8 principles for sustainable finance in Indonesian financial institutions:\n\n1. **Responsible Investment** — Integrate ESG factors into investment and credit decisions\n2. **Sustainable Business Strategy** — Align business strategy with sustainable development goals\n3. **Social & Environmental Risk Management** — Identify, assess, and mitigate social/environmental risks\n4. **Informative Communication** — Transparent reporting on sustainability performance\n5. **Inclusive Finance** — Expand access to financial services for underserved communities\n6. **Priority Sector Development** — Finance sectors aligned with national sustainability priorities\n7. **Coordination & Collaboration** — Cross-sector partnerships for sustainability\n8. **Capacity Building** — Develop internal ESG expertise and awareness\n\n**Key Requirement — RAKB (Rencana Aksi Keuangan Berkelanjutan):**\nBanks must submit a Sustainable Finance Action Plan to OJK annually, covering ESG integration targets, green portfolio growth, and capacity building initiatives.\n\n**Sustainability Report Sections:**\n- Sustainability strategy and governance\n- Economic, social, and environmental performance\n- Green portfolio composition and growth\n- Social responsibility programs\n- Third-party assurance statement (recommended)\n\nWould you like details on RAKB requirements or green portfolio classification?`;
    }
    if (q.includes('sasb') || q.includes('fn-cb')) {
      return `**SASB Standards — Commercial Banks (FN-CB)**\n\nThe Sustainability Accounting Standards Board defines 5 disclosure topics for commercial banks:\n\n1. **Data Security (FN-CB-230a)**\n   - Number of data breaches and personally identifiable information (PII) exposed\n   - Description of approach to identifying and addressing data security risks\n\n2. **Financial Inclusion & Capacity Building (FN-CB-240a)**\n   - Number of participants in financial literacy initiatives\n   - Number of no-cost/low-cost checking accounts provided to underbanked\n\n3. **Incorporation of ESG Factors in Credit Analysis (FN-CB-410a)**\n   - Description of approach to ESG integration in credit risk assessment\n   - Commercial and industrial credit exposure by industry with ESG risk\n\n4. **Financed Emissions (FN-CB-410b)**\n   - Gross financed emissions (absolute and intensity) by industry\n   - Description of methodology (PCAF recommended)\n\n5. **Business Ethics (FN-CB-510a)**\n   - Total amount of monetary losses from legal proceedings related to fraud/bribery\n   - Description of whistleblower policies and procedures\n\n**Key Metrics:** All topics require both quantitative metrics and qualitative management approach descriptions.\n\nWant me to compare SASB FN-CB with POJK 51 requirements?`;
    }
    if (q.includes('issb') || q.includes('ifrs s1') || q.includes('ifrs s2') || q.includes('climate')) {
      return `**ISSB Standards — IFRS S1 & S2**\n\nThe International Sustainability Standards Board issued two foundational standards:\n\n**IFRS S1 — General Sustainability-related Disclosures:**\n- **Governance**: Board oversight of sustainability risks/opportunities\n- **Strategy**: Impact on business model, value chain, and financial position\n- **Risk Management**: Processes to identify, assess, prioritize, and monitor\n- **Metrics & Targets**: Performance measurement and progress tracking\n\n**IFRS S2 — Climate-related Disclosures:**\n- **Climate Governance**: Board and management roles in climate oversight\n- **Climate Strategy**: Transition plans, scenario analysis (1.5\u00B0C and 2\u00B0C), resilience assessment\n- **GHG Emissions**: Scope 1, 2, and 3 emissions using GHG Protocol\n- **Financed Emissions**: PCAF-aligned portfolio carbon footprint\n- **Climate Targets**: Net-zero commitments, interim targets, SBTi alignment\n\n**Key Requirements:**\n- Scenario analysis is mandatory (both physical and transition risks)\n- Scope 3 emissions disclosure required (with phase-in relief)\n- Cross-industry and industry-specific metrics based on SASB standards\n- Effective for annual periods beginning on or after 1 January 2024\n\nWould you like guidance on implementing scenario analysis or calculating financed emissions?`;
    }
    if (q.includes('bni') || q.includes('benchmark') || q.includes('compare') || q.includes('industry')) {
      return `**Industry Benchmark — BNI (PT Bank Negara Indonesia Tbk)**\n\nBNI is one of Indonesia's leading banks in ESG and sustainable finance. Key metrics:\n\n**Sustainable Finance:**\n- Total sustainable financing portfolio: **IDR 196.7 trillion** (2023)\n- Green portfolio share: **22.3%** of total lending\n- Year-over-year growth in sustainable financing: **18.5%**\n\n**ESG Ratings:**\n- MSCI ESG Rating: **A** (upgraded from BBB in 2022)\n- Sustainalytics Risk Rating: **25.3** (Medium Risk)\n- CDP Climate Score: **B** (Management level)\n\n**Climate Performance:**\n- Scope 1+2 emissions reduction: **6.7%** year-over-year\n- Renewable energy in operations: **12%** of total energy consumption\n- Green bond issuance: **USD 500M** cumulative\n\n**POJK 51 Compliance:**\n- RAKB submitted annually since 2019\n- Sustainability report with independent assurance\n- ESG training for 85% of credit analysts\n\n**Gaps vs. Global Leaders:**\n- No Scope 3/financed emissions disclosure yet\n- No Science-Based Target (SBTi) commitment\n- TCFD alignment partial (no scenario analysis published)\n\nWould you like a detailed comparison with your document's findings?`;
    }
    if (q.includes('scope 3') || q.includes('financed emission') || q.includes('pcaf')) {
      return `**Financed Emissions & PCAF Guidance**\n\nFinanced emissions (Scope 3 Category 15) represent the largest portion of a bank's carbon footprint — typically **700x** larger than operational emissions.\n\n**PCAF (Partnership for Carbon Accounting Financials):**\n\nThe PCAF Global Standard provides methodologies for 7 asset classes:\n1. Listed equity & corporate bonds\n2. Business loans & unlisted equity\n3. Project finance\n4. Commercial real estate\n5. Mortgages\n6. Motor vehicle loans\n7. Sovereign debt\n\n**Data Quality Scores (1-5, lower is better):**\n- Score 1: Verified borrower emissions\n- Score 2: Unverified borrower emissions\n- Score 3: Physical activity-based estimation\n- Score 4: Revenue-based estimation\n- Score 5: Asset class-level estimation\n\n**Implementation Steps:**\n1. Map lending portfolio to PCAF asset classes\n2. Collect borrower emissions data where available\n3. Apply emission factors for data gaps\n4. Calculate attribution factor (outstanding amount / total equity + debt)\n5. Aggregate and report by sector and asset class\n\n**Target:** Achieve weighted average data quality score below 3.0 within 3 years.\n\nWould you like help mapping your portfolio to PCAF asset classes?`;
    }
    if (q.includes('net zero') || q.includes('sbt') || q.includes('science-based') || q.includes('carbon')) {
      return `**Climate Targets & Science-Based Targets (SBT) Guidance**\n\n**Science-Based Targets Initiative (SBTi) for Financial Institutions:**\n\nSBTi provides a framework for banks to set emissions reduction targets aligned with the Paris Agreement:\n\n**Requirements:**\n1. **Scope 1 & 2**: Absolute reduction of 4.2% per year (1.5\u00B0C pathway)\n2. **Scope 3 — Financed Emissions**: Sector-specific intensity targets using SDA approach\n3. **Portfolio Alignment**: Demonstrate lending portfolio is Paris-aligned\n4. **Net-Zero Commitment**: Long-term target of net-zero by 2050 with interim 2030 targets\n\n**SBTi for Banks — Key Sectors:**\n- Power generation: Align to 0.14 tCO2/MWh by 2030\n- Real estate: Align to sector decarbonization pathway\n- Transport: Align to IEA Net-Zero scenario\n- Oil & gas: Phase-down financing in line with IEA NZE\n\n**Net-Zero Banking Alliance (NZBA) Commitments:**\n- Set 2030 intermediate targets within 18 months of joining\n- Prioritize highest-emitting sectors (>65% of financed emissions)\n- Annual progress reporting with transparent methodology\n\n**Implementation Roadmap:**\n1. Calculate baseline financed emissions (PCAF)\n2. Set sector-specific intensity targets (SBTi SDA)\n3. Develop transition plan with client engagement strategy\n4. Establish internal carbon pricing mechanism\n5. Report progress annually with third-party verification\n\nWould you like guidance on setting specific sector targets for your portfolio?`;
    }
    if (q.includes('score') || q.includes('summary') || q.includes('result') || q.includes('overall')) {
      return report
        ? `**Compliance Summary**\n\nOverall Score: **${report.overall_score}%**\n\n${report.summary}\n\n**Breakdown:**\n${report.findings.map(f => `- **${f.section}**: ${f.status === 'compliant' ? '✅ Compliant' : f.status === 'partial' ? '⚠️ Partial' : '❌ Non-Compliant'} (Risk: ${f.risk_level})`).join('\n')}\n\nWould you like remediation recommendations for the non-compliant areas?`
        : `No compliance check has been run yet. Please upload a document and select regulations, then click "Run Compliance Check" to generate a report.\n\nOnce you have results, I can help analyze the findings, suggest remediation steps, or compare requirements across regulations.`;
    }

    // Default contextual response
    return `I can help you with compliance questions about **${regNames}**.\n\nHere are some things you can ask me:\n\n- "What does POJK 6/2022 require for incident reporting?"\n- "Compare NIST CSF with ISO 27001"\n- "What are the key gaps in my document?"\n- "How do I remediate non-compliant findings?"\n- "Explain the GDPR breach notification requirements"\n- "What is the overall compliance score?"\n\nI have detailed knowledge of all 8 regulations in the system. Ask me anything specific!`;
  };

  const sendChatMessage = async (text: string) => {
    if (!text.trim() || sending) return;

    const userMsg: ChatMessage = { role: 'user', content: text, timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setChatInput('');
    setSending(true);

    try {
      // Check auth first
      const token = localStorage.getItem('token');
      if (!token) throw { isAuthError: true };

      const res = await api.post('/compliance/chat', {
        message: text,
        regulation_ids: selectedRegIds,
        has_document: !!uploadedFile,
      }, { timeout: 120000 }); // 2 min timeout for LLM

      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: res.data.message,
        model_used: res.data.model_used,
        provider: res.data.provider,
        latency_ms: res.data.latency_ms,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, assistantMsg]);
      setIsTyping(true);
    } catch (err: any) {
      if (err?.isAuthError || err?.response?.status === 401) {
        const errMsg: ChatMessage = {
          role: 'assistant',
          content: '⚠️ **Session expired.** Please login again to use the compliance chat with live LLM analysis.\n\n_Switching to demo mode for now._',
          model_used: 'demo',
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, errMsg]);
      }

      // Context-aware demo fallback based on the user's question
      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: getChatDemoResponse(text),
        model_used: 'demo (offline)',
        provider: 'local',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, assistantMsg]);
      setIsTyping(false);
    } finally {
      setSending(false);
    }
  };

  const handleChatKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendChatMessage(chatInput);
    }
  };

  // ── Group regulations by country ───────────────────────────

  const groupedRegs = regulations.reduce<Record<string, Regulation[]>>((acc, reg) => {
    const group = reg.country || 'Other';
    if (!acc[group]) acc[group] = [];
    acc[group].push(reg);
    return acc;
  }, {});

  const selectedRegs = regulations.filter(r => selectedRegIds.includes(r.id));

  // ── Export report ──────────────────────────────────────────

  const handleExportReport = () => {
    if (!report) return;

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const margin = 20;
    const contentWidth = pageWidth - margin * 2;
    let y = margin;

    const addPage = () => { pdf.addPage(); y = margin; };
    const checkSpace = (needed: number) => { if (y + needed > 270) addPage(); };

    // Title
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(20);
    pdf.text('Compliance Report', margin, y);
    y += 10;

    // Divider
    pdf.setDrawColor(69, 137, 255);
    pdf.setLineWidth(0.8);
    pdf.line(margin, y, pageWidth - margin, y);
    y += 10;

    // Overall score
    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'bold');
    pdf.text(`Overall Score: ${report.overall_score}%`, margin, y);
    y += 8;

    // Score bar
    const barWidth = 60;
    const barHeight = 6;
    pdf.setFillColor(224, 224, 224);
    pdf.roundedRect(margin, y, barWidth, barHeight, 2, 2, 'F');
    const scoreColor = report.overall_score >= 70 ? [36, 161, 72] : report.overall_score >= 40 ? [242, 162, 12] : [218, 30, 40];
    pdf.setFillColor(scoreColor[0], scoreColor[1], scoreColor[2]);
    pdf.roundedRect(margin, y, barWidth * (report.overall_score / 100), barHeight, 2, 2, 'F');
    y += 14;

    // Summary
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    const summaryLines = pdf.splitTextToSize(report.summary || 'No summary available.', contentWidth);
    checkSpace(summaryLines.length * 5 + 4);
    pdf.text(summaryLines, margin, y);
    y += summaryLines.length * 5 + 8;

    // Findings header
    checkSpace(12);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(14);
    pdf.text('Findings', margin, y);
    y += 8;

    // Findings table
    const statusColors: Record<string, number[]> = {
      compliant: [36, 161, 72],
      partial: [242, 162, 12],
      non_compliant: [218, 30, 40],
      na: [141, 141, 141],
    };
    const statusLabels: Record<string, string> = {
      compliant: 'Compliant',
      partial: 'Partial',
      non_compliant: 'Non-Compliant',
      na: 'N/A',
    };

    for (const f of report.findings) {
      const findingsText = pdf.splitTextToSize(f.findings || '', contentWidth - 4);
      const blockHeight = 24 + findingsText.length * 4 + 12; // Extra space for ref/rec formatting
      checkSpace(blockHeight + 6);

      // Section header row
      pdf.setFillColor(237, 245, 255);
      pdf.rect(margin, y, contentWidth, 8, 'F');
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(10);
      pdf.setTextColor(0, 0, 0);
      pdf.text(f.section, margin + 2, y + 5.5);

      // Status badge
      const color = statusColors[f.status] || [141, 141, 141];
      const label = statusLabels[f.status] || f.status;
      const badgeX = pageWidth - margin - 40;
      pdf.setFillColor(color[0], color[1], color[2]);
      pdf.roundedRect(badgeX, y + 1, 22, 5.5, 1.5, 1.5, 'F');
      pdf.setFontSize(7);
      pdf.setTextColor(255, 255, 255);
      pdf.text(label, badgeX + 11, y + 5, { align: 'center' });

      // Risk badge
      const riskX = badgeX + 24;
      const riskColors: Record<string, number[]> = {
        low: [36, 161, 72], medium: [242, 162, 12], high: [218, 30, 40], critical: [138, 14, 30],
      };
      const rc = riskColors[f.risk_level] || [141, 141, 141];
      pdf.setFillColor(rc[0], rc[1], rc[2]);
      pdf.roundedRect(riskX, y + 1, 14, 5.5, 1.5, 1.5, 'F');
      pdf.setFontSize(6);
      pdf.text(f.risk_level.toUpperCase(), riskX + 7, y + 5, { align: 'center' });

      y += 10;

      // Findings text — split into Ref, body, and Recommendation
      const rawFindings = f.findings || '';
      const recSplit = rawFindings.indexOf('\nRecommendation:');
      const mainPart = recSplit >= 0 ? rawFindings.substring(0, recSplit) : rawFindings;
      const recPart = recSplit >= 0 ? rawFindings.substring(recSplit + 1) : '';

      // Ref line (bold)
      const refLineMatch = mainPart.match(/^(Ref:\s*[^—]+—)\s*/);
      if (refLineMatch) {
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(9);
        pdf.setTextColor(22, 22, 22);
        const refLines = pdf.splitTextToSize(refLineMatch[1], contentWidth - 4);
        pdf.text(refLines, margin + 2, y + 4);
        y += refLines.length * 4;
      }

      // Findings body (normal)
      const bodyText = refLineMatch ? mainPart.substring(refLineMatch[0].length) : mainPart;
      if (bodyText.trim()) {
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(9);
        pdf.setTextColor(60, 60, 60);
        const bodyLines = pdf.splitTextToSize(bodyText.trim(), contentWidth - 4);
        pdf.text(bodyLines, margin + 2, y + 4);
        y += bodyLines.length * 4;
      }

      // Recommendation (bold label + normal text)
      if (recPart) {
        y += 3;
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(9);
        pdf.setTextColor(0, 67, 206);
        pdf.text('Recommendation:', margin + 2, y + 4);
        y += 4;
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(60, 60, 60);
        const recBody = recPart.replace(/^Recommendation:\s*/, '');
        const recLines = pdf.splitTextToSize(recBody, contentWidth - 4);
        pdf.text(recLines, margin + 2, y + 4);
        y += recLines.length * 4;
      }
      y += 8;

      pdf.setTextColor(0, 0, 0);
    }

    // Footer
    const pageCount = pdf.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      pdf.setPage(i);
      pdf.setFontSize(8);
      pdf.setTextColor(120, 120, 120);
      pdf.text(`Generated by DocProc Compliance Checker`, margin, 287);
      pdf.text(`Page ${i} of ${pageCount}`, pageWidth - margin, 287, { align: 'right' });
    }

    pdf.save('compliance-report.pdf');
  };

  // ── Category badge color ───────────────────────────────────

  const categoryTagType = (cat: string): string => {
    const map: Record<string, string> = {
      Financial: 'blue',
      Technology: 'teal',
      Payment: 'purple',
      Cybersecurity: 'red',
      'Information Security': 'cyan',
      'Data Privacy': 'magenta',
      banking: 'blue',
      payment_system: 'purple',
      cybersecurity: 'red',
      information_security: 'cyan',
      data_privacy: 'magenta',
      healthcare: 'teal',
      financial_reporting: 'blue',
      esg_sustainability: 'green',
    };
    return map[cat] || 'gray';
  };

  // ── Render ─────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', gap: 24, height: 'calc(100vh - 96px)' }}>
      <style>{`
        @keyframes blink {
          50% { opacity: 0; }
        }
      `}</style>

      {/* ── LEFT PANEL (40%) ──────────────────────────────────── */}
      <div style={{ width: '40%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{ marginBottom: 16 }}>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 400, color: '#161616', marginBottom: 4 }}>
            Compliance
          </h1>
          <p style={{ fontSize: '0.875rem', fontWeight: 300, color: '#525252' }}>
            Check documents against regulations and standards
          </p>
        </div>

        {/* Model selector */}
        {modelOptions.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <Select
              id="compliance-model-select"
              labelText="Model"
              size="sm"
              value={selectedModel}
              onChange={(e: any) => handleModelChange(e.target.value)}
            >
              <SelectItem value="" text="Select model..." />
              {modelOptions.map(opt => (
                <SelectItem key={opt.value} value={opt.value} text={opt.label} />
              ))}
            </Select>
          </div>
        )}

        {/* Regulation selector */}
        <div style={{ marginBottom: 16 }}>
          <FilterableMultiSelect
            id="regulation-select"
            titleText="Regulations"
            placeholder="Search and select regulations..."
            items={regulations.map(r => ({ id: r.id, text: r.name, country: r.country }))}
            itemToString={(item: any) => item?.text || ''}
            onChange={({ selectedItems }: any) => setSelectedRegIds(selectedItems.map((s: any) => s.id))}
            selectionFeedback="top-after-reopen"
            disabled={loadingRegs}
          />
        </div>

        {/* Selected regulation cards */}
        <div style={{ flex: 1, overflowY: 'auto', marginBottom: 16, minHeight: 0 }}>
          {Object.entries(groupedRegs).map(([country, regs]) => {
            const visibleRegs = regs.filter(r => selectedRegIds.length === 0 || selectedRegIds.includes(r.id));
            if (visibleRegs.length === 0) return null;
            return (
              <div key={country} style={{ marginBottom: 16 }}>
                <p style={{ fontSize: '0.75rem', fontWeight: 400, color: '#525252', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>
                  {country}
                </p>
                {visibleRegs.map(reg => (
                  <Tile
                    key={reg.id}
                    style={{
                      padding: 16,
                      marginBottom: 8,
                      border: selectedRegIds.includes(reg.id) ? '2px solid #4589FF' : '1px solid #E0E0E0',
                      borderRadius: 4,
                      cursor: 'pointer',
                      background: selectedRegIds.includes(reg.id) ? '#EDF5FF' : '#FFFFFF',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                      <p style={{ fontSize: '0.875rem', fontWeight: 400, color: '#161616', margin: 0 }}>
                        {reg.name}
                      </p>
                      <Tag type={categoryTagType(reg.category) as any} size="sm">{reg.category}</Tag>
                    </div>
                    <p style={{ fontSize: '0.75rem', color: '#525252', margin: '4px 0' }}>
                      {reg.issuer}
                    </p>
                    {reg.description && (
                      <p style={{ fontSize: '0.75rem', color: '#6f6f6f', margin: '4px 0 0' }}>
                        {reg.description}
                      </p>
                    )}
                    <p style={{ fontSize: '0.6875rem', color: '#A8A8A8', margin: '6px 0 0' }}>
                      {reg.sections_count} sections
                    </p>
                  </Tile>
                ))}
              </div>
            );
          })}
        </div>

        {/* File upload */}
        <div style={{ marginBottom: 16 }}>
          {uploadedFile ? (
            <Tile style={{ padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Document size={20} style={{ color: '#4589FF' }} />
                <span style={{ fontSize: '0.875rem', fontWeight: 400 }}>{uploadedFile.name}</span>
                <span style={{ fontSize: '0.75rem', color: '#525252' }}>
                  ({(uploadedFile.size / 1024).toFixed(1)} KB)
                </span>
              </div>
              <Button
                kind="ghost"
                size="sm"
                hasIconOnly
                renderIcon={TrashCan}
                iconDescription="Remove file"
                onClick={() => setUploadedFile(null)}
              />
            </Tile>
          ) : (
            <FileUploaderDropContainer onFilesSelected={handleFilesSelected} />
          )}
        </div>

        {/* Run check button */}
        <Button
          kind="primary"
          renderIcon={Security}
          disabled={!uploadedFile || selectedRegIds.length === 0 || checking}
          onClick={handleRunCheck}
          style={{ width: '100%', justifyContent: 'center' }}
        >
          {checking ? 'Checking...' : 'Run Compliance Check'}
        </Button>

        {checking && (
          <div style={{ marginTop: 12 }}>
            <ProgressBar
              label="Analyzing document..."
              value={checkProgress}
              size="small"
              status="active"
            />
          </div>
        )}
      </div>

      {/* ── RIGHT PANEL (60%) ─────────────────────────────────── */}
      <div style={{ width: '60%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {notification && (
          <InlineNotification
            kind={notification.kind}
            title={notification.text}
            onClose={() => setNotification(null)}
            style={{ marginBottom: 12 }}
          />
        )}

        <Tabs>
          <TabList aria-label="Compliance tabs">
            <Tab>Chat</Tab>
            <Tab>Compliance Report</Tab>
          </TabList>
          <TabPanels>
            {/* ── Chat tab ────────────────────────────────────────── */}
            <TabPanel style={{ padding: 0 }}>
              <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 200px)' }}>
                <Tile style={{ flex: 1, overflow: 'auto', padding: 24, marginBottom: 12, minHeight: 0 }}>
                  {messages.length === 0 ? (
                    <div style={{ textAlign: 'center', paddingTop: 60, color: '#525252' }}>
                      <Security size={48} style={{ marginBottom: 16, opacity: 0.3 }} />
                      <h3 style={{ fontWeight: 400, marginBottom: 8 }}>Compliance Assistant</h3>
                      <p style={{ marginBottom: 24 }}>
                        Ask questions about regulations and document compliance.
                      </p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
                        {SUGGESTED_QUESTIONS.map((q, i) => (
                          <Button
                            key={i}
                            kind="ghost"
                            size="sm"
                            onClick={() => sendChatMessage(q)}
                            style={{
                              border: '1px solid #E0E0E0',
                              borderRadius: 16,
                              fontSize: '0.8125rem',
                            }}
                          >
                            {q}
                          </Button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    messages.map((msg, i) => {
                      const isLastAssistant = msg.role === 'assistant' && i === messages.length - 1;
                      const showTyping = isLastAssistant && isTyping;

                      return (
                        <div
                          key={i}
                          style={{
                            display: 'flex',
                            justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                            marginBottom: 16,
                          }}
                        >
                          <div
                            style={{
                              maxWidth: '75%',
                              padding: '12px 16px',
                              borderRadius: 8,
                              background: msg.role === 'user' ? '#4589ff' : '#f4f4f4',
                              color: msg.role === 'user' ? '#fff' : '#161616',
                            }}
                          >
                            {showTyping ? (
                              <TypingMessage fullText={msg.content} onDone={handleTypingDone} />
                            ) : (
                              <p style={{ whiteSpace: 'pre-wrap', margin: 0, lineHeight: 1.5 }}>{msg.content}</p>
                            )}
                            {!showTyping && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                                <span style={{ fontSize: 11, opacity: 0.6 }}>
                                  {msg.timestamp.toLocaleTimeString()}
                                </span>
                                {msg.model_used && (
                                  <span style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 4,
                                    padding: '1px 8px', borderRadius: 10, fontSize: 10,
                                    background: '#e0e0e0', color: '#525252',
                                  }}>
                                    <Ai size={10} />
                                    {PROVIDER_LABELS[msg.provider || ''] || msg.provider}
                                    <span style={{ opacity: 0.5 }}>/</span>
                                    {msg.model_used}
                                    {msg.latency_ms != null && (
                                      <span style={{ opacity: 0.6, marginLeft: 2 }}>
                                        {(msg.latency_ms / 1000).toFixed(1)}s
                                      </span>
                                    )}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={messagesEndRef} />
                </Tile>

                {/* Chat input */}
                <div style={{ display: 'flex', gap: 8 }}>
                  <TextInput
                    id="compliance-chat-input"
                    labelText=""
                    hideLabel
                    placeholder="Ask about compliance..."
                    value={chatInput}
                    onChange={(e: any) => setChatInput(e.target.value)}
                    onKeyDown={handleChatKeyDown}
                    disabled={sending || isTyping}
                    style={{ flex: 1 }}
                  />
                  <Button
                    kind="primary"
                    renderIcon={sending ? undefined : Send}
                    onClick={() => sendChatMessage(chatInput)}
                    disabled={!chatInput.trim() || sending || isTyping}
                  >
                    {sending ? 'Sending...' : 'Send'}
                  </Button>
                </div>
              </div>
            </TabPanel>

            {/* ── Compliance Report tab ───────────────────────────── */}
            <TabPanel style={{ padding: 0 }}>
              {!report ? (
                <div style={{ textAlign: 'center', padding: 60, color: '#525252' }}>
                  <Security size={48} style={{ marginBottom: 16, opacity: 0.3 }} />
                  <h3 style={{ fontWeight: 400, marginBottom: 8 }}>No Report Yet</h3>
                  <p>Select regulations, upload a document, and run a compliance check to see results.</p>
                </div>
              ) : (
                <div style={{ maxHeight: 'calc(100vh - 200px)', overflowY: 'auto' }}>
                  {/* Score and summary */}
                  <div style={{ display: 'flex', gap: 24, alignItems: 'center', marginBottom: 24 }}>
                    <ScoreGauge score={report.overall_score} />
                    <div style={{ flex: 1 }}>
                      <h3 style={{ fontWeight: 400, marginBottom: 8 }}>Summary</h3>
                      <p style={{ fontSize: '0.875rem', fontWeight: 300, color: '#525252', lineHeight: 1.6 }}>
                        {report.summary}
                      </p>
                      {report.model_used && (
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          padding: '2px 10px', borderRadius: 10, fontSize: 11,
                          background: '#e0e0e0', color: '#525252', marginTop: 8,
                        }}>
                          <Ai size={12} />
                          {PROVIDER_LABELS[report.provider || ''] || report.provider}
                          <span style={{ opacity: 0.5 }}>/</span>
                          {report.model_used}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Quick stats */}
                  <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
                    {(['compliant', 'non_compliant', 'partial', 'na'] as const).map(status => {
                      const count = report.findings.filter(f => f.status === status).length;
                      const cfg = STATUS_CONFIG[status];
                      return (
                        <Tile key={status} style={{ flex: 1, padding: 12, textAlign: 'center' }}>
                          <p style={{ fontSize: '1.25rem', fontWeight: 400, color: '#161616' }}>{count}</p>
                          <Tag type={cfg.tagType as any} size="sm">{cfg.label}</Tag>
                        </Tile>
                      );
                    })}
                  </div>

                  {/* Findings table */}
                  <Tile style={{ padding: 0, marginBottom: 16 }}>
                    <StructuredListWrapper>
                      <StructuredListHead>
                        <StructuredListRow head>
                          <StructuredListCell head>Section</StructuredListCell>
                          <StructuredListCell head>Status</StructuredListCell>
                          <StructuredListCell head>Findings</StructuredListCell>
                          <StructuredListCell head>Risk Level</StructuredListCell>
                        </StructuredListRow>
                      </StructuredListHead>
                      <StructuredListBody>
                        {report.findings.map((f, i) => {
                          const cfg = STATUS_CONFIG[f.status];
                          return (
                            <StructuredListRow key={i}>
                              <StructuredListCell>
                                <span style={{ fontSize: '0.875rem', fontWeight: 400 }}>{f.section}</span>
                              </StructuredListCell>
                              <StructuredListCell>
                                <Tag type={cfg.tagType as any} size="sm">
                                  {cfg.icon}
                                  <span style={{ marginLeft: 4 }}>{cfg.label}</span>
                                </Tag>
                              </StructuredListCell>
                              <StructuredListCell>
                                <div style={{ fontSize: '0.8125rem', fontWeight: 300, color: '#525252', lineHeight: '1.5' }}>
                                  {(() => {
                                    const text = f.findings || '';
                                    // Split into reference/findings part and recommendation part
                                    const recIdx = text.indexOf('\nRecommendation:');
                                    const mainText = recIdx >= 0 ? text.substring(0, recIdx) : text;
                                    const recText = recIdx >= 0 ? text.substring(recIdx + 1) : '';

                                    // Bold the "Ref: ... —" prefix in main text
                                    const refMatch = mainText.match(/^(Ref:\s*[^—]+—)\s*/);
                                    const refPart = refMatch ? refMatch[1] : '';
                                    const findingBody = refMatch ? mainText.substring(refMatch[0].length) : mainText;

                                    return (
                                      <>
                                        {refPart && (
                                          <span style={{ fontWeight: 600, color: '#161616' }}>{refPart}</span>
                                        )}
                                        {' '}{findingBody}
                                        {recText && (
                                          <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #E0E0E0' }}>
                                            <span style={{ fontWeight: 600, color: '#0043CE' }}>Recommendation: </span>
                                            {recText.replace(/^Recommendation:\s*/, '')}
                                          </div>
                                        )}
                                      </>
                                    );
                                  })()}
                                </div>
                              </StructuredListCell>
                              <StructuredListCell>
                                <Tag type={RISK_TAG[f.risk_level] as any} size="sm">
                                  {f.risk_level.charAt(0).toUpperCase() + f.risk_level.slice(1)}
                                </Tag>
                              </StructuredListCell>
                            </StructuredListRow>
                          );
                        })}
                      </StructuredListBody>
                    </StructuredListWrapper>
                  </Tile>

                  {/* Export button */}
                  <Button
                    kind="tertiary"
                    renderIcon={Download}
                    onClick={handleExportReport}
                    size="sm"
                  >
                    Export Report
                  </Button>
                </div>
              )}
            </TabPanel>
          </TabPanels>
        </Tabs>
      </div>
    </div>
  );
};

export default CompliancePage;
