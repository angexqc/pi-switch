import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Card, DatePicker, Segmented, Select, Space, Table, Tag, message } from 'antd';
import { DownloadOutlined, ReloadOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { DailyAgg, HourlyAgg, StatsQuery, StatsRange, StatsSummary, UsageRecord } from '../../shared/types';
import StatCard from '../components/StatCard';
import EChart from '../components/EChart';
import { SOURCE_LABELS, STATUS_LABELS, TOOL_COLORS, TOOL_LABELS, fmtTime, fmtTokens, fmtUsd } from '../constants';

const { RangePicker } = DatePicker;

/** 中转站通用时间范围 */
const RANGES: { key: StatsRange; label: string; days: number }[] = [
  { key: 'today', label: '今日', days: 1 },
  { key: '7d', label: '近7天', days: 7 },
  { key: '30d', label: '近30天', days: 30 },
  { key: 'all', label: '全部', days: 30 },
];

// 深色主题下的图表配色（中转站风格：消费蓝 / 请求绿 / 金额红）
const AXIS = '#9aa0a6';
const SPLIT = 'rgba(255,255,255,0.08)';
const COLOR_COST = '#40a9ff';
const COLOR_REQ = '#73d13d';

const baseAxis = {
  axisLine: { lineStyle: { color: SPLIT } },
  axisLabel: { color: AXIS },
  splitLine: { lineStyle: { color: SPLIT } },
};

export default function Stats() {
  const [range, setRange] = useState<StatsRange>('30d');
  const [summary, setSummary] = useState<StatsSummary | null>(null);
  const [trend, setTrend] = useState<DailyAgg[] | HourlyAgg[]>([]);
  const [records, setRecords] = useState<UsageRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState<StatsQuery>({ tool: 'all', source: 'all', limit: 200, offset: 0 });
  const [refreshing, setRefreshing] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const days = RANGES.find((r) => r.key === range)?.days ?? 30;
      const [s, t, p] = await Promise.all([
        window.piswitch.getStatsSummary(range),
        range === 'today' ? window.piswitch.getHourlyTrend() : window.piswitch.getDailyTrend(days),
        window.piswitch.getStatsPage(query),
      ]);
      setSummary(s);
      setTrend(t);
      setRecords(p.records);
      setTotal(p.total);
    } finally {
      setLoading(false);
    }
  }, [range, query]);
  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // 自动更新：主进程每 3 分钟增量扫描日志并推送事件，此处自动刷新看板
  useEffect(() => {
    const off = window.piswitch.onStatsChanged(() => loadAll());
    return off;
  }, [loadAll]);

  const refresh = async () => {
    setRefreshing(true);
    try {
      const r = await window.piswitch.refreshStats();
      const withError = r.sources.filter((x) => x.error);
      const inserted = r.sources.reduce((a, x) => a + x.inserted, 0);
      message.success(`扫描完成，新增 ${inserted} 条记录`);
      if (withError.length) {
        message.warning(withError.map((x) => `${SOURCE_LABELS[x.source]}: ${x.error}`).join('；'));
      }
      await loadAll();
    } finally {
      setRefreshing(false);
    }
  };

  const exportCsv = async () => {
    const r = await window.piswitch.exportCsv(query);
    await window.piswitch.openPath(r.path);
    message.success(`已导出: ${r.path}`);
  };

  /** 范围对应的汇总卡数据（今日→today，近7天→week，近30天→month，全部→total） */
  const cards = useMemo(() => {
    const map: Record<StatsRange, DailyAgg | undefined> = {
      today: summary?.today,
      '7d': summary?.week,
      '30d': summary?.month,
      all: summary?.total,
    };
    return map[range];
  }, [summary, range]);

  const rangeText = useMemo(() => {
    if (range === 'today') return '今日';
    if (range === 'all') return '全部';
    return `近${RANGES.find((r) => r.key === range)?.label ?? ''}`;
  }, [range]);

  /** 趋势图 X 轴标签：今日按小时（08:00），其余按日期（MM-DD） */
  const trendLabels = useMemo(() => {
    if (range === 'today') {
      return (trend as HourlyAgg[]).map((d) => `${String(d.hour).padStart(2, '0')}:00`);
    }
    return (trend as DailyAgg[]).map((d) => d.day.slice(5));
  }, [trend, range]);

  const trendOption = useMemo(() => {
    return {
      tooltip: { trigger: 'axis' },
      grid: { left: 56, right: 20, top: 36, bottom: 28 },
      xAxis: { type: 'category', data: trendLabels, axisLine: { lineStyle: { color: SPLIT } }, axisLabel: { color: AXIS } },
      yAxis: { type: 'value', ...baseAxis },
      series: [
        {
          name: '消费 ($)',
          type: 'line',
          smooth: true,
          symbolSize: 5,
          data: trend.map((d) => Number(d.costUsd.toFixed(4))),
          itemStyle: { color: COLOR_COST },
          lineStyle: { width: 2.5 },
          areaStyle: { color: 'rgba(64,169,255,0.18)' },
        },
      ],
    } as never;
  }, [trend, trendLabels]);

  const requestOption = useMemo(() => {
    return {
      tooltip: { trigger: 'axis' },
      grid: { left: 56, right: 20, top: 36, bottom: 28 },
      xAxis: { type: 'category', data: trendLabels, axisLine: { lineStyle: { color: SPLIT } }, axisLabel: { color: AXIS } },
      yAxis: { type: 'value', ...baseAxis },
      series: [
        {
          name: '请求数',
          type: 'line',
          smooth: true,
          symbolSize: 5,
          data: trend.map((d) => d.requests),
          itemStyle: { color: COLOR_REQ },
          lineStyle: { width: 2.5 },
          areaStyle: { color: 'rgba(115,209,61,0.15)' },
        },
      ],
    } as never;
  }, [trend, trendLabels]);

  /** 模型消费排行（横向条形 Top10，金额大的在上） */
  const modelRankOption = useMemo(() => {
    const top = [...(summary?.byModel || [])].sort((a, b) => b.costUsd - a.costUsd).slice(0, 10).reverse();
    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: (p: unknown) => {
        const arr = p as { name: string; value: number }[];
        return arr.map((x) => `${x.name}: $${x.value.toFixed(4)}`).join('<br/>');
      } },
      grid: { left: 12, right: 60, top: 10, bottom: 24, containLabel: true },
      xAxis: { type: 'value', ...baseAxis },
      yAxis: {
        type: 'category',
        data: top.map((x) => x.label),
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: AXIS, width: 120, overflow: 'truncate' },
      },
      series: [
        {
          type: 'bar',
          barWidth: 14,
          data: top.map((x) => Number(x.costUsd.toFixed(4))),
          itemStyle: { color: COLOR_COST, borderRadius: [0, 7, 7, 0] },
          label: { show: true, position: 'right', color: AXIS, formatter: (p: { value: number }) => `$${p.value.toFixed(2)}` },
        },
      ],
    } as never;
  }, [summary]);

  /** 工具消费分布（环形） */
  const toolPieOption = useMemo(() => {
    const data = (summary?.byTool || [])
      .filter((x) => x.costUsd > 0)
      .map((x) => ({ name: x.label, value: Number(x.costUsd.toFixed(4)) }));
    const colors = Object.values(TOOL_COLORS);
    return {
      tooltip: { trigger: 'item', formatter: '{b}: ${c}' },
      legend: { bottom: 0, textStyle: { color: AXIS }, itemWidth: 12, itemHeight: 8 },
      series: [
        {
          type: 'pie',
          radius: ['42%', '68%'],
          center: ['50%', '44%'],
          data,
          color: colors,
          label: { show: false },
          emphasis: { label: { show: true, fontWeight: 'bold', color: '#fff' } },
        },
      ],
    } as never;
  }, [summary]);

  /** 明细表的模型筛选项（当前范围内的模型去重） */
  const modelOptions = useMemo(() => {
    const seen = new Set<string>();
    const out: { value: string; label: string }[] = [];
    for (const m of summary?.byModel || []) {
      if (!seen.has(m.label)) {
        seen.add(m.label);
        out.push({ value: m.label, label: m.label });
      }
    }
    return out.sort((a, b) => a.label.localeCompare(b.label));
  }, [summary]);

  const columns: ColumnsType<UsageRecord> = [
    {
      title: '时间',
      dataIndex: 'ts',
      width: 150,
      sorter: (a, b) => a.ts - b.ts,
      render: (v: number) => fmtTime(v),
    },
    {
      title: '来源',
      dataIndex: 'source',
      width: 130,
      render: (v: string) => <Tag>{SOURCE_LABELS[v] || v}</Tag>,
    },
    {
      title: '工具',
      dataIndex: 'tool',
      width: 110,
      render: (v: string) => TOOL_LABELS[v as keyof typeof TOOL_LABELS] || v,
    },
    { title: '模型', dataIndex: 'model', ellipsis: true },
    {
      title: '输入',
      dataIndex: 'inputTokens',
      width: 90,
      align: 'right' as const,
      sorter: (a, b) => a.inputTokens - b.inputTokens,
      render: (v: number) => fmtTokens(v),
    },
    {
      title: '输出',
      dataIndex: 'outputTokens',
      width: 90,
      align: 'right' as const,
      sorter: (a, b) => a.outputTokens - b.outputTokens,
      render: (v: number) => fmtTokens(v),
    },
    {
      title: '缓存读',
      dataIndex: 'cacheReadTokens',
      width: 90,
      align: 'right' as const,
      render: (v: number) => fmtTokens(v),
    },
    {
      title: '缓存写',
      dataIndex: 'cacheWriteTokens',
      width: 90,
      align: 'right' as const,
      render: (v: number) => fmtTokens(v),
    },
    {
      title: '费用',
      dataIndex: 'costUsd',
      width: 100,
      align: 'right' as const,
      sorter: (a, b) => (a.costUsd ?? 0) - (b.costUsd ?? 0),
      render: (v?: number) => fmtUsd(v),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 90,
      render: (v: string) => (
        <Tag color={v === 'ok' ? 'green' : v === 'no-usage' ? 'orange' : 'red'}>{STATUS_LABELS[v] || v}</Tag>
      ),
    },
  ];

  return (
    <div className="page">
      <div className="page-title">
        <span>用量统计</span>
        <Space>
          <Segmented
            value={range}
            onChange={(v) => setRange(v as StatsRange)}
            options={RANGES.map((r) => ({ value: r.key, label: r.label }))}
          />
          <Button icon={<ReloadOutlined />} loading={refreshing} onClick={refresh}>
            扫描日志
          </Button>
          <Button icon={<DownloadOutlined />} onClick={exportCsv}>
            导出 CSV
          </Button>
        </Space>
      </div>

      {/* 统计卡：随时间范围联动（Tokens 含缓存，底部展示实际/缓存/命中率） */}
      {(() => {
        const i = cards?.inputTokens ?? 0;
        const o = cards?.outputTokens ?? 0;
        const cr = cards?.cacheReadTokens ?? 0;
        const cw = cards?.cacheWriteTokens ?? 0;
        const total = i + o + cr + cw;
        const cached = cr + cw;
        const rate = total > 0 ? (cached / total) * 100 : 0;
        return (
          <div className="card-grid card-grid-4 mb16">
            <StatCard title="消费金额" value={cards ? fmtUsd(cards.costUsd) : '-'} color="#ff4d4f" extra={<span className="stat-sub">{rangeText}累计</span>} />
            <StatCard title="请求次数" value={cards?.requests ?? '-'} extra={<span className="stat-sub">{rangeText}总请求</span>} />
            <StatCard
              title="Tokens（含缓存）"
              value={cards ? fmtTokens(total) : '-'}
              extra={
                <div className="ps-stat-foot">
                  <span>输入 {cards ? fmtTokens(i) : '-'}</span>
                  <span>输出 {cards ? fmtTokens(o) : '-'}</span>
                  <span>缓存 {cards ? fmtTokens(cached) : '-'}</span>
                </div>
              }
            />
            <StatCard
              title="缓存命中率"
              value={cards ? `${rate.toFixed(1)}%` : '-'}
              color="#1677ff"
              extra={
                <div className="ps-stat-foot">
                  <span>缓存读 {cards ? fmtTokens(cr) : '-'}</span>
                  <span>缓存写 {cards ? fmtTokens(cw) : '-'}</span>
                </div>
              }
            />
          </div>
        );
      })()}

      {/* 趋势图：消费 + 请求 */}
      <div className="card-grid card-grid-2 mb16">
        <Card title="消费趋势" size="small">
          <EChart option={trendOption} height={280} />
        </Card>
        <Card title="请求趋势" size="small">
          <EChart option={requestOption} height={280} />
        </Card>
      </div>

      {/* 排行：模型消费 Top10 + 工具分布 */}
      <div className="card-grid card-grid-2 mb16">
        <Card title="模型消费排行（Top 10）" size="small">
          <EChart option={modelRankOption} height={300} />
        </Card>
        <Card title="工具消费分布" size="small">
          <EChart option={toolPieOption} height={300} />
        </Card>
      </div>

      {/* 明细 */}
      <Card
        title="请求明细"
        size="small"
        extra={
          <Space wrap>
            <Select
              style={{ width: 140 }}
              value={query.tool}
              options={[
                { value: 'all', label: '全部工具' },
                ...Object.entries(TOOL_LABELS).map(([v, l]) => ({ value: v, label: l })),
              ]}
              onChange={(v) => setQuery({ ...query, tool: v, offset: 0 })}
            />
            <Select
              style={{ width: 180 }}
              value={query.model || 'all'}
              options={[{ value: 'all', label: '全部模型' }, ...modelOptions]}
              onChange={(v) => setQuery({ ...query, model: v === 'all' ? undefined : v, offset: 0 })}
            />
            <Select
              style={{ width: 150 }}
              value={query.source}
              options={[
                { value: 'all', label: '全部来源' },
                ...Object.entries(SOURCE_LABELS).map(([v, l]) => ({ value: v, label: l })),
              ]}
              onChange={(v) => setQuery({ ...query, source: v, offset: 0 })}
            />
            <RangePicker
              onChange={(v) =>
                setQuery({
                  ...query,
                  from: v?.[0] ? v[0].startOf('day').valueOf() : undefined,
                  to: v?.[1] ? v[1].endOf('day').valueOf() : undefined,
                  offset: 0,
                })
              }
            />
          </Space>
        }
      >
        <Table
          scroll={{ x: 1080 }}
          rowKey="id"
          size="small"
          loading={loading}
          dataSource={records}
          columns={columns}
          pagination={{
            current: (query.offset ?? 0) / (query.limit ?? 200) + 1,
            pageSize: query.limit ?? 200,
            total,
            showSizeChanger: false,
            onChange: (page) => setQuery({ ...query, offset: (page - 1) * (query.limit ?? 200) }),
          }}
        />
      </Card>
    </div>
  );
}
