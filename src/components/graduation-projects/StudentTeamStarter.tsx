import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { MvpError } from "@/components/graduation-projects/MvpStates";
import { createOwnTeam } from "@/lib/graduation-projects/head-workflow";

/**
 * Shown to a level-4 student who has no graduation project yet: start a team
 * as its leader. Eligibility is enforced by the RPC, not by this button.
 */
export function StudentTeamStarter({ onCreated }: { onCreated: (projectId: string) => void }) {
  const queryClient = useQueryClient();
  const create = useMutation({
    mutationFn: createOwnTeam,
    onSuccess: async (projectId) => {
      await queryClient.invalidateQueries({ queryKey: ["graduation-projects"] });
      onCreated(projectId);
    },
  });

  return (
    <Card dir="rtl" data-testid="gp-student-team-starter">
      <CardContent className="space-y-3 py-8 text-center">
        <p className="font-bold text-primary">ليس لديك فريق مشروع تخرج بعد</p>
        <p className="text-sm text-muted-foreground">
          أنشئ الفريق لتكون قائده، ثم أضف زملاءك من برنامجك وأرسل الفريق إلى رئيس القسم
          لاعتماده وإسناد المشرف. إن كان زميلك قد أنشأ الفريق فانتظر أن يضيفك.
        </p>
        <Button disabled={create.isPending} onClick={() => create.mutate()}>
          {create.isPending ? "جارٍ إنشاء الفريق…" : "إنشاء فريق مشروع التخرج"}
        </Button>
        {create.error ? <MvpError message={create.error.message} /> : null}
      </CardContent>
    </Card>
  );
}
