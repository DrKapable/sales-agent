"use client";

import { useEffect, useMemo, useState } from "react";

type AnalyticsData = any;

type LinePoint = { period: string; [key: string]: string | number };

type BusinessAnalyticsPanelProps = { onBack?: () => void };

function money(value: number) {
  return `K${Math.round(Number(value || 0)).toLocaleString()}`;
}

function fmtDate(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "";
}

function niceMax(values: number[]) {
  const max = Math.max(0, ...values);
  if (max <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(max));
  return Math.ceil(max / magnitude) * magnitude;
}

function LineChart({ data, valueKey, formatter = (value: number) => String(value), label }: { data: LinePoint[]; valueKey: string; formatter?: (value: number) => string; label: string }) {
  const width = 720;
  const height = 250;
  const pad = { left: 44, right: 18, top: 18, bottom: 42 };
  const values = data.map((row) => Number(row[valueKey] || 0));
  const max = niceMax(values);
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const points = data.map((row, index) => {
    const x = pad.left + (data.length <= 1 ? innerW / 2 : (index / (data.length - 1)) * innerW);
    const y = pad.top + innerH - (Number(row[valueKey] || 0) / max) * innerH;
    return { x, y, row, value: Number(row[valueKey] || 0) };
  });
  const path = points.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  const tickIndexes = data.length <= 6 ? data.map((_, i) => i) : [0, Math.round((data.length - 1) / 3), Math.round(((data.length - 1) * 2) / 3), data.length - 1];

  return <div className="biaChartWrap" role="img" aria-label={label}>
    <svg viewBox={`0 0 ${width} ${height}`} className="biaChartSvg" preserveAspectRatio="xMidYMid meet">
      {[0, .25, .5, .75, 1].map((ratio) => {
        const y = pad.top + innerH * ratio;
        const value = max * (1 - ratio);
        return <g key={ratio}><line x1={pad.left} y1={y} x2={width - pad.right} y2={y} className="biaChartGrid" /><text x={pad.left - 8} y={y + 4} textAnchor="end" className="biaAxisText">{formatter(value)}</text></g>;
      })}
      {path ? <path d={path} fill="none" className="biaLine" vectorEffect="non-scaling-stroke" /> : null}
      {points.map((point, index) => <g key={index}><circle cx={point.x} cy={point.y} r="4.2" className="biaPoint"><title>{`${point.row.period}: ${formatter(point.value)}`}</title></circle></g>)}
      {tickIndexes.map((index) => <text key={index} x={points[index]?.x ?? pad.left} y={height - 13} textAnchor={index === 0 ? "start" : index === data.length - 1 ? "end" : "middle"} className="biaAxisText">{data[index]?.period}</text>)}
    </svg>
  </div>;
}

function VerticalBars({ data, labelKey, valueKey, suffix = "" }: { data: any[]; labelKey: string; valueKey: string; suffix?: string }) {
  const max = Math.max(1, ...data.map((row) => Number(row[valueKey] || 0)));
  return <div className="biaBars" role="img" aria-label="Bar chart">
    {data.map((row) => <div className="biaBarCol" key={String(row[labelKey])} title={`${row[labelKey]}: ${row[valueKey]}${suffix}`}><div className="biaBarValue">{row[valueKey]}{suffix}</div><div className="biaBarTrack"><div className="biaBarFill" style={{ height: `${Math.max(3, (Number(row[valueKey] || 0) / max) * 100)}%` }} /></div><div className="biaBarLabel">{row[labelKey]}</div></div>)}
  </div>;
}

function HorizontalBars({ data, labelKey, valueKey, valueSuffix = "" }: { data: any[]; labelKey: string; valueKey: string; valueSuffix?: string }) {
  const max = Math.max(1, ...data.map((row) => Number(row[valueKey] || 0)));
  return <div className="biaHbars">{data.map((row) => <div className="biaHbar" key={String(row[labelKey])}><div className="biaHbarHead"><span>{row[labelKey]}</span><strong>{row[valueKey]}{valueSuffix}</strong></div><div className="biaHbarTrack"><span style={{ width: `${Math.max(2, (Number(row[valueKey] || 0) / max) * 100)}%` }} /></div></div>)}</div>;
}

function Donut({ data }: { data: Array<{ source: string; count: number }> }) {
  const total = data.reduce((sum, row) => sum + Number(row.count || 0), 0);
  let offset = 0;
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  return <div className="biaDonutLayout">
    <svg viewBox="0 0 140 140" className="biaDonut" role="img" aria-label="Lead source distribution">
      <circle cx="70" cy="70" r={radius} className="biaDonutBase" />
      {data.map((row, index) => {
        const share = total ? row.count / total : 0;
        const dash = share * circumference;
        const currentOffset = offset;
        offset += dash;
        return <circle key={row.source} cx="70" cy="70" r={radius} className={`biaDonutSlice slice${index % 5}`} strokeDasharray={`${dash} ${circumference - dash}`} strokeDashoffset={-currentOffset} transform="rotate(-90 70 70)"><title>{`${row.source}: ${row.count} (${Math.round(share * 100)}%)`}</title></circle>;
      })}
      <text x="70" y="66" textAnchor="middle" className="biaDonutTotal">{total}</text><text x="70" y="83" textAnchor="middle" className="biaDonutLabel">leads</text>
    </svg>
    <div className="biaLegend">{data.map((row, index) => <div key={row.source}><span className={`biaLegendDot slice${index % 5}`} /><span>{row.source}</span><strong>{row.count}</strong></div>)}</div>
  </div>;
}

function SeverityPill({ value }: { value: string }) {
  return <span className={`biaSeverity ${value}`}>{value.toUpperCase()}</span>;
}

export function BusinessAnalyticsPanel({ onBack }: BusinessAnalyticsPanelProps) {
  const [days, setDays] = useState(90);
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [analysis, setAnalysis] = useState("");
  const [analysisBusy, setAnalysisBusy] = useState(false);
  const [question, setQuestion] = useState("");
  const [analysisAt, setAnalysisAt] = useState("");

  async function load(nextDays = days) {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/admin/business/analytics?days=${nextDays}`, { cache: "no-store" });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Unable to load analytics.");
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load analytics.");
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(days); }, [days]);

  async function analyse() {
    setAnalysisBusy(true); setError("");
    try {
      const response = await fetch("/api/admin/business/analytics/insights", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ days, question: question.trim() || undefined }) });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Unable to analyse the charts.");
      setAnalysis(json.analysis || "No analysis was returned.");
      setAnalysisAt(json.generatedAt || new Date().toISOString());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to analyse the charts.");
    } finally { setAnalysisBusy(false); }
  }

  const revenueMax = useMemo(() => Math.max(0, ...(data?.revenueTrend || []).map((row: any) => Number(row.verifiedRevenue || 0))), [data]);

  return <main className="biaShell">
    <div className="biaContainer">
      <header className="biaHeader"><div><button className="biaBack" onClick={onBack}>← Business dashboard</button><div className="biaTitleRow"><h1>Analytics & AI</h1><span>LIVE CRM</span></div><p>Conversion intelligence, time-series trends, operational gaps and AI recommendations from current MedMinds business data.</p></div><div className="biaHeaderActions"><div className="biaRange" aria-label="Analytics period">{[30, 90, 180, 365].map((value) => <button key={value} className={days === value ? "active" : ""} onClick={() => { setAnalysis(""); setDays(value); }}>{value === 365 ? "1 year" : `${value} days`}</button>)}</div><button className="biaRefresh" disabled={loading} onClick={() => void load()}>{loading ? "Refreshing…" : "↻ Refresh"}</button></div></header>

      {error ? <div className="biaError">{error}</div> : null}
      {loading && !data ? <div className="biaLoading">Loading analytics…</div> : null}
      {data ? <>
        <section className="biaMetrics">
          <article><span>Leads in period</span><strong>{data.summary.periodLeads}</strong><small>{data.period.granularity} trend</small></article>
          <article><span>Overall conversion</span><strong>{data.summary.overallConversionRate}%</strong><small>current CRM outcome</small></article>
          <article><span>Hot active leads</span><strong>{data.summary.currentHotLeads}</strong><small>priority conversion pool</small></article>
          <article><span>Verified revenue</span><strong>{money(data.summary.verifiedRevenue)}</strong><small>{data.summary.verifiedPayments} verified payment{data.summary.verifiedPayments === 1 ? "" : "s"}</small></article>
          <article><span>Quoted value</span><strong>{money(data.summary.quotedValue)}</strong><small>{data.summary.quotations} quotation{data.summary.quotations === 1 ? "" : "s"}</small></article>
          <article><span>Average active score</span><strong>{data.summary.averageActiveScore}/100</strong><small>{data.summary.currentActiveLeads} active leads</small></article>
        </section>

        <section className="biaGrid two">
          <article className="biaCard"><div className="biaCardHead"><div><h2>New leads over time</h2><p>Lead acquisition volume across the selected period.</p></div><span className="biaTag">TIME SERIES</span></div><LineChart data={data.leadTrend} valueKey="newLeads" formatter={(value) => String(Math.round(value))} label="New MedMinds leads over time" /></article>
          <article className="biaCard"><div className="biaCardHead"><div><h2>Conversion by acquisition cohort</h2><p>Current conversion rate of leads grouped by when they entered the CRM.</p></div><span className="biaTag">COHORT</span></div><VerticalBars data={data.leadTrend} labelKey="period" valueKey="cohortConversionRate" suffix="%" /></article>
        </section>

        <section className="biaGrid two">
          <article className="biaCard"><div className="biaCardHead"><div><h2>Verified revenue trend</h2><p>Verified payments recorded during the selected period.</p></div><span className="biaTag">FINANCE</span></div><LineChart data={data.revenueTrend} valueKey="verifiedRevenue" formatter={(value) => revenueMax >= 1000 ? `K${Math.round(value / 1000)}k` : `K${Math.round(value)}`} label="Verified MedMinds revenue over time" /></article>
          <article className="biaCard"><div className="biaCardHead"><div><h2>Current pipeline distribution</h2><p>Where all current CRM leads sit today.</p></div><span className="biaTag">FUNNEL</span></div><HorizontalBars data={data.statusDistribution} labelKey="status" valueKey="count" /></article>
        </section>

        <section className="biaGrid two">
          <article className="biaCard"><div className="biaCardHead"><div><h2>Service performance</h2><p>Lead volume and current conversion rate for leads acquired in the selected period.</p></div><span className="biaTag">SERVICE MIX</span></div><div className="biaServiceTable"><div className="biaServiceHeader"><span>Service</span><span>Leads</span><span>Converted</span><span>Rate</span></div>{data.servicePerformance.map((row: any) => <div className="biaServiceRow" key={row.service}><strong>{row.service}</strong><span>{row.leads}</span><span>{row.converted}</span><span className="biaRate">{row.conversionRate}%</span></div>)}{!data.servicePerformance.length ? <div className="biaEmpty">No service data in this period.</div> : null}</div></article>
          <article className="biaCard"><div className="biaCardHead"><div><h2>Lead source mix</h2><p>Where leads captured in the selected period came from.</p></div><span className="biaTag">ACQUISITION</span></div>{data.sourceMix.length ? <Donut data={data.sourceMix} /> : <div className="biaEmpty">No source data in this period.</div>}</article>
        </section>

        <section className="biaGrid two">
          <article className="biaCard"><div className="biaCardHead"><div><h2>Active lead inactivity</h2><p>How long active leads have gone without a new conversation activity.</p></div><span className="biaTag">AGEING</span></div><VerticalBars data={data.inactivityDistribution} labelKey="bucket" valueKey="count" /></article>
          <article className="biaCard"><div className="biaCardHead"><div><h2>Quotation activity</h2><p>Quotation count over the same selected period.</p></div><span className="biaTag">SALES</span></div><LineChart data={data.quoteTrend} valueKey="quotations" formatter={(value) => String(Math.round(value))} label="Quotation count over time" /></article>
        </section>

        <section className="biaCard biaGaps"><div className="biaCardHead"><div><h2>Unconverted lead gaps</h2><p>Operational gaps derived from the current CRM state. Expand a gap to see examples and the recommended response.</p></div><span className="biaTag">ACTIONABLE</span></div><div className="biaGapGrid">{data.gaps.map((gap: any) => <details key={gap.key} className={`biaGap ${gap.severity}`}><summary><div><SeverityPill value={gap.severity} /><strong>{gap.title}</strong><p>{gap.detail}</p></div><span className="biaGapCount">{gap.count}</span></summary><div className="biaGapBody"><h4>Recommended response</h4><p>{gap.recommendation}</p>{gap.sampleLeads?.length ? <><h4>Examples</h4><div className="biaSamples">{gap.sampleLeads.map((lead: any) => <div key={lead.id}><strong>{lead.name || lead.phone}</strong><span>{lead.status} · {lead.service || "Service not established"}</span></div>)}</div></> : <p className="biaMuted">No current examples for this signal.</p>}</div></details>)}</div></section>

        <section className="biaCard biaAi"><div className="biaAiIntro"><div><span className="biaAiIcon">✦</span><div><h2>AI management analysis</h2><p>The agent reads every chart series, pipeline distribution and gap signal before making recommendations.</p></div></div><button disabled={analysisBusy} onClick={() => void analyse()}>{analysisBusy ? "Analysing all charts…" : "Analyse all charts"}</button></div><div className="biaAskRow"><input value={question} onChange={(event: any) => setQuestion(event.target.value)} placeholder="Optional: e.g. Where are we losing the most research-support leads?" /><button disabled={analysisBusy} onClick={() => void analyse()}>Ask AI</button></div>{analysis ? <div className="biaAnalysis"><div className="biaAnalysisHead"><strong>Management brief</strong><span>{fmtDate(analysisAt)}</span></div><div>{analysis}</div></div> : <div className="biaAiEmpty">Run the analysis to generate a grounded management brief from the current charts and gap signals.</div>}</section>

        <section className="biaLimit"><strong>How to interpret these charts</strong>{data.limitations.map((item: string) => <p key={item}>• {item}</p>)}</section>
      </> : null}
    </div>

    <style jsx global>{`
      .biaShell{min-height:100vh;background:linear-gradient(180deg,#f4f8f7 0%,#eef5f3 100%);color:#12313b;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:clamp(12px,2.4vw,30px)}
      .biaContainer{max-width:1440px;margin:0 auto}.biaHeader{display:flex;justify-content:space-between;gap:18px;align-items:flex-end;margin-bottom:18px}.biaBack{border:0;background:transparent;padding:0;color:#087d78;font-weight:800;cursor:pointer}.biaTitleRow{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:7px}.biaTitleRow h1{font-size:clamp(26px,3vw,38px);margin:0;letter-spacing:-.04em}.biaTitleRow span,.biaTag{font-size:10px;font-weight:900;letter-spacing:.07em;padding:5px 8px;border-radius:999px;background:#e7f7f1;color:#13765d}.biaHeader p{margin:6px 0 0;color:#61736f;max-width:760px}.biaHeaderActions{display:flex;gap:9px;align-items:center;flex-wrap:wrap;justify-content:flex-end}.biaRange{display:flex;gap:4px;padding:4px;background:#e9f0ee;border-radius:12px}.biaRange button,.biaRefresh{min-height:40px;border:1px solid transparent;border-radius:9px;background:transparent;color:#48615b;font-weight:800;padding:8px 11px;cursor:pointer}.biaRange button.active{background:#fff;color:#087d78;box-shadow:0 3px 10px rgba(18,49,59,.09)}.biaRefresh{background:#fff;border-color:#cfddd9;color:#12313b}.biaError{background:#fff0f0;color:#9d2c2c;border:1px solid #efcccc;padding:12px 14px;border-radius:12px;margin-bottom:12px}.biaLoading,.biaEmpty,.biaAiEmpty{padding:30px;text-align:center;color:#71827e}
      .biaMetrics{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px;margin-bottom:14px}.biaMetrics article,.biaCard{background:rgba(255,255,255,.97);border:1px solid #d9e5e1;border-radius:18px;box-shadow:0 10px 30px rgba(18,49,59,.055)}.biaMetrics article{padding:15px;min-width:0}.biaMetrics span{display:block;color:#61736f;font-size:11px;font-weight:850;text-transform:uppercase;letter-spacing:.06em}.biaMetrics strong{display:block;font-size:clamp(22px,2.1vw,31px);letter-spacing:-.04em;margin:8px 0 3px}.biaMetrics small{color:#71827e}.biaGrid{display:grid;gap:14px;margin-bottom:14px}.biaGrid.two{grid-template-columns:repeat(2,minmax(0,1fr))}.biaCard{padding:clamp(15px,2vw,20px);min-width:0}.biaCardHead{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:12px}.biaCardHead h2{font-size:17px;margin:0}.biaCardHead p{font-size:12.5px;line-height:1.45;color:#71827e;margin:4px 0 0}.biaTag{white-space:nowrap;background:#eef5f3;color:#5a746d}
      .biaChartWrap{width:100%;overflow:hidden}.biaChartSvg{width:100%;height:auto;aspect-ratio:720/250;display:block}.biaChartGrid{stroke:#e9efed;stroke-width:1}.biaLine{stroke:#087d78;stroke-width:3}.biaPoint{fill:#fff;stroke:#087d78;stroke-width:3}.biaAxisText{font-size:10.5px;fill:#738680}.biaBars{height:230px;display:flex;align-items:flex-end;gap:7px;padding:12px 3px 0;overflow-x:auto}.biaBarCol{min-width:34px;flex:1;display:grid;grid-template-rows:20px 1fr 36px;gap:4px;text-align:center}.biaBarValue{font-size:10px;color:#526762;font-weight:800}.biaBarTrack{height:156px;border-radius:8px 8px 3px 3px;background:#edf3f1;display:flex;align-items:flex-end;overflow:hidden}.biaBarFill{width:100%;background:linear-gradient(180deg,#2aa99b,#087d78);border-radius:7px 7px 2px 2px;min-height:3px}.biaBarLabel{font-size:9.5px;color:#71827e;line-height:1.2;overflow:hidden}.biaHbars{display:grid;gap:11px}.biaHbarHead{display:flex;justify-content:space-between;gap:10px;font-size:12px}.biaHbarHead span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.biaHbarTrack{height:8px;background:#edf3f1;border-radius:999px;overflow:hidden;margin-top:5px}.biaHbarTrack span{display:block;height:100%;background:linear-gradient(90deg,#31b5a5,#087d78);border-radius:999px}
      .biaDonutLayout{display:grid;grid-template-columns:180px 1fr;gap:18px;align-items:center}.biaDonut{width:170px;height:170px}.biaDonutBase,.biaDonutSlice{fill:none;stroke-width:17}.biaDonutBase{stroke:#edf3f1}.biaDonutSlice{stroke-linecap:butt}.biaDonutSlice.slice0,.biaLegendDot.slice0{stroke:#087d78;background:#087d78}.biaDonutSlice.slice1,.biaLegendDot.slice1{stroke:#2aa99b;background:#2aa99b}.biaDonutSlice.slice2,.biaLegendDot.slice2{stroke:#6b8f87;background:#6b8f87}.biaDonutSlice.slice3,.biaLegendDot.slice3{stroke:#c9a45f;background:#c9a45f}.biaDonutSlice.slice4,.biaLegendDot.slice4{stroke:#7f7aa8;background:#7f7aa8}.biaDonutTotal{font-size:22px;font-weight:900;fill:#12313b}.biaDonutLabel{font-size:10px;fill:#71827e}.biaLegend{display:grid;gap:8px}.biaLegend>div{display:grid;grid-template-columns:10px 1fr auto;gap:8px;align-items:center;font-size:12px}.biaLegendDot{width:8px;height:8px;border-radius:999px}.biaLegend strong{font-size:12px}
      .biaServiceTable{display:grid}.biaServiceHeader,.biaServiceRow{display:grid;grid-template-columns:minmax(0,1fr) 64px 76px 58px;gap:8px;align-items:center;padding:9px 0;border-top:1px solid #edf2f0;font-size:12px}.biaServiceHeader{color:#71827e;text-transform:uppercase;font-size:9.5px;font-weight:850;letter-spacing:.05em;border-top:0}.biaServiceRow strong{overflow:hidden;text-overflow:ellipsis}.biaRate{font-weight:900;color:#087d78}
      .biaGaps{margin-bottom:14px}.biaGapGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.biaGap{border:1px solid #dbe6e3;border-radius:14px;background:#fbfdfc;overflow:hidden}.biaGap.high{border-color:#efcdcd}.biaGap.medium{border-color:#eadfbf}.biaGap summary{list-style:none;display:flex;justify-content:space-between;gap:12px;padding:13px;cursor:pointer}.biaGap summary::-webkit-details-marker{display:none}.biaGap summary strong{display:block;margin:6px 0 3px}.biaGap summary p{font-size:12px;color:#71827e;line-height:1.45;margin:0}.biaSeverity{font-size:9px;font-weight:900;letter-spacing:.07em;border-radius:999px;padding:4px 7px;background:#edf2f1;color:#61736f}.biaSeverity.high{background:#feeaea;color:#a13c3c}.biaSeverity.medium{background:#fff5dc;color:#8a6419}.biaGapCount{font-size:28px;font-weight:900;letter-spacing:-.04em}.biaGapBody{padding:0 13px 13px;border-top:1px solid #edf2f0}.biaGapBody h4{font-size:11px;text-transform:uppercase;letter-spacing:.06em;margin:12px 0 4px;color:#61736f}.biaGapBody p{font-size:12.5px;line-height:1.5;margin:0}.biaSamples{display:grid;gap:6px}.biaSamples>div{display:flex;justify-content:space-between;gap:10px;padding:7px 8px;background:#f1f6f4;border-radius:8px;font-size:11px}.biaSamples span{color:#71827e;text-align:right}.biaMuted{color:#71827e}
      .biaAi{margin-bottom:14px;background:linear-gradient(135deg,#fff 0%,#f0f9f6 100%)}.biaAiIntro{display:flex;justify-content:space-between;gap:14px;align-items:center}.biaAiIntro>div{display:flex;gap:12px;align-items:center}.biaAiIcon{width:42px;height:42px;border-radius:13px;display:grid;place-items:center;background:#123f4d;color:#fff;font-size:20px}.biaAi h2{margin:0;font-size:18px}.biaAi p{margin:4px 0 0;color:#61736f;font-size:12.5px}.biaAi button{border:0;background:#087d78;color:#fff;border-radius:11px;min-height:42px;padding:9px 14px;font-weight:850;cursor:pointer}.biaAskRow{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;margin-top:14px}.biaAskRow input{min-height:44px;border:1px solid #cbd9d5;border-radius:11px;padding:9px 11px;font:inherit;color:#12313b;background:#fff}.biaAnalysis{margin-top:14px;background:#fff;border:1px solid #d6e8e3;border-radius:14px;padding:15px;white-space:pre-wrap;line-height:1.6;font-size:13px}.biaAnalysisHead{display:flex;justify-content:space-between;gap:10px;margin-bottom:10px;color:#61736f}.biaAnalysisHead strong{color:#12313b}.biaLimit{background:#e9f2ef;border-radius:14px;padding:13px 15px;color:#58706a;font-size:11.5px;line-height:1.5}.biaLimit strong{color:#12313b}.biaLimit p{margin:5px 0 0}
      @media(max-width:1100px){.biaMetrics{grid-template-columns:repeat(3,minmax(0,1fr))}.biaGrid.two{grid-template-columns:1fr}.biaGapGrid{grid-template-columns:1fr}.biaDonutLayout{grid-template-columns:160px 1fr}}
      @media(max-width:720px){.biaShell{padding:9px}.biaHeader{align-items:flex-start;flex-direction:column}.biaHeaderActions{width:100%;justify-content:space-between}.biaRange{overflow-x:auto}.biaMetrics{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;padding-bottom:4px}.biaMetrics article{flex:0 0 72vw;scroll-snap-align:start}.biaCard{border-radius:15px;padding:14px}.biaChartSvg{height:auto}.biaDonutLayout{grid-template-columns:1fr}.biaDonut{margin:auto}.biaLegend{max-width:360px;margin:auto;width:100%}.biaServiceHeader,.biaServiceRow{grid-template-columns:minmax(130px,1fr) 48px 58px 48px}.biaAiIntro{align-items:flex-start;flex-direction:column}.biaAiIntro button{width:100%}.biaAskRow{grid-template-columns:1fr}.biaAskRow button{width:100%}.biaSamples>div{flex-direction:column}.biaSamples span{text-align:left}.biaBars{height:210px}.biaBarTrack{height:138px}}
      @media(max-width:420px){.biaMetrics article{flex-basis:82vw}.biaTitleRow h1{font-size:28px}.biaRange button{padding:8px 9px}.biaServiceHeader,.biaServiceRow{grid-template-columns:minmax(115px,1fr) 42px 48px 44px;font-size:10.5px}.biaTag{display:none}}
      @media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}
    `}</style>
  </main>;
}
