import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PROJECT_STATES, type ProjectState } from "../../lib/graduation-projects/domain";
import {
  PROJECT_STATE_LABELS,
  filterProjects,
  type MyProjectRow,
  type ProjectListFilter,
} from "../../lib/graduation-projects/lifecycle";
import { GraduationProjectStateBadge } from "./GraduationProjectStateBadge";

export interface GraduationProjectsListProps {
  projects: MyProjectRow[];
  filter: ProjectListFilter;
  onFilterChange(next: ProjectListFilter): void;
  onSelect(projectId: string): void;
}

export function GraduationProjectsList({ projects, filter, onFilterChange, onSelect }: GraduationProjectsListProps) {
  const rows = filterProjects(projects, filter);
  const stateValue = filter.state ?? "all";
  return (
    <div dir="rtl" className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={stateValue}
          onValueChange={(value: string) => onFilterChange({ ...filter, state: value as ProjectState | "all" })}
        >
          <SelectTrigger className="w-48">
            <SelectValue placeholder="كل الحالات" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الحالات</SelectItem>
            {PROJECT_STATES.map((state) => (
              <SelectItem key={state} value={state}>{PROJECT_STATE_LABELS[state]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant={filter.atRiskOnly ? "destructive" : "outline"}
          onClick={() => onFilterChange({ ...filter, atRiskOnly: !filter.atRiskOnly })}
        >
          المتعثرة فقط
        </Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>العنوان</TableHead>
            <TableHead>الحالة</TableHead>
            <TableHead>التقدم</TableHead>
            <TableHead>النسخة</TableHead>
            <TableHead>أدوارك</TableHead>
            <TableHead className="sr-only">فتح</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.project_id}>
              <TableCell>{row.title}</TableCell>
              <TableCell><GraduationProjectStateBadge state={row.state} atRisk={row.at_risk} /></TableCell>
              <TableCell>{row.progress_percent}%</TableCell>
              <TableCell>{row.version}</TableCell>
              <TableCell>{row.roles.join("، ")}</TableCell>
              <TableCell>
                <Button type="button" variant="outline" size="sm" onClick={() => onSelect(row.project_id)}>
                  فتح
                </Button>
              </TableCell>
            </TableRow>
          ))}
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6}>لا توجد مشاريع مطابقة.</TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
    </div>
  );
}
