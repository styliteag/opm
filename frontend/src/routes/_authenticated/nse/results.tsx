import { useState, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Search, ExternalLink, FileSearch } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import { LoadingState } from "@/components/data-display/LoadingState";
import { ErrorState } from "@/components/data-display/ErrorState";
import { EmptyState } from "@/components/data-display/EmptyState";
import { SeverityBadge } from "@/components/data-display/SeverityBadge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Select } from "@/components/ui/select";
import { fetchApi } from "@/lib/api";
import { useDebounce } from "@/hooks/useDebounce";
import type { NseResultListResponse, Severity } from "@/lib/types";

export const Route = createFileRoute("/_authenticated/nse/results")({
  component: NseResultsPage,
});

function NseResultsPage() {
  const [severityFilter, setSeverityFilter] = useState<string>("");
  const [ipSearch, setIpSearch] = useState("");
  const [cveSearch, setCveSearch] = useState("");

  const debouncedIp = useDebounce(ipSearch, 300);
  const debouncedCve = useDebounce(cveSearch, 300);

  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    if (severityFilter) params.set("severity", severityFilter);
    if (debouncedIp) params.set("ip", debouncedIp);
    if (debouncedCve) params.set("cve", debouncedCve);
    return params.toString();
  }, [severityFilter, debouncedIp, debouncedCve]);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["nse", "results", queryParams],
    queryFn: () => {
      const path = queryParams
        ? `/api/nse/results?${queryParams}`
        : "/api/nse/results";
      return fetchApi<NseResultListResponse>(path);
    },
  });

  if (isLoading) return <LoadingState rows={8} />;
  if (error) return <ErrorState message={error.message} onRetry={refetch} />;

  const results = data?.results ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-strong text-foreground">
          NSE Scan Results
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {data?.total ?? 0} vulnerability findings
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value)}
        >
          <option value="">All Severities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="info">Info</option>
        </Select>

        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Filter by IP..."
            value={ipSearch}
            onChange={(e) => setIpSearch(e.target.value)}
            className="w-full rounded-md border border-border bg-background py-1.5 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search CVE..."
            value={cveSearch}
            onChange={(e) => setCveSearch(e.target.value)}
            className="w-full rounded-md border border-border bg-background py-1.5 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      {/* Results Table */}
      {results.length === 0 ? (
        <EmptyState
          title="No results found"
          message="Adjust filters or run an NSE scan to generate results."
          icon={FileSearch}
        />
      ) : (
        <div className="rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Severity</TableHead>
                <TableHead>Script</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>CVE IDs</TableHead>
                <TableHead>Scan Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {results.map((result) => (
                <TableRow key={result.id}>
                  <TableCell>
                    <SeverityBadge severity={result.severity as Severity} />
                  </TableCell>
                  <TableCell className="font-mono text-sm text-primary">
                    {result.script_name}
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {result.ip}:{result.port}
                  </TableCell>
                  <TableCell>
                    {result.cve_ids.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {result.cve_ids.map((cve) => (
                          <a
                            key={cve}
                            href={`https://nvd.nist.gov/vuln/detail/${cve}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded bg-accent px-1.5 py-0.5 text-xs font-mono text-primary hover:underline"
                          >
                            {cve}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">--</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(result.created_at).toLocaleDateString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
