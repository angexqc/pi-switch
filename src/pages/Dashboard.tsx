import React, { useContext, useEffect, useMemo, useState } from 'react';
import { Button, Card, Descriptions, Space, Tag, message } from 'antd';
import { ReloadOutlined, RocketOutlined, SwapOutlined } from '@ant-design/icons';
import type { HourlyAgg, StatsSummary, Tool, ToolStatus } from '../../shared/types';
import { ConfigContext } from '../App';
import StatCard from '../components/StatCard';
import { TOOL_COLORS, TOOL_LABELS, fmtTokens, fmtUsd, modelLabel } from '../constants';
import { ToolIcon } from '../components/ToolIcon';
import EChart from '../components/EChart';

const TOOLS: Tool[] = ['pi', 'codex', 'claude', 'opencode'];

export default function Dashboard() {
  const { config, setConfig } = useContext(ConfigContext);
  const [status, setStatus] = useState<ToolStatus[]>([]);
  const [summary, setSummary] = useState<StatsSummary | null>(null);
  const [hourly, setHourly] = useState<HourlyAgg[]>([]);
  const [applying, setApplying] = useState(false);

  const load = () => {
    window.piswitch.getToolStatus().then(setStatus).catch(() => undefined);
    window.piswitch.getStatsSummary().then(setSummary).catch(() => undefined);
    window.piswitch.getHourlyTrend().then(setHourly).catch(() => undefined);
  };

  useEffect(() => {
    load();
    const off = window.piswitch.onStatsChanged(load);
    return off;
  }, []);

  const applyAll = async () => {
    setApplying(true);
    try {
      const results = await window.piswitch.applyBindings();
      const ok = results.filter((r) => r.ok);
      const fail = results.filter((r) => !r.ok);
      if (fail.length) {
        message.warning(`成功 ${ok.length} 项，失败 ${fail.length} 项：${fail.map((f) => `${TOOL_LABELS[f.tool]}: ${f.error}`).join('；')}`);
      } else if (ok.length) {
        message.success(`已应用 ${ok.length} 个工具的配置`);
      } else {
        message.info('没有启用的绑定，请先在「Agent 配置」中设置');
      }
      load();
    } finally {
      setApplying(false);
    }
  };

  const s = summary;

  // 今日每小时用量柱状图（input+output+cacheRead+cacheWrite 总量）
  const hourlyOption = useMemo(() => {
    const data = hourly.map((d) => d.inputTokens + d.outputTokens + d.cacheReadTokens + d.cacheWriteTokens);
    return {
      tooltip: { trigger: 'axis' },
      grid: { left: 48, right: 16, top: 24, bottom: 28 },
      xAxis: {
        type: 'category',
        data: hourly.map((d) => `${String(d.hour).padStart(2, '0')}:00`),
        axisLine: { lineStyle: { color: 'rgba(255,255,255,0.12)' } },
        axisLabel: { color: '#9aa0a6' },
      },
      yAxis: {
        type: 'value',
        axisLabel: { color: '#9aa0a6' },
        splitLine: { lineStyle: { color: 'rgba(255,255,255,0.08)' } },
      },
      series: [
        {
          name: 'Tokens',
          type: 'bar',
          barWidth: '55%',
          data,
          itemStyle: { color: '#0f6feb', borderRadius: [4, 4, 0, 0] },
        },
      ],
    } as never;
  }, [hourly]);

  return (
    <div className="page">
      <div className="page-title">
        <div>
          <div className="title">概览</div>
          <div className="title-desc">各 Agent 绑定状态与用量速览</div>
        </div>
        <Space wrap={false}>
          <Button icon={<ReloadOutlined />} onClick={load}>
            刷新
          </Button>
          <Button type="primary" icon={<SwapOutlined />} loading={applying} onClick={applyAll}>
            一键应用全部
          </Button>
        </Space>
      </div>

      {(() => {
        const i = s?.today.inputTokens ?? 0;
        const o = s?.today.outputTokens ?? 0;
        const cr = s?.today.cacheReadTokens ?? 0;
        const cw = s?.today.cacheWriteTokens ?? 0;
        const total = i + o + cr + cw;
        const cached = cr + cw;
        const rate = total > 0 ? (cached / total) * 100 : 0;
        return (
          <div className="card-grid card-grid-4 mb16">
            <StatCard title="今日费用" value={s ? fmtUsd(s.today.costUsd) : '-'} color="#f5b942" extra={<span className="stat-sub">含缓存计费</span>} />
            <StatCard title="今日请求" value={s ? s.today.requests : '-'} extra={<span className="stat-sub">总请求数</span>} />
            <StatCard
              title="今日 Tokens（含缓存）"
              value={s ? fmtTokens(total) : '-'}
              extra={
                <div className="ps-stat-foot">
                  <span>输入 {s ? fmtTokens(i) : '-'}</span>
                  <span>输出 {s ? fmtTokens(o) : '-'}</span>
                  <span>缓存 {s ? fmtTokens(cached) : '-'}</span>
                </div>
              }
            />
            <StatCard
              title="今日缓存命中率"
              value={s ? `${rate.toFixed(1)}%` : '-'}
              color="#1677ff"
              extra={
                <div className="ps-stat-foot">
                  <span>缓存读 {s ? fmtTokens(cr) : '-'}</span>
                  <span>缓存写 {s ? fmtTokens(cw) : '-'}</span>
                </div>
              }
            />
          </div>
        );
      })()}

      <Card title="今日每小时用量" size="small" style={{ marginBottom: 16 }}>
        <EChart option={hourlyOption} height={220} />
      </Card>

      <div className="card-grid card-grid-2">
        <Card title="Agent 绑定状态" size="small">
          {status.map((st) => {
            const agent = config.agents[st.tool];
            const provider = agent?.providerId ? config.agents[st.tool].providers.find((p) => p.id === agent.providerId) : undefined;
            const modelName = modelLabel(config, st.tool, agent?.providerId || '', agent?.modelId || '');
            return (
              <Descriptions
                key={st.tool}
                size="small"
                column={1}
                style={{ marginBottom: 8 }}
                labelStyle={{ width: 130 }}
                items={[
                  {
                    key: 'tool',
                    label: (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: TOOL_COLORS[st.tool] }}>
                        <ToolIcon tool={st.tool} size={16} />
                        {TOOL_LABELS[st.tool]}
                      </span>
                    ),
                    children: (
                      <Space wrap>
                        {agent?.enabled && provider ? (
                          <Tag color="blue" style={{ maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block' }}>
                            {provider.name} / {modelName}
                          </Tag>
                        ) : (
                          <Tag>未绑定</Tag>
                        )}
                        {st.proxyEnabled && <Tag color="green">代理统计中</Tag>}
                        {!st.exists && <Tag color="orange">配置文件不存在</Tag>}
                      </Space>
                    ),
                  },
                ]}
              />
            );
          })}
        </Card>

        <Card title="用量速览" size="small">
          <Descriptions
            size="small"
            column={1}
            items={[
              { key: 't', label: '本月费用', children: fmtUsd(s?.month.costUsd) },
              { key: 'w', label: '本周费用', children: fmtUsd(s?.week.costUsd) },
              { key: 'm', label: '累计费用', children: fmtUsd(s?.total.costUsd) },
              { key: 'mi', label: '累计输入 tokens', children: s ? fmtTokens(s.total.inputTokens) : '-' },
              { key: 'mo', label: '累计输出 tokens', children: s ? fmtTokens(s.total.outputTokens) : '-' },
              { key: 'mc', label: '累计缓存读 tokens', children: s ? fmtTokens(s.total.cacheReadTokens) : '-' },
              { key: 'r', label: '累计请求数', children: s?.total.requests ?? '-' },
            ]}
          />
          <Space style={{ marginTop: 8 }} wrap>
            {TOOLS.map((t) => (
              <Button key={t} size="small" icon={<RocketOutlined />} onClick={() => window.piswitch.launchTool(t)}>
                启动 {TOOL_LABELS[t]}
              </Button>
            ))}
          </Space>
        </Card>
      </div>
    </div>
  );
}
