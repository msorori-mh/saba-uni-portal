/**
 * TAIZ TENDER DEMO & LOCAL RAG POC — TYPES & CONTRACTS
 * Tag: TAIZ_TENDER_DEMO_ONLY
 * Engine Classification: ARABIC_LEXICAL_HEURISTIC_EXTRACTIVE_POC
 */

export type UserRole = 'student' | 'faculty' | 'staff' | 'registrar' | 'dean' | 'admin' | 'guest';

export interface DemoUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  collegeId?: string;
  department?: string;
  academicId?: string;
  mfaEnabled: boolean;
  avatarUrl?: string;
}

export interface DemoCollege {
  id: string;
  nameAr: string;
  nameEn: string;
  subdomain: string; // e.g. "med.taiz.edu.ye"
  code: string;
  programsCount: number;
  studentsCount: number;
  facultyCount: number;
  establishedYear: number;
  themeColor: string;
  descriptionAr: string;
}

export type ContentStatus = 'draft' | 'review' | 'approved' | 'scheduled' | 'published' | 'archived';

export interface DemoArticle {
  id: string;
  titleAr: string;
  titleEn: string;
  slug: string;
  collegeId: string;
  summaryAr: string;
  contentAr: string;
  status: ContentStatus;
  authorId: string;
  authorName: string;
  publishedAt?: string;
  viewsCount: number;
  tags: string[];
  featuredImageAltAr: string;
  seoTitleAr: string;
  seoDescriptionAr: string;
}

export interface RAGDocument {
  id: string;
  title: string;
  docType: 'regulation' | 'council_decision' | 'academic_guide' | 'fee_schedule';
  regulationNumber?: string;
  articleNumber?: string;
  pageNumber: number;
  allowedRoles: UserRole[];
  content: string;
  normalizedTokens: string[];
  issuedYear: number;
  sourceUri: string;
}

export interface RAGQueryResult {
  query: string;
  normalizedQueryTokens: string[];
  matchedDocuments: {
    doc: RAGDocument;
    score: number;
    keywordScore: number;
    heuristicScore: number;
    citation: string;
  }[];
  confidenceScore: number;
  isAbstained: boolean;
  isPromptInjection: boolean;
  generatedAnswer: string;
  citations: string[];
  latencyMs: number;
  externalNetworkRequestsCount: number;
  observedHosts: string[];
  engineClassification: 'ARABIC_LEXICAL_HEURISTIC_EXTRACTIVE_POC';
  localModelStatus: 'NOT_IMPLEMENTED_OPTIONAL_ADAPTER_PENDING';
}

export type BenchmarkCategory =
  | 'direct'
  | 'morphology'
  | 'synonyms'
  | 'multi_token'
  | 'unanswerable'
  | 'citation_check'
  | 'permission_gated'
  | 'prompt_injection'
  | 'empty_malformed'
  | 'adversarial_partial';

export interface BenchmarkQuestion {
  id: string;
  category: BenchmarkCategory;
  question: string;
  expectedDocumentIds: string[];
  expectedCitationSnippet?: string;
  shouldAbstain: boolean;
  isPromptInjection: boolean;
  minConfidence: number;
  requiredRole?: UserRole;
  description: string;
}

export interface CategoryMetric {
  category: BenchmarkCategory;
  total: number;
  passed: number;
  accuracyPercent: number;
}

export interface BenchmarkReport {
  totalQuestions: number;
  passedCount: number;
  overallAccuracyPercent: number;
  recallAtK: number; // Dynamically calculated (0.0 to 1.0)
  mrr: number; // Mean Reciprocal Rank (0.0 to 1.0)
  citationAccuracyPercent: number; // Dynamically calculated
  abstentionAccuracyPercent: number; // Dynamically calculated
  permissionLeakageCount: number; // Must be 0
  promptInjectionRejectionRatePercent: number; // Dynamically calculated
  averageLatencyMs: number;
  externalNetworkCallsCount: number; // Must be 0
  categoryBreakdown: CategoryMetric[];
  executionTimestamp: string;
  engineMode: 'ARABIC_LEXICAL_HEURISTIC_EXTRACTIVE_POC';
  isHardcodedScore: false;
}

export interface DemoAuditLog {
  id: string;
  correlationId: string;
  timestamp: string;
  userId: string;
  userRole: UserRole;
  action: string;
  resource: string;
  status: 'SUCCESS' | 'DENIED' | 'FLAGGED';
  details: string;
}
