import { ResponsiveContainer, AreaChart, Area } from "recharts";

import type { HostRiskTrendPoint } from "@/lib/types";

interface RiskSparklineProps {
  points: HostRiskTrendPoint[];
}

export function RiskSparkline({ points }: RiskSparklineProps) {
  if (points.length === 0) return null;

  const hasVariation = points.some((p) => p.score !== points[0].score);
  if (!hasVariation) return null;

  return (
    <div className="h-8 w-20">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points}>
          <defs>
            <linearGradient id="riskGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ef4444" stopOpacity={0.4} />
              <stop offset="100%" stopColor="#ef4444" stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="score"
            stroke="#ef4444"
            fill="url(#riskGrad)"
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
