import React, { useContext, useEffect, useState } from 'react';
import {
  Button,
  Collapse,
  Empty,
  Input,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  Typography,
  message,
  Descriptions,
  Modal,
} from 'antd';
import {
  CodeOutlined,
  DeleteOutlined,
  EditOutlined,
  FolderOpenOutlined,
  PlusOutlined,
  ReloadOutlined,
  RocketOutlined,
  SaveOutlined,
  SwapOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import type { Profile, Provider, RawConfigFile, Tool, ToolStatus } from '../../shared/types';
import { ConfigContext } from '../App';
import ProviderModal from '../components/ProviderModal';
import { ToolIcon } from '../components/ToolIcon';
import { API_LABELS, CODE_REASONING_EFFORTS, TOOL_COLORS, TOOL_LABELS, maskKey, providerById, providerColor } from '../constants';

const TOOLS: Tool[] = ['pi', 'codex', 'claude', 'opencode'];

export default function Agents() {
  const { config, setConfig } = useContext(ConfigContext);
  const [active, setActive] = useState<Tool>('pi');
  const [profileName, setProfileName] = useState('');
  const [profileTarget, setProfileTarget] = useState<string | undefined>();
  const [applyingProfile, setApplyingProfile] = useState(false);

  return (
    <div className="page ps-page-fixed">
      <div className="page-title">
        <div>
          <div className="title">Agent 配置</div>
        </div>
        <Space wrap={false}>
          <Input
            placeholder="Profile 名称"
            style={{ width: 160 }}
            value={profileName}
            onChange={(e) => setProfileName(e.target.value)}
            onPressEnter={async () => {
              if (!profileName.trim()) {
                message.warning('请输入 Profile 名称');
                return;
              }
              const cfg = await window.piswitch.saveProfile(profileName.trim());
              setConfig(cfg);
              setProfileName('');
              message.success('Profile 已保存');
            }}
          />
          <Button
            icon={<SaveOutlined />}
            onClick={async () => {
              if (!profileName.trim()) {
                message.warning('请输入 Profile 名称');
                return;
              }
              const cfg = await window.piswitch.saveProfile(profileName.trim());
              setConfig(cfg);
              setProfileName('');
              message.success('Profile 已保存');
            }}
          >
            保存当前绑定
          </Button>
          <Select
            style={{ width: 180 }}
            placeholder="选择 Profile 应用"
            value={profileTarget}
            onChange={setProfileTarget}
            options={config.profiles.map((p) => ({ value: p.id, label: p.name }))}
            notFoundContent="暂无 Profile"
          />
          <Button
            type="primary"
            icon={<ThunderboltOutlined />}
            loading={applyingProfile}
            disabled={!profileTarget}
            onClick={async () => {
              if (!profileTarget) return;
              setApplyingProfile(true);
              try {
                const results = await window.piswitch.applyProfile(profileTarget);
                const ok = results.filter((r) => r.ok).length;
                message.success(`Profile 已应用（成功 ${ok}/${results.length}）`);
              } finally {
                setApplyingProfile(false);
              }
            }}
          >
            应用
          </Button>
        </Space>
      </div>

      <ProfileStrip />

      <Tabs
        activeKey={active}
        onChange={(k) => setActive(k as Tool)}
        className="ps-agent-tabs ps-ext-tabs"
        items={TOOLS.map((t) => ({
          key: t,
          label: (
            <span className="agent-tab">
              <ToolIcon tool={t} size={18} />
              {TOOL_LABELS[t]}
              {config.agents[t]?.enabled && <Tag color="green" style={{ marginInlineEnd: 0 }}>启用</Tag>}
            </span>
          ),
          children: <AgentPanel key={t} tool={t} />,
        }))}
      />
    </div>
  );
}

function ProfileStrip() {
  const { config, setConfig } = useContext(ConfigContext);
  if (config.profiles.length === 0) return null;
  return (
    <div className="ps-card mb16">
      <div className="ps-card-head">
        <span className="ps-card-title">已保存的 Profile（一键统一切换）</span>
      </div>
      <div style={{ padding: '8px 16px' }}>
        <Space wrap size={8}>
          {config.profiles.map((p: Profile) => (
            <ProfileChip key={p.id} profile={p} onDelete={async () => {
              const cfg = await window.piswitch.deleteProfile(p.id);
              setConfig(cfg);
            }} />
          ))}
        </Space>
      </div>
    </div>
  );
}

function ProfileChip({ profile, onDelete }: { profile: Profile; onDelete: () => void }) {
  const { config } = useContext(ConfigContext);
  const [applying, setApplying] = useState(false);
  const summary = TOOLS.map((t) => {
    const sel = profile.agents[t];
    const p = sel?.providerId ? config.agents[t].providers.find((x) => x.id === sel.providerId) : undefined;
    return p ? `${TOOL_LABELS[t]}:${p.name}` : null;
  })
    .filter(Boolean)
    .join(' · ');
  return (
    <span className="ps-lamp" title={summary || '未绑定任何供应商'}>
      <span className="dot" style={{ background: 'var(--ps-accent)', boxShadow: '0 0 8px var(--ps-accent)' }} />
      <b>{profile.name}</b>
      <Button
        size="small"
        type="primary"
        icon={<SwapOutlined />}
        loading={applying}
        onClick={async () => {
          setApplying(true);
          try {
            const r = await window.piswitch.applyProfile(profile.id);
            const ok = r.filter((x) => x.ok).length;
            message.success(`「${profile.name}」已应用（成功 ${ok}/${r.length}）`);
          } finally {
            setApplying(false);
          }
        }}
      >
        应用
      </Button>
      <Popconfirm title="删除该 Profile？" onConfirm={onDelete}>
        <Button size="small" type="text" danger icon={<DeleteOutlined />} />
      </Popconfirm>
    </span>
  );
}

// ---------------------------------------------------------------------------
// 单个 Agent 面板
// ---------------------------------------------------------------------------

function AgentPanel({ tool }: { tool: Tool }) {
  const { config, setConfig } = useContext(ConfigContext);
  const agent = config.agents[tool];
  const [status, setStatus] = useState<ToolStatus | undefined>();
  const [applying, setApplying] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Provider | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [balanceLoading, setBalanceLoading] = useState<string | null>(null);
  const [balances, setBalances] = useState<Record<string, { ok: boolean; balance?: number; currency?: string; error?: string }>>({});
  const [balanceResult, setBalanceResult] = useState<{
    provider: string;
    result: { ok: boolean; balance?: number; totalGranted?: number; totalUsed?: number; hardLimit?: number; currency?: string; error?: string };
  } | null>(null);

  const loadStatus = () =>
    window.piswitch
      .getToolStatus()
      .then((list) => setStatus(list.find((x) => x.tool === tool)))
      .catch(() => undefined);

  useEffect(() => {
    loadStatus();
    const off = window.piswitch.onConfigChanged(loadStatus);
    return off;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool]);

  // 默认展示余额：进入页面自动并行查询所有供应商
  const providerIds = agent.providers.map((p) => p.id).join(',');
  useEffect(() => {
    let cancelled = false;
    const list = agent.providers;
    if (list.length === 0) {
      setBalances({});
      return;
    }
    setBalances({});
    for (const p of list) {
      window.piswitch
        .queryProviderBalance(tool, p.id)
        .then((r) => {
          if (!cancelled) setBalances((m) => ({ ...m, [p.id]: r }));
        })
        .catch(() => {
          if (!cancelled) setBalances((m) => ({ ...m, [p.id]: { ok: false, error: '查询失败' } }));
        });
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool, providerIds]);

  const persist = async (patch: Partial<typeof agent>) => {
    const next = { ...config, agents: { ...config.agents, [tool]: { ...agent, ...patch } } };
    const cfg = await window.piswitch.saveConfig(next);
    setConfig(cfg);
    return cfg;
  };

  const applyOne = async () => {
    setApplying(true);
    try {
      const r = (await window.piswitch.applyBindings([tool]))[0];
      if (r?.ok) message.success(`${TOOL_LABELS[tool]} 配置已应用${r.backupPath ? '（已备份）' : ''}`);
      else message.error(`${TOOL_LABELS[tool]} 应用失败：${r?.error}`);
      loadStatus();
    } finally {
      setApplying(false);
    }
  };

  /** 精确统计开关：可点击；开启时自动启用全局代理，并自动应用使 baseUrl 改写生效 */
  const toggleProxy = async (v: boolean) => {
    try {
      if (v && !config.settings.proxy.enabled) {
        const c1 = await window.piswitch.setProxyGlobal(true);
        setConfig(c1);
      }
      const c2 = await window.piswitch.setProxyEnabled(tool, v);
      setConfig(c2);
      const r = (await window.piswitch.applyBindings([tool]))[0];
      loadStatus();
      if (v) {
        message.success(r?.ok ? '精确统计已开启并生效（已应用绑定）' : `代理已开启，但应用失败：${r?.error}`);
      } else {
        message.success('精确统计已关闭（绑定已应用，恢复直连）');
      }
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const removeProvider = async (id: string) => {
    const cfg = await window.piswitch.deleteProvider(tool, id);
    setConfig(cfg);
    message.success('已删除');
  };

  /** 点击卡片 = 一键切换该供应商（首个模型），已启用时立即应用 */
  const switchTo = async (p: Provider) => {
    if (!agent.enabled) {
      message.warning('请先启用该 Agent');
      return;
    }
    if (agent.providerId === p.id) {
      await applyOne();
      return;
    }
    await persist({ providerId: p.id, modelId: p.models[0]?.id || '' });
    await applyOne();
  };

  const testProvider = async (id: string) => {
    setTesting(id);
    try {
      const r = await window.piswitch.testProvider(tool, id);
      if (r.ok) message.success(r.message);
      else message.error(r.message);
    } finally {
      setTesting(null);
    }
  };

  const queryBalance = async (p: Provider) => {
    setBalanceLoading(p.id);
    try {
      const result = await window.piswitch.queryProviderBalance(tool, p.id);
      setBalances((m) => ({ ...m, [p.id]: result }));
      setBalanceResult({ provider: p.name, result });
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBalanceLoading(null);
    }
  };

  const currentProvider = providerById(config, tool, agent.providerId);
  const proxyEnabled = config.settings.proxy.enabled && !!agent.proxyEnabled;

  return (
    <div>
      {/* Agent 配置：绑定 + 精确统计 + 供应商库（合并） */}
      <div className="ps-card mb16 ps-agent-config-card">
        <div className="ps-card-head">
          <span className="ps-card-title">
            <span style={{ color: TOOL_COLORS[tool] }}>●</span>
            Agent 配置
          </span>
          <Space wrap={false}>
            <span className="ps-head-toggle">
              <span className="ps-bind-label">启用</span>
              <Switch checked={!!agent.enabled} onChange={(v) => void persist({ enabled: v })} />
            </span>
            <span className="ps-head-toggle">
              <span className="ps-bind-label">精确统计</span>
              <Switch
                checked={!!agent.proxyEnabled}
                disabled={!agent.enabled}
                onChange={toggleProxy}
                checkedChildren="开"
                unCheckedChildren="关"
              />
            </span>
            <Button size="small" icon={<RocketOutlined />} onClick={() => window.piswitch.launchTool(tool)}>
              启动
            </Button>
            <Button size="small" type="primary" icon={<SwapOutlined />} loading={applying} onClick={applyOne}>
              应用
            </Button>
          </Space>
        </div>
        <div className="ps-card-body">
          {/* 状态行 */}
          <div className="ps-binding-row" style={{ marginBottom: 12 }}>
            <span className="ps-lamp">
              <span className="dot" />
              当前配置：
              {status?.exists
                ? status?.currentProvider
                  ? `${status.currentProvider} / ${status.currentModel || '-'}`
                  : '已检测到文件'
                : '配置文件不存在'}
            </span>
            {proxyEnabled && (
              <span className="ps-lamp on">
                <span className="dot" />
                代理统计中
              </span>
            )}
            {agent.enabled && currentProvider ? (
              <span className="ps-lamp ok">
                <span className="dot" />
                绑定就绪
              </span>
            ) : (
              <span className="ps-lamp warn">
                <span className="dot" />
                {agent.enabled ? '绑定未完成' : '未启用'}
              </span>
            )}
            <span style={{ flex: 1 }} />
            <Button
              size="small"
              icon={<PlusOutlined />}
              onClick={() => {
                setEditing(null);
                setModalOpen(true);
              }}
            >
              新增供应商
            </Button>
          </div>

          {/* 供应商库（仅该 Agent 使用） */}
          {agent.providers.length === 0 ? (
            <div style={{ padding: '4px 0 12px' }}>
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="该 Agent 尚未配置供应商" />
            </div>
          ) : (
            <div className="ps-provider-grid">
              {agent.providers.map((p) => {
                const isCurrent = agent.enabled && agent.providerId === p.id;
                const bal = balances[p.id];
                return (
                  <div
                    key={p.id}
                    className={`ps-provider-card${isCurrent ? ' current' : ''}`}
                    onClick={() => void switchTo(p)}
                    title={isCurrent ? '当前使用的供应商（点击重新应用）' : '点击切换到此供应商'}
                  >
                    {/* 左侧：信息区 */}
                    <div className="ps-provider-main">
                      <div className="ps-provider-top">
                        <span className="ps-provider-avatar" style={{ background: providerColor(p) }}>
                          {(p.name || p.id).charAt(0).toUpperCase()}
                        </span>
                        <div className="ps-provider-id">
                          <b className="ps-provider-title">{p.name}</b>
                          <span className="mono dim">{p.id}</span>
                        </div>
                        {isCurrent && <span className="ps-provider-current-badge">当前</span>}
                        <Space size={0} className="ps-provider-card-ops" onClick={(e) => e.stopPropagation()}>
                          <Button
                            size="small"
                            type="text"
                            icon={<EditOutlined />}
                            title="编辑"
                            onClick={() => {
                              setEditing(p);
                              setModalOpen(true);
                            }}
                          />
                          <Popconfirm title="删除该供应商？当前绑定会被清空。" onConfirm={() => removeProvider(p.id)}>
                            <Button size="small" type="text" danger icon={<DeleteOutlined />} title="删除" />
                          </Popconfirm>
                        </Space>
                      </div>
                      <div className="ps-provider-meta">
                        <span>
                          <Tag style={{ marginInlineEnd: 0 }}>{API_LABELS[p.api] || p.api}</Tag>
                        </span>
                        <span className="mono dim ellipsis" title={p.baseUrl}>
                          {p.baseUrl}
                        </span>
                        <span className="mono dim">
                          {p.apiKeyLiteral ? maskKey(p.apiKeyLiteral) : p.apiKeyEnv ? `env:${p.apiKeyEnv}` : '(未设置密钥)'}
                        </span>
                      </div>
                      <div className="ps-provider-models">
                        {p.models.length === 0 ? (
                          <span className="dim">无模型</span>
                        ) : (
                          <>
                            {p.models.slice(0, 6).map((m) => (
                              <span key={m.id} className="ps-model-chip" title={m.name}>
                                {m.id}
                              </span>
                            ))}
                            {p.models.length > 6 && (
                              <span className="ps-model-chip more" title={p.models.slice(6).map((m) => m.id).join(', ')}>
                                +{p.models.length - 6}
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    </div>

                    {/* 右侧：功能区域（余额默认展示 + 测试 + 刷新 + 切换） */}
                    <div className="ps-provider-side" onClick={(e) => e.stopPropagation()}>
                      <div
                        className="ps-provider-balance"
                        title={bal?.ok ? `${bal.currency || 'USD'} 可用余额` : bal?.error || '点击查询余额'}
                        onClick={() => void queryBalance(p)}
                      >
                        <span className="ps-balance-label">余额</span>
                        {!bal ? (
                          <span className="dim">查询中…</span>
                        ) : bal.ok && bal.balance !== undefined ? (
                          <>
                            ${bal.balance.toFixed(2)}
                            {bal.currency ? <span className="dim"> {bal.currency}</span> : null}
                          </>
                        ) : (
                          <span className="dim" title={bal.error}>
                            未开放
                          </span>
                        )}
                      </div>
                      <Button size="small" icon={<RocketOutlined />} loading={testing === p.id} onClick={() => testProvider(p.id)}>
                        测试
                      </Button>
                      <Button size="small" icon={<ThunderboltOutlined />} loading={balanceLoading === p.id} onClick={() => queryBalance(p)}>
                        刷新
                      </Button>
                      {isCurrent ? (
                        <span className="ps-inuse" style={{ justifyContent: 'center' }}>
                          <span className="dot" style={{ background: 'var(--ps-accent)', boxShadow: '0 0 8px var(--ps-accent)' }} />
                          使用中
                        </span>
                      ) : (
                        <Button size="small" type="primary" ghost icon={<SwapOutlined />} onClick={() => void switchTo(p)}>
                          切换
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* 绑定精调：模型 / 推理强度 */}
          <div className="ps-binding-row ps-binding-bottom">
            <span className="ps-bind-label">当前模型</span>
            <Select
              style={{ width: 260 }}
              placeholder="选择模型"
              value={agent.modelId || undefined}
              disabled={!agent.enabled || !currentProvider}
              options={(currentProvider?.models || []).map((m) => ({ value: m.id, label: `${m.name}（${m.id}）` }))}
              onChange={(v) => void persist({ modelId: v })}
            />
            {tool === 'codex' && (
              <>
                <span className="ps-bind-label" style={{ marginLeft: 12 }}>推理强度</span>
                <Select
                  style={{ width: 120 }}
                  value={agent.reasoningEffort || 'medium'}
                  disabled={!agent.enabled}
                  options={CODE_REASONING_EFFORTS.map((r) => ({ value: r, label: r }))}
                  onChange={(v) => void persist({ reasoningEffort: v })}
                />
              </>
            )}
            <span style={{ flex: 1 }} />
            <span style={{ fontSize: 12, color: 'var(--ps-text-faint)' }}>
              点击卡片切换供应商；开启精确统计后请求经本地代理统计 tokens 与费用
            </span>
          </div>
        </div>
      </div>


      <RawConfigEditor tool={tool} />

      <ProviderModal tool={tool} open={modalOpen} editing={editing} onClose={() => setModalOpen(false)} />

      {/* 余额查询结果 */}
      <Modal
        title={`余额查询 — ${balanceResult?.provider ?? ''}`}
        open={!!balanceResult}
        onCancel={() => setBalanceResult(null)}
        footer={<Button onClick={() => setBalanceResult(null)}>关闭</Button>}
        width={460}
      >
        {balanceResult?.result.ok ? (
          <Descriptions column={1} size="small" bordered>
            {balanceResult.result.balance !== undefined && (
              <Descriptions.Item label="可用余额">
                <b style={{ color: 'var(--ps-accent)' }}>${balanceResult.result.balance.toFixed(4)}</b>{' '}
                {balanceResult.result.currency || ''}
              </Descriptions.Item>
            )}
            {balanceResult.result.totalGranted !== undefined && (
              <Descriptions.Item label="累计充值">${balanceResult.result.totalGranted.toFixed(2)}</Descriptions.Item>
            )}
            {balanceResult.result.totalUsed !== undefined && (
              <Descriptions.Item label="已用金额">${balanceResult.result.totalUsed.toFixed(2)}</Descriptions.Item>
            )}
            {balanceResult.result.hardLimit !== undefined && (
              <Descriptions.Item label="额度上限">${balanceResult.result.hardLimit.toFixed(2)}</Descriptions.Item>
            )}
          </Descriptions>
        ) : (
          <Typography.Text type="secondary">{balanceResult?.result.error || '查询失败'}</Typography.Text>
        )}
      </Modal>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 配置源码编辑器
// ---------------------------------------------------------------------------

function RawConfigEditor({ tool }: { tool: Tool }) {
  const [files, setFiles] = useState<RawConfigFile[]>([]);
  const [activeName, setActiveName] = useState<string>('');
  const [contents, setContents] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const list = await window.piswitch.getRawConfig(tool);
    setFiles(list);
    if (!list.length) return;
    setActiveName((prev) => (prev && list.some((f) => f.name === prev) ? prev : list[0].name));
    setContents((prev) => {
      const next = { ...prev };
      for (const f of list) if (!(f.name in next)) next[f.name] = f.content;
      return next;
    });
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool]);

  const active = files.find((f) => f.name === activeName);
  const dirty = active ? (contents[active.name] ?? '') !== active.content : false;

  return (
    <Collapse
      className="mb16"
      items={[
        {
          key: 'raw',
          label: (
            <Space>
              <CodeOutlined />
              配置文件源码（直接修改真实配置，保存前自动校验语法并备份）
            </Space>
          ),
          children: (
            <div>
              <div className="ps-code-toolbar">
                <Select
                  size="small"
                  style={{ width: 200 }}
                  value={activeName || undefined}
                  onChange={setActiveName}
                  options={files.map((f) => ({ value: f.name, label: `${f.name}${f.exists ? '' : '（不存在）'}` }))}
                />
                <Button size="small" icon={<ReloadOutlined />} onClick={() => void load()}>
                  重新加载
                </Button>
                {active && (
                  <Button size="small" icon={<FolderOpenOutlined />} onClick={() => window.piswitch.openPath(active.path)}>
                    打开文件
                  </Button>
                )}
                <span style={{ marginLeft: 'auto' }} />
                <Button
                  size="small"
                  type="primary"
                  icon={<SaveOutlined />}
                  loading={saving}
                  disabled={!active || !dirty}
                  onClick={async () => {
                    if (!active) return;
                    setSaving(true);
                    try {
                      const r = await window.piswitch.saveRawConfig(tool, active.name, contents[active.name] ?? '');
                      if (r.ok) {
                        message.success(`已保存并备份${r.backupPath ? '' : '（无备份）'}`);
                        await load();
                      } else {
                        message.error(r.error || '保存失败');
                      }
                    } finally {
                      setSaving(false);
                    }
                  }}
                >
                  保存并校验
                </Button>
              </div>
              {active ? (
                <div className="ps-code-editor">
                  <Input.TextArea
                    value={contents[active.name] ?? ''}
                    onChange={(e) => setContents((prev) => ({ ...prev, [active.name]: e.target.value }))}
                    autoSize={{ minRows: 8, maxRows: 26 }}
                    spellCheck={false}
                    style={{ border: 'none', boxShadow: 'none', borderRadius: 0, padding: 12 }}
                  />
                </div>
              ) : (
                <Empty description="无配置文件" />
              )}
              {active?.hint && (
                <div style={{ fontSize: 12, color: 'var(--ps-text-faint)', marginTop: 8 }}>
                  💡 {active.hint}
                </div>
              )}
            </div>
          ),
        },
      ]}
    />
  );
}
