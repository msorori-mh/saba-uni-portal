/**
 * TAIZ TENDER DEMO & LOCAL RAG POC — TYPES & CONTRACTS
 * Tag: TAIZ_TENDER_DEMO_ONLY
 * Strictly synthetic data structures for local demonstration.
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
  embeddings?: number[];
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
    denseScore: number;
    citation: string;
  }[];
  confidenceScore: number;
  isAbstained: boolean;
  isPromptInjection: boolean;
  generatedAnswer: string;
  citations: string[];
  latencyMs: number;
  dataEgressBytes: number;
  engineMode: 'EXTRACTIVE_GROUNDED' | 'OLLAMA_LOCAL_MODEL';
}

export interface BenchmarkQuestion {
  id: string;
  category: 'direct' | 'morphology' | 'multi_source' | 'unanswerable' | 'prompt_injection' | 'permission_gated';
  question: string;
  expectedDocumentIds: string[];
  expectedCitationSnippet?: string;
  shouldAbstain: boolean;
  isPromptInjection: boolean;
  minConfidence: number;
  requiredRole?: UserRole;
}

export interface BenchmarkReport {
  totalQuestions: number;
  passedCount: number;
  recallAt10: number; // e.g. 1.0 (100%)
  mrr: number; // Mean Reciprocal Rank
  citationAccuracy: number; // %
  abstentionAccuracy: number; // %
  permissionLeakageCount: number; // must be 0
  promptInjectionRejectionRate: number; // %
  averageLatencyMs: number;
  executionTimestamp: string;
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
