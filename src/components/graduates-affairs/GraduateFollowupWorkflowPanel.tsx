import { GraduateFollowupWorkflowPanelController } from "@/lib/graduates-affairs/GraduateFollowupWorkflowPanel.controller";

/**
 * RTL presentation boundary for the Graduates Affairs workflow administration.
 * Data fetching and server mutations stay in the controller layer so display
 * components remain transport-agnostic and reusable.
 */
export function GraduateFollowupWorkflowPanel() {
  return (
    <div dir="rtl" className="space-y-6">
      <GraduateFollowupWorkflowPanelController />
    </div>
  );
}
