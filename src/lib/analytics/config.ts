export type AnalyticsRangeKey = "30d" | "60d" | "90d" | "120d" | "1y" | "3y" | "5y";

export const ANALYTICS_RANGES: Array<{ key: AnalyticsRangeKey; label: string }> = [
  { key: "30d", label: "Last 30 days" },
  { key: "60d", label: "Last 60 days" },
  { key: "90d", label: "Last 90 days" },
  { key: "120d", label: "Last 120 days" },
  { key: "1y", label: "Last Year" },
  { key: "3y", label: "Last 3 Years" },
  { key: "5y", label: "Last 5 Years" }
];
