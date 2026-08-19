import { createFileRoute } from "@tanstack/react-router";
import { DemoShell } from "@/components/tender-demo/DemoShell";

export const Route = createFileRoute("/tender-demo")({
  head: () => ({
    meta: [
      { title: "العرض التجريبي للمنظومة الشاملة — جامعة تعز 2026" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: TenderDemoPage,
});

function TenderDemoPage() {
  return <DemoShell />;
}
