export type AssignmentIdentity = {
  user_id: string;
  profile_id: string;
  profile_kind: "faculty" | "staff";
};

export function assignmentCandidateKey(candidate: { kind: string; profile_id: string }): string {
  return `${candidate.kind}:${candidate.profile_id}`;
}

/** Reject stale/relinked profiles instead of silently choosing another profile. */
export function validateAssignmentIdentity(
  selected: AssignmentIdentity,
  profile: { id: string; user_id: string | null; status: string } | null,
): void {
  if (!profile || profile.status !== "active" || profile.id !== selected.profile_id
      || profile.user_id !== selected.user_id) {
    throw new Error("تغيرت بيانات الحساب المحدد أو أصبح غير نشط. أعد تحميل القائمة واختر الحساب مجدداً.");
  }
}
