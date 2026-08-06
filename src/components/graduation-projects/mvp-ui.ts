export type GraduationProjectActor =
  | "leader"
  | "member"
  | "coordinator"
  | "supervisor_pending"
  | "supervisor"
  | "committee"
  | "administration";
export type GraduationProjectState =
  | "draft"
  | "submitted"
  | "revision_required"
  | "rejected"
  | "approved"
  | "active"
  | "defense_scheduled"
  | "evaluating"
  | "archived";
export type FinalDecision = "passed" | "revisions_required" | "failed" | null;

export interface IdentityOption {
  id: string;
  name: string;
  secondary?: string;
}
export interface TeamMember {
  id: string;
  name: string;
  academicNumber?: string;
  leader: boolean;
}
export interface PrivateFile {
  id: string;
  name: string;
  category: "proposal" | "progress" | "final";
  state: "uploading" | "processing" | "ready" | "rejected";
  progress?: number;
  downloadable: boolean;
}
export interface ProgressUpdate {
  id: string;
  text: string;
  state: "submitted" | "returned" | "approved";
  submittedAt: string;
  supervisorComment?: string;
  attachment?: PrivateFile;
}
export interface GraduationProjectSummary {
  id: string;
  title: string;
  state: GraduationProjectState;
  finalDecision: FinalDecision;
  roles: GraduationProjectActor[];
  nextAction?: string;
}
export interface GraduationProjectDetail extends GraduationProjectSummary {
  viewer: GraduationProjectActor;
  teamLocked: boolean;
  team: TeamMember[];
  proposal: {
    problemStatement: string;
    objectives: string;
    summary: string;
    attachment?: PrivateFile;
    decision?: "accepted" | "returned" | "rejected";
    comments?: string;
  };
  supervisor?: { name: string; acceptance: "pending" | "accepted" | "declined" };
  progress: ProgressUpdate[];
  finalFile?: PrivateFile;
  finalResponse?: { state: "ready" | "returned"; comments?: string };
  defense?: { startsAt: string; venue: string; committeeCount: number; held: boolean };
  evaluation?: {
    ownScore?: number;
    ownNotes?: string;
    submitted: boolean;
    submittedCount: number;
    requiredCount: number;
    average?: number;
  };
  revisions?: string;
  archive?: { archivedAt: string; summary: string; file?: PrivateFile };
  coordinatorOptions: {
    supervisors: IdentityOption[];
    committee: IdentityOption[];
    students: IdentityOption[];
  };
}

export type UiAction =
  | { type: "member_add"; studentId: string }
  | { type: "member_remove"; memberId: string }
  | { type: "proposal_save"; problemStatement: string; objectives: string; summary: string }
  | { type: "proposal_submit" }
  | { type: "proposal_decide"; decision: "accepted" | "returned" | "rejected"; comments?: string }
  | { type: "supervisor_assign"; facultyId: string }
  | { type: "supervisor_respond"; response: "accepted" | "declined" }
  | { type: "progress_submit"; text: string }
  | {
      type: "progress_review";
      updateId: string;
      decision: "approved" | "returned";
      comments?: string;
    }
  | { type: "final_review"; decision: "ready" | "returned"; comments?: string }
  | { type: "defense_schedule"; startsAt: string; venue: string }
  | { type: "committee_assign"; facultyIds: string[] }
  | { type: "defense_held" }
  | { type: "evaluation_submit"; score: number; notes: string }
  | { type: "result_record"; decision: Exclude<FinalDecision, null>; revisions?: string }
  | { type: "archive" }
  | { type: "download"; fileId: string }
  | { type: "upload"; category: PrivateFile["category"]; file: File };

export const STATE_LABELS: Record<GraduationProjectState, string> = {
  draft: "مسودة",
  submitted: "بانتظار مراجعة المقترح",
  revision_required: "معاد للتعديل",
  rejected: "مرفوض",
  approved: "مقترح مقبول",
  active: "نشط",
  defense_scheduled: "مناقشة مشروع التخرج مجدولة",
  evaluating: "قيد التقييم",
  archived: "مؤرشف",
};
export const DECISION_LABELS: Record<Exclude<FinalDecision, null>, string> = {
  passed: "ناجح",
  revisions_required: "تعديلات مطلوبة",
  failed: "راسب",
};
