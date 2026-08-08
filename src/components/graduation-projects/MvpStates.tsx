import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export function MvpLoading({ label = "جارٍ تحميل مشاريع التخرج…" }: { label?: string }) {
  return (
    <div
      dir="rtl"
      role="status"
      className="flex min-h-48 items-center justify-center gap-2 text-muted-foreground"
    >
      <Loader2 className="h-5 w-5 animate-spin" />
      {label}
    </div>
  );
}
export function MvpError({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <Card dir="rtl" role="alert" className="border-destructive/40">
      <CardContent className="flex flex-wrap items-center gap-3 pt-6">
        <AlertCircle className="h-5 w-5 text-destructive" />
        <p className="flex-1">{message}</p>
        {retry ? (
          <Button variant="outline" onClick={retry}>
            إعادة المحاولة
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
export function MvpEmpty({ message }: { message: string }) {
  return (
    <Card dir="rtl">
      <CardContent className="py-12 text-center text-muted-foreground">{message}</CardContent>
    </Card>
  );
}
export function MvpSuccess({ message }: { message: string }) {
  return (
    <div
      dir="rtl"
      role="status"
      className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900"
    >
      <CheckCircle2 className="h-4 w-4" />
      {message}
    </div>
  );
}
