import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";
import { Label, Panel } from "./primitives";

interface AnalyticsChartsProps {
  cases: any[];
  documents: any[];
}

export function AnalyticsCharts({ cases, documents }: AnalyticsChartsProps) {
  // ── 1. Document Category Breakdown ─────────────────────────
  const catCounts: Record<string, number> = {};
  documents.forEach((d) => {
    catCounts[d.category] = (catCounts[d.category] || 0) + 1;
  });
  const docData = Object.entries(catCounts).map(([name, value]) => ({
    name,
    value,
  }));

  // ── 2. Case Status Distribution ────────────────────────────
  const statusCounts: Record<string, number> = {
    OPEN: 0,
    UNDER_INVESTIGATION: 0,
    IN_TRIAL: 0,
    CLOSED: 0,
  };
  cases.forEach((c) => {
    statusCounts[c.status] = (statusCounts[c.status] || 0) + 1;
  });
  const caseData = Object.entries(statusCounts).map(([status, count]) => ({
    status: status.replace(/_/g, " "),
    count,
  }));

  // Colors based on Vigil.OS oklch scheme (Primary, Seal, Caution, Secondary/Muted)
  const COLORS = [
    "oklch(0.512 0.155 33)",  // Primary (Oxide Red)
    "oklch(0.47 0.1 155)",    // Seal (Teal Green)
    "oklch(0.6 0.13 62)",     // Caution (Yellow/Orange)
    "oklch(0.49 0.02 262)",   // Muted Slate
    "oklch(0.3 0.09 100)",    // Olive
  ];

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Panel className="p-5">
        <Label className="mb-4 block">Document Category Distribution</Label>
        {docData.length === 0 ? (
          <div className="flex h-[240px] items-center justify-center font-mono text-[11px] text-muted-foreground">
            NO RECORDED DOCUMENTS
          </div>
        ) : (
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={docData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={4}
                  dataKey="value"
                >
                  {docData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: "var(--surface)",
                    borderColor: "var(--border)",
                    borderRadius: "2px",
                    fontFamily: "var(--font-code)",
                    fontSize: "10px",
                  }}
                />
                <Legend
                  verticalAlign="bottom"
                  height={36}
                  iconType="circle"
                  wrapperStyle={{
                    fontFamily: "var(--font-code)",
                    fontSize: "10px",
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </Panel>

      <Panel className="p-5">
        <Label className="mb-4 block">Case Status Overview</Label>
        <div className="h-[240px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={caseData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="2 2" stroke="var(--border)" />
              <XAxis
                dataKey="status"
                stroke="var(--muted-foreground)"
                tick={{ fontFamily: "var(--font-code)", fontSize: 10 }}
              />
              <YAxis
                stroke="var(--muted-foreground)"
                allowDecimals={false}
                tick={{ fontFamily: "var(--font-code)", fontSize: 10 }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "var(--surface)",
                  borderColor: "var(--border)",
                  borderRadius: "2px",
                  fontFamily: "var(--font-code)",
                  fontSize: "10px",
                }}
              />
              <Bar dataKey="count" fill="oklch(0.512 0.155 33)" radius={[2, 2, 0, 0]}>
                {caseData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Panel>
    </div>
  );
}
