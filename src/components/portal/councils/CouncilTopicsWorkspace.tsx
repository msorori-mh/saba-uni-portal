import { FilePlus2 } from "lucide-react";
import type { MyCouncilTopicItem } from "@/lib/faculty-councils.functions";
import { CouncilTopicCard } from "./CouncilTopicCard";
import { CompactEmpty, ErrorBlock, LoadingBlock } from "./shared";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function CouncilTopicsWorkspace({
  mySubmittedTopics,
  councilVisibleTopics,
  isLoading,
  isError,
}: {
  mySubmittedTopics: MyCouncilTopicItem[];
  councilVisibleTopics: MyCouncilTopicItem[];
  isLoading: boolean;
  isError: boolean;
}) {
  return (
    <div data-testid="councils-topics-workspace" className="space-y-3">
      <Tabs defaultValue="mine" dir="rtl">
        <TabsList className="w-full sm:w-auto h-auto flex flex-wrap justify-start gap-1">
          <TabsTrigger value="mine" className="min-h-9 text-xs sm:text-sm gap-1.5">
            <FilePlus2 className="h-3.5 w-3.5" aria-hidden />
            موضوعاتي ({mySubmittedTopics.length})
          </TabsTrigger>
          <TabsTrigger value="council" className="min-h-9 text-xs sm:text-sm">
            موضوعات المجلس ({councilVisibleTopics.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="mine" className="mt-3">
          {isLoading ? (
            <LoadingBlock />
          ) : isError ? (
            <ErrorBlock message="تعذّر تحميل مواضيعك." />
          ) : mySubmittedTopics.length === 0 ? (
            <CompactEmpty
              text="لم تقدم أي موضوعات بعد."
              testId="councils-topics-mine-empty"
            />
          ) : (
            <ul className="space-y-3">
              {mySubmittedTopics.map((t) => (
                <CouncilTopicCard key={t.topic_id} topic={t} showDescription />
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="council" className="mt-3">
          {isLoading ? (
            <LoadingBlock />
          ) : isError ? (
            <ErrorBlock message="تعذّر تحميل موضوعات المجلس." />
          ) : councilVisibleTopics.length === 0 ? (
            <CompactEmpty
              text="لا توجد موضوعات أخرى مرئية في مجالسك حالياً."
              testId="councils-topics-council-empty"
            />
          ) : (
            <ul className="space-y-3">
              {councilVisibleTopics.map((t) => (
                <CouncilTopicCard key={t.topic_id} topic={t} showDescription={false} />
              ))}
            </ul>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
