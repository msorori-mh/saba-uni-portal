import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  ROLE_LABELS,
  type AssignmentCandidates,
  type AssignmentRow,
  type LifecycleAction,
} from "../../lib/graduation-projects/lifecycle";
import type { AssignableFacultyRole } from "../../lib/graduation-projects/rpc";
import type { ProjectRole } from "../../lib/graduation-projects/domain";

export interface AssignmentsPanelProps {
  actions: LifecycleAction[];
  assignments: AssignmentRow[];
  candidates: AssignmentCandidates | null;
  busy?: boolean;
  onAddTeamMember(studentProfileId: string): void;
  onAssignFaculty(role: AssignableFacultyRole, facultyProfileId: string): void;
  onEndAssignment(assignmentId: string): void;
}

const ASSIGNABLE_ROLE_LABELS: Record<AssignableFacultyRole, string> = {
  supervisor: ROLE_LABELS.supervisor,
  co_supervisor: ROLE_LABELS.co_supervisor,
  coordinator: ROLE_LABELS.coordinator,
  panel_member: ROLE_LABELS.panel_member,
};

export function AssignmentsPanel({
  actions,
  assignments,
  candidates,
  busy = false,
  onAddTeamMember,
  onAssignFaculty,
  onEndAssignment,
}: AssignmentsPanelProps) {
  const [studentId, setStudentId] = useState("");
  const [facultyId, setFacultyId] = useState("");
  const [facultyRole, setFacultyRole] = useState<AssignableFacultyRole>("supervisor");
  const canAddTeam = actions.includes("add_team_member");
  const canAssignFaculty = actions.includes("assign_faculty");
  const canEndAssignment = actions.includes("end_assignment");

  const nameOf = (assignment: AssignmentRow): string => {
    const profileId = assignment.student_profile_id ?? assignment.faculty_profile_id;
    const pool = assignment.role === "student" ? candidates?.students : candidates?.faculty;
    const match = pool?.find((candidate) => candidate.profile_id === profileId);
    return match?.full_name ?? "—";
  };

  return (
    <div dir="rtl" className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>الفريق والتعيينات</CardTitle>
          <CardDescription>
            أعضاء الفريق والأدوار المباشرة على المشروع. التعيين المباشر هو أساس الصلاحية الوحيد.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <ul className="space-y-2">
            {assignments.map((assignment) => (
              <li key={assignment.id} className="flex flex-wrap items-center gap-2 border-b pb-2">
                <Badge variant={assignment.active ? "secondary" : "outline"}>
                  {ROLE_LABELS[assignment.role as ProjectRole] ?? assignment.role}
                </Badge>
                <span className="text-sm">{nameOf(assignment)}</span>
                {!assignment.active ? (
                  <span className="text-xs text-muted-foreground">منتهٍ</span>
                ) : null}
                {assignment.active && canEndAssignment ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => onEndAssignment(assignment.id)}
                  >
                    إنهاء التعيين
                  </Button>
                ) : null}
              </li>
            ))}
            {assignments.length === 0 ? <li>لا توجد تعيينات بعد.</li> : null}
          </ul>
        </CardContent>
      </Card>

      {canAddTeam ? (
        <Card>
          <CardHeader>
            <CardTitle>إضافة عضو فريق</CardTitle>
            <CardDescription>يُضاف الطالب مباشرة وفق عقد التعيين المباشر.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Label htmlFor="gp-team-student">طالب القسم</Label>
            <select
              id="gp-team-student"
              value={studentId}
              onChange={(event) => setStudentId(event.target.value)}
              className="min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm"
            >
              <option value="">اختر طالباً…</option>
              {(candidates?.students ?? []).map((candidate) => (
                <option key={candidate.profile_id} value={candidate.profile_id}>
                  {candidate.full_name}
                </option>
              ))}
            </select>
            <Button
              type="button"
              disabled={busy || studentId === ""}
              onClick={() => (studentId === "" ? undefined : onAddTeamMember(studentId))}
            >
              إضافة إلى الفريق
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {canAssignFaculty ? (
        <Card>
          <CardHeader>
            <CardTitle>تعيين عضو هيئة تدريس</CardTitle>
            <CardDescription>
              مشرف واحد ومشرف مشارك واحد كحد أقصى لكل مشروع؛ تُفرض القيود في الخلفية.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Label htmlFor="gp-faculty-role">الدور</Label>
            <select
              id="gp-faculty-role"
              value={facultyRole}
              onChange={(event) => setFacultyRole(event.target.value as AssignableFacultyRole)}
              className="min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm"
            >
              {(Object.keys(ASSIGNABLE_ROLE_LABELS) as AssignableFacultyRole[]).map((role) => (
                <option key={role} value={role}>
                  {ASSIGNABLE_ROLE_LABELS[role]}
                </option>
              ))}
            </select>
            <Label htmlFor="gp-faculty-member">عضو هيئة التدريس</Label>
            <select
              id="gp-faculty-member"
              value={facultyId}
              onChange={(event) => setFacultyId(event.target.value)}
              className="min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm"
            >
              <option value="">اختر عضو هيئة تدريس…</option>
              {(candidates?.faculty ?? []).map((candidate) => (
                <option key={candidate.profile_id} value={candidate.profile_id}>
                  {candidate.full_name}
                </option>
              ))}
            </select>
            <Button
              type="button"
              disabled={busy || facultyId === ""}
              onClick={() =>
                facultyId === "" ? undefined : onAssignFaculty(facultyRole, facultyId)
              }
            >
              تعيين
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
