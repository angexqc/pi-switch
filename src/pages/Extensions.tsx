import React, { useCallback, useEffect, useState } from 'react';
import {
  Avatar,
  Button,
  Card,
  Checkbox,
  Empty,
  Input,
  Modal,
  Popconfirm,
  Radio,
  Segmented,
  Space,
  Tag,
  Tabs,
  Tooltip,
  Typography,
  message,
} from 'antd';
import {
  ApiOutlined,
  AppstoreOutlined,
  CheckCircleFilled,
  CloudDownloadOutlined,
  DeleteOutlined,
  EditOutlined,
  FileTextOutlined,
  PlusOutlined,
  ReloadOutlined,
  RobotOutlined,
  SaveOutlined,
  ThunderboltFilled,
  UpCircleFilled,
} from '@ant-design/icons';
import type { McpAggItem, PromptFile, PromptScope, SkillAggItem, SystemPromptInfo, Tool, ToolVersion } from '../../shared/types';
import { TOOL_COLORS, TOOL_LABELS } from '../constants';
import { ToolIcon } from '../components/ToolIcon';

const TOOLS: Tool[] = ['pi', 'claude', 'codex', 'opencode'];

const UPGRADE_HINT: Record<Tool, string> = {
  pi: 'npm update -g @earendil-works/pi-agent-core',
  claude: 'claude update',
  codex: 'codex update',
  opencode: 'npm update -g opencode-ai',
};


export default function Extensions() {
  const [tab, setTab] = useState('versions');
  return (
    <div className="page ps-page-fixed">
      <div className="page-title">
        <div>
          <div className="title">扩展中心</div>
          <div className="title-desc">MCP / Skills / 提示词 / Pi 插件管理 · 各工具版本监测与升级 · skills.sh 市场</div>
        </div>
      </div>

      <Tabs
        activeKey={tab}
        onChange={setTab}
        className="ps-agent-tabs ps-ext-tabs"
        items={[
          { key: 'versions', label: '版本与升级', children: <VersionsPanel /> },
          { key: 'mcp', label: 'MCP 服务器', children: <McpPanel /> },
          { key: 'skills', label: 'Skills 市场', children: <SkillsPanel /> },
          { key: 'plugins', label: 'Pi 插件', children: <PluginsPanel /> },
          { key: 'prompts', label: '提示词', children: <PromptsPanel /> },
        ]}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 版本监测与升级：当前 + 最新 + 对比，有更新才显示升级按钮                 */
/* ------------------------------------------------------------------ */

function VersionsPanel() {
  const [versions, setVersions] = useState<ToolVersion[]>([]);
  const [loading, setLoading] = useState(false);
  const [upgrading, setUpgrading] = useState<Tool | null>(null);
  const [detail, setDetail] = useState<{ tool: Tool; output?: string; error?: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setVersions(await window.piswitch.getToolVersions());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const upgrade = async (tool: Tool) => {
    setUpgrading(tool);
    try {
      const r = await window.piswitch.upgradeTool(tool);
      setDetail({ tool, output: r.output, error: r.error });
      if (r.ok) await load();
    } finally {
      setUpgrading(null);
    }
  };

  return (
    <div className="ps-card">
      <div className="ps-card-head">
        <span className="ps-card-title">四个工具 CLI 版本（对比 npm 最新版）</span>
        <Button size="small" icon={<ReloadOutlined />} loading={loading} onClick={() => void load()}>
          重新检测
        </Button>
      </div>
      <div style={{ padding: '4px 16px 16px' }}>
        <div className="ps-version-grid">
          {versions.map((v) => {
            const upd = v.updateAvailable === true;
            const uptodate = v.updateAvailable === false;
            return (
              <div key={v.tool} className="ps-version-card">
                <div className="ps-version-head">
                  <span className="ps-version-dot" style={{ background: TOOL_COLORS[v.tool] }} />
                  <b>{TOOL_LABELS[v.tool]}</b>
                </div>
                <div className="ps-version-num">{v.found ? <span className="mono">{v.version}</span> : <span className="ps-version-miss">{v.error || '未检测到'}</span>}</div>
                <div className="ps-version-latest">
                  最新
                  {v.latest ? (
                    <span className="mono">{v.latest}</span>
                  ) : (
                    <span style={{ color: 'var(--ps-text-faint)' }}>获取失败</span>
                  )}
                </div>
                <div className="ps-version-status">
                  {!v.found ? (
                    <Tag color="red">未安装</Tag>
                  ) : upd ? (
                    <Tag color="orange" icon={<UpCircleFilled />}>
                      发现新版本
                    </Tag>
                  ) : uptodate ? (
                    <Tag color="green" icon={<CheckCircleFilled />}>
                      已是最新
                    </Tag>
                  ) : (
                    <Tag>无法判断</Tag>
                  )}
                </div>
                <div className="ps-version-cmd mono dim">{UPGRADE_HINT[v.tool]}</div>
                {upd ? (
                  <Button
                    size="small"
                    type="primary"
                    icon={<CloudDownloadOutlined />}
                    loading={upgrading === v.tool}
                    onClick={() => void upgrade(v.tool)}
                  >
                    升级到 {v.latest}
                  </Button>
                ) : uptodate ? (
                  <Button size="small" disabled>
                    已是最新
                  </Button>
                ) : v.found ? (
                  <Button size="small" onClick={() => void upgrade(v.tool)} loading={upgrading === v.tool}>
                    仍要升级
                  </Button>
                ) : (
                  <Button size="small" disabled>
                    请先安装
                  </Button>
                )}
              </div>
            );
          })}
        </div>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          最新版本查询走 npm registry（自动跟随 npm 镜像）；升级会修改全局环境，耗时可能较长。
        </Typography.Text>
      </div>

      <Modal
        title={detail ? `${TOOL_LABELS[detail.tool]} 升级结果` : ''}
        open={!!detail}
        onCancel={() => setDetail(null)}
        footer={<Button onClick={() => setDetail(null)}>关闭</Button>}
        width={620}
      >
        {detail && (
          <pre
            className="mono"
            style={{
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
              maxHeight: 380,
              overflow: 'auto',
              background: 'var(--ps-surface-2)',
              padding: 12,
              borderRadius: 8,
              fontSize: 12,
              color: detail.error ? 'var(--ps-danger)' : 'var(--ps-text)',
            }}
          >
            {detail.error || detail.output}
          </pre>
        )}
      </Modal>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* MCP 服务器：直接展示 + 每服务器启用开关 + agent icon 亮灭               */
/* ------------------------------------------------------------------ */

/** 右侧 Agent 亮暗圆点（点击灰色 = 添加/启用） */
function AgentDots({
  states,
  onToggle,
}: {
  /** true = 亮（该 Agent 已使用/已安装） */
  states: Partial<Record<Tool, boolean>>;
  onToggle?: (tool: Tool) => void;
}) {
  return (
    <div className="ps-agg-dots">
      {TOOLS.map((t) => {
        const on = states[t] === true;
        return (
          <Tooltip key={t} title={on ? `${TOOL_LABELS[t]}：已使用` : onToggle ? `点击为 ${TOOL_LABELS[t]} 添加` : `${TOOL_LABELS[t]}：未使用`}>
            <span
              className={`ps-agg-dot${on ? ' on' : ' off'}${onToggle && !on ? ' clickable' : ''}`}
              style={on ? { color: TOOL_COLORS[t], borderColor: TOOL_COLORS[t], boxShadow: `0 0 8px ${TOOL_COLORS[t]}` } : undefined}
              onClick={onToggle && !on ? () => onToggle(t) : undefined}
            >
              <ToolIcon tool={t} size={20} dim={!on} />
            </span>
          </Tooltip>
        );
      })}
    </div>
  );
}

function McpPanel() {
  const [items, setItems] = useState<McpAggItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<{ name: string; cfgText: string; tools: Tool[] } | null>(null);
  const [newName, setNewName] = useState('');
  const [newTools, setNewTools] = useState<Tool[]>(TOOLS);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await window.piswitch.getMcpAggregated());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const addToAgent = async (tool: Tool, name: string) => {
    const r = await window.piswitch.applyMcpToAgent(tool, name);
    if (r.ok) {
      message.success(`已为 ${TOOL_LABELS[tool]} 添加 ${name}`);
      await load();
    } else {
      message.error(r.error);
    }
  };

  const openAdd = () => {
    setEditing({ name: '', cfgText: '{\n  "command": "npx",\n  "args": ["-y", "@modelcontextprotocol/server-xxx"]\n}', tools: TOOLS });
    setNewName('');
    setNewTools(TOOLS);
  };

  const openEdit = (item: McpAggItem) => {
    const tools = TOOLS.filter((t) => item.agents[t]?.present);
    setEditing({ name: item.name, cfgText: JSON.stringify(item.raw || { command: 'npx', args: [] }, null, 2), tools: tools.length ? tools : TOOLS });
    setNewName(item.name);
    setNewTools(tools.length ? tools : TOOLS);
  };

  const save = async () => {
    if (!editing) return;
    const name = newName.trim();
    if (!name) {
      message.warning('请输入服务器名称');
      return;
    }
    let cfg: Record<string, unknown>;
    try {
      cfg = JSON.parse(editing.cfgText);
    } catch {
      message.error('配置不是合法 JSON');
      return;
    }
    const r = await window.piswitch.saveMcpForAgents(name, cfg, newTools.length ? newTools : TOOLS);
    if (r.ok) {
      message.success('MCP 服务器已保存');
      setEditing(null);
      await load();
    } else {
      message.error(`保存失败：${r.error}`);
    }
  };

  const remove = async (name: string) => {
    const r = await window.piswitch.deleteMcpEverywhere(name);
    if (r.ok) {
      message.success(`已从所有 Agent 删除 ${name}`);
      await load();
    } else {
      message.error(r.error);
    }
  };

  return (
    <>
      <div className="ps-card mb16">
        <div className="ps-card-head">
          <span className="ps-card-title">
            <ApiOutlined /> MCP 服务器 — 右侧图标亮 = 该 Agent 已使用；点击灰色图标为对应 Agent 添加
          </span>
          <Space>
            <Button size="small" icon={<ReloadOutlined />} loading={loading} onClick={() => void load()}>
              刷新
            </Button>
            <Button size="small" type="primary" icon={<PlusOutlined />} onClick={openAdd}>
              新增 MCP
            </Button>
          </Space>
        </div>

        {items.length === 0 && !loading ? (
          <Empty description="无 MCP 配置，点击「新增 MCP」创建" style={{ padding: 24 }} />
        ) : (
          <div style={{ padding: '6px 16px 14px' }}>
            {items.map((item) => (
              <div key={item.name} className="ps-agg-row">
                <div className="ps-agg-main">
                  <span className="ps-agg-name">{item.name}</span>
                  <span className="ps-agg-desc">
                    <Tag style={{ marginInlineEnd: 6, fontSize: 10.5 }} color={item.type === 'http' ? 'blue' : item.type === 'stdio' ? 'green' : 'default'}>
                      {item.type}
                    </Tag>
                    {item.command || item.url || '-'}
                  </span>
                </div>
                <AgentDots
                  states={Object.fromEntries(
                    TOOLS.map((t) => {
                      const st = item.agents[t];
                      return [t, !!st?.present && st.enabled];
                    })
                  )}
                  onToggle={(t) => void addToAgent(t, item.name)}
                />
                <Space size={2}>
                  <Button size="small" type="text" icon={<EditOutlined />} onClick={() => openEdit(item)} />
                  <Popconfirm title={`从所有 Agent 删除 ${item.name}？`} onConfirm={() => void remove(item.name)}>
                    <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                </Space>
              </div>
            ))}
          </div>
        )}
        <div style={{ padding: '0 16px 12px' }}>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            编辑/新增时可勾选要应用的 Agent；写回各工具配置文件前自动备份。
          </Typography.Text>
        </div>
      </div>

      <Modal
        title={editing?.name ? `编辑 MCP 服务器 ${editing.name}` : '新增 MCP 服务器'}
        open={!!editing}
        onCancel={() => setEditing(null)}
        onOk={() => void save()}
        width={580}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Input placeholder="服务器名称（如 my-mcp）" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <div>
            <div style={{ marginBottom: 6, fontWeight: 600 }}>应用到哪些 Agent</div>
            <Checkbox.Group
              value={newTools}
              onChange={(v) => setNewTools(v as Tool[])}
              options={TOOLS.map((t) => ({ label: TOOL_LABELS[t], value: t }))}
            />
          </div>
          <Input.TextArea
            rows={9}
            className="mono"
            value={editing?.cfgText}
            onChange={(e) => setEditing(editing ? { ...editing, cfgText: e.target.value } : editing)}
            placeholder={'{"command": "npx", "args": ["-y", "pkg"], "env": {...}} 或 {"type":"http","url":"https://..."}'}
          />
        </Space>
      </Modal>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Skills：默认折叠 + skills.sh 市场（webview 嵌入 + npx skills 安装）    */
/* ------------------------------------------------------------------ */

function SkillsPanel() {
  const [skills, setSkills] = useState<SkillAggItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [installOpen, setInstallOpen] = useState(false);
  const [repo, setRepo] = useState('');
  const [scope, setScope] = useState<'global' | 'project'>('global');
  const [agents, setAgents] = useState<Tool[]>(TOOLS);
  const [skillFilter, setSkillFilter] = useState('');
  const [copy, setCopy] = useState(true);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; output?: string; error?: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setSkills(await window.piswitch.getSkillsAggregated());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const installTo = async (name: string, tool: Tool) => {
    const r = await window.piswitch.installSkillToAgent(name, tool);
    if (r.ok) {
      message.success(`已安装 ${name} 到 ${TOOL_LABELS[tool]}`);
      await load();
    } else {
      message.error(r.error);
    }
  };

  const remove = async (name: string) => {
    const r = await window.piswitch.deleteSkillEverywhere(name);
    if (r.ok) {
      message.success(`已从所有 Agent 删除 ${name}`);
      await load();
    } else {
      message.error(r.error);
    }
  };

  const runInstall = async () => {
    if (!repo.trim()) {
      message.warning('请输入 GitHub 仓库（如 owner/repo 或完整 URL）');
      return;
    }
    const args: string[] = ['add', repo.trim()];
    if (scope === 'global') args.push('-g');
    args.push('-a', agents.length ? agents.join(',') : '*');
    if (skillFilter.trim()) args.push('-s', skillFilter.trim());
    if (copy) args.push('--copy');
    args.push('-y');
    setRunning(true);
    setResult(null);
    try {
      const r = await window.piswitch.runSkillsCommand(args);
      setResult(r);
      if (r.ok) {
        message.success('Skill 安装完成');
        await load();
      } else {
        message.error('安装失败，查看输出详情');
      }
    } finally {
      setRunning(false);
    }
  };

  const updateAll = async () => {
    setRunning(true);
    setResult(null);
    try {
      const r = await window.piswitch.runSkillsCommand(['update', '-y']);
      setResult(r);
      if (r.ok) {
        message.success('Skills 更新完成');
        await load();
      } else {
        message.error('更新失败，查看输出详情');
      }
    } finally {
      setRunning(false);
    }
  };

  return (
    <>
      <div className="ps-card mb16">
        <div className="ps-card-head">
          <span className="ps-card-title">
            <AppstoreOutlined /> Skills — 右侧图标亮 = 已安装到该 Agent；点击灰色图标安装
          </span>
          <Space>
            <Button size="small" icon={<ReloadOutlined />} onClick={() => void updateAll()} loading={running}>
              更新全部
            </Button>
            <Button size="small" type="primary" icon={<PlusOutlined />} onClick={() => { setInstallOpen(true); setResult(null); }}>
              从市场安装
            </Button>
            <Button size="small" icon={<CloudDownloadOutlined />} onClick={() => void window.piswitch.openExternal('https://www.skills.sh/')}>
              打开 skills.sh
            </Button>
          </Space>
        </div>

        {skills.length === 0 && !loading ? (
          <Empty description="未发现 Skills，可点击「从市场安装」" style={{ padding: 24 }} />
        ) : (
          <div style={{ padding: '6px 16px 14px' }}>
            {skills.map((s) => (
              <div key={s.name} className="ps-agg-row">
                <div className="ps-agg-main">
                  <span className="ps-agg-name">{s.name}</span>
                  <span className="ps-agg-desc">{s.description || '（无描述）'} · <span className="mono dim">{s.path}</span></span>
                </div>
                <AgentDots states={s.agents} onToggle={(t) => void installTo(s.name, t)} />
                <Popconfirm title={`从所有 Agent 删除 Skill ${s.name}？`} onConfirm={() => void remove(s.name)}>
                  <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                </Popconfirm>
              </div>
            ))}
          </div>
        )}
        <div style={{ padding: '0 16px 12px' }}>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            点击灰色图标会把 Skill 目录复制到对应 Agent（Pi 走用户级 ~/.agents/skills）。删除会从所有已安装位置移除（先备份）。
          </Typography.Text>
        </div>
      </div>

      {/* 从市场安装 Modal */}
      <Modal
        title="从 skills.sh 安装 Skill"
        open={installOpen}
        onCancel={() => setInstallOpen(false)}
        onOk={() => void runInstall()}
        confirmLoading={running}
        okText="开始安装"
        width={600}
      >
        <Space direction="vertical" style={{ width: '100%' }} size={14}>
          <div>
            <div style={{ marginBottom: 6, fontWeight: 600 }}>GitHub 仓库</div>
            <Input
              className="mono"
              placeholder="owner/repo 或 https://github.com/owner/repo"
              value={repo}
              onChange={(e) => setRepo(e.target.value)}
            />
          </div>
          <div>
            <div style={{ marginBottom: 6, fontWeight: 600 }}>安装范围</div>
            <Radio.Group
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              options={[
                { label: '用户级（所有项目可用）', value: 'global' },
                { label: '项目级', value: 'project' },
              ]}
              optionType="button"
            />
          </div>
          <div>
            <div style={{ marginBottom: 6, fontWeight: 600 }}>安装到哪些工具（Agent）</div>
            <Checkbox.Group
              value={agents}
              onChange={(v) => setAgents(v as Tool[])}
              options={TOOLS.map((t) => ({ label: TOOL_LABELS[t], value: t }))}
            />
          </div>
          <div>
            <div style={{ marginBottom: 6, fontWeight: 600 }}>仅安装指定 Skill（可留空 = 全部）</div>
            <Input placeholder="skill 名称，如 pdf-tools" value={skillFilter} onChange={(e) => setSkillFilter(e.target.value)} />
          </div>
          <Checkbox checked={copy} onChange={(e) => setCopy(e.target.checked)}>
            复制文件而非符号链接（推荐，避免链接失效）
          </Checkbox>
          {result && (
            <pre
              className="mono"
              style={{
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                maxHeight: 220,
                overflow: 'auto',
                background: 'var(--ps-surface-2)',
                padding: 10,
                borderRadius: 8,
                fontSize: 11.5,
                color: result.ok ? 'var(--ps-text)' : 'var(--ps-danger)',
              }}
            >
              {result.error || result.output}
            </pre>
          )}
        </Space>
      </Modal>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Pi 插件管理                                                          */
/* ------------------------------------------------------------------ */

function PluginsPanel() {
  const [plugins, setPlugins] = useState<string[]>([]);
  const [newPkg, setNewPkg] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setPlugins(await window.piswitch.getPiPlugins());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const add = async () => {
    if (!newPkg.trim()) {
      message.warning('请输入 npm 包名');
      return;
    }
    const r = await window.piswitch.addPiPlugin(newPkg.trim());
    if (r.ok) {
      message.success('已加入插件列表（重启 pi 后生效）');
      setNewPkg('');
      await load();
    } else {
      message.error(r.error);
    }
  };

  const remove = async (pkg: string) => {
    const r = await window.piswitch.removePiPlugin(pkg);
    if (r.ok) {
      message.success('已移除');
      await load();
    } else {
      message.error(r.error);
    }
  };

  return (
    <div className="ps-card">
      <div className="ps-card-head">
        <span className="ps-card-title">
          <AppstoreOutlined /> Pi Agent 插件（~/.pi/agent/settings.json → packages）
        </span>
        <Space>
          <Input
            style={{ width: 300 }}
            placeholder="npm:@scope/pkg 或 pi-xxx"
            value={newPkg}
            onChange={(e) => setNewPkg(e.target.value)}
            onPressEnter={() => void add()}
          />
          <Button size="small" type="primary" icon={<PlusOutlined />} onClick={() => void add()}>
            添加
          </Button>
        </Space>
      </div>
      <div style={{ padding: '4px 16px 16px' }}>
        {plugins.length === 0 ? (
          <Empty description="未安装插件" style={{ padding: 24 }} />
        ) : (
          <div className="ps-plugin-list">
            {plugins.map((p) => (
              <div key={p} className="ps-plugin-item">
                <span className="mono">{p}</span>
                <Popconfirm title={`移除插件 ${p}？`} onConfirm={() => void remove(p)}>
                  <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                </Popconfirm>
              </div>
            ))}
          </div>
        )}
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          插件以 npm 包形式安装，写入 packages 列表；重启 pi agent 后自动加载。
        </Typography.Text>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 提示词：系统提示词选择启用 + 模板文件管理                               */
/* ------------------------------------------------------------------ */

function PromptsPanel() {
  const [info, setInfo] = useState<SystemPromptInfo | null>(null);
  const [files, setFiles] = useState<PromptFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [editActive, setEditActive] = useState<string | null>(null); // 'current' | candidate name
  const [editContent, setEditContent] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [createMode, setCreateMode] = useState<'new' | 'from-current'>('new');
  const [createName, setCreateName] = useState('');
  const [createContent, setCreateContent] = useState('');
  const [creating, setCreating] = useState<PromptScope | null>(null);
  const [newName, setNewName] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [i, f] = await Promise.all([window.piswitch.getSystemPrompt(), window.piswitch.getPromptFiles()]);
      setInfo(i);
      setFiles(f);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const enable = async (name: string) => {
    const r = await window.piswitch.enableSystemPrompt(name);
    if (r.ok) {
      message.success(`已启用系统提示词「${name}」`);
      await load();
    } else {
      message.error(r.error);
    }
  };

  const openEditCandidate = (name: string, content: string) => {
    setEditActive(name);
    setEditContent(content);
  };

  const openEditCurrent = (content: string) => {
    setEditActive('current');
    setEditContent(content);
  };

  const saveEdit = async () => {
    if (!editActive) return;
    const r =
      editActive === 'current'
        ? await window.piswitch.saveActiveSystemPrompt(editContent)
        : await window.piswitch.saveSystemPrompt(editActive, editContent, true);
    if (r.ok) {
      message.success('已保存');
      setEditActive(null);
      await load();
    } else {
      message.error(r.error);
    }
  };

  const saveAsTemplate = async () => {
    if (!info?.active) return;
    if (!createName.trim()) {
      message.warning('请输入模板名称');
      return;
    }
    const r = await window.piswitch.saveSystemPrompt(createName.trim(), info.active.content, false);
    if (r.ok) {
      message.success('已保存为模板');
      setCreateOpen(false);
      setCreateName('');
      await load();
    } else {
      message.error(r.error);
    }
  };

  const createTemplate = async () => {
    if (!createName.trim()) {
      message.warning('请输入模板名称');
      return;
    }
    const r = await window.piswitch.saveSystemPrompt(createName.trim(), createContent || `# ${createName.trim()}\n\n`, false);
    if (r.ok) {
      message.success('模板已创建');
      setCreateOpen(false);
      setCreateName('');
      setCreateContent('');
      await load();
    } else {
      message.error(r.error);
    }
  };

  const removeCandidate = async (name: string) => {
    const r = await window.piswitch.deleteSystemPromptCandidate(name);
    if (r.ok) {
      message.success('已删除模板');
      await load();
    } else {
      message.error(r.error);
    }
  };

  const preview = (c: string) => c.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 2).join(' | ') || '（空）';

  /* ---- 模板文件（斜杠命令等） ---- */
  const scopes: PromptScope[] = ['claude-commands', 'claude-prompts', 'pi-prompts'];

  const openEditFile = async (f: PromptFile) => {
    const content = await window.piswitch.readPromptFile(f.path);
    setEditActive(f.path);
    setEditContent(content);
  };

  const saveFile = async () => {
    if (!editActive || editActive === 'current') return;
    const isSystem = info?.candidates.some((c) => c.name === editActive);
    if (isSystem) {
      const r = await window.piswitch.saveSystemPrompt(editActive, editContent, true);
      if (r.ok) {
        message.success('已保存');
        setEditActive(null);
        await load();
      } else {
        message.error(r.error);
      }
      return;
    }
    const r = await window.piswitch.savePromptFile(editActive, editContent);
    if (r.ok) {
      message.success('已保存');
      setEditActive(null);
      await load();
    } else {
      message.error(r.error);
    }
  };

  const createFile = async () => {
    if (!creating) return;
    const r = await window.piswitch.createPromptFile(creating, newName, `# ${newName}\n\n`);
    if (r.ok) {
      message.success('已创建');
      setCreating(null);
      setNewName('');
      await load();
    } else {
      message.error(r.error);
    }
  };

  const removeFile = async (f: PromptFile) => {
    const r = await window.piswitch.deletePromptFile(f.path);
    if (r.ok) {
      message.success('已删除');
      await load();
    } else {
      message.error(r.error);
    }
  };

  const isTemplateEdit = editActive !== null && editActive !== 'current' && !info?.candidates.some((c) => c.name === editActive);

  return (
    <>
      {/* 系统提示词（Pi） */}
      <div className="ps-card mb16">
        <div className="ps-card-head">
          <span className="ps-card-title">
            <RobotOutlined /> Pi 系统提示词 — 选择启用哪个，管理当前生效的
          </span>
          <Button size="small" icon={<ReloadOutlined />} loading={loading} onClick={() => void load()}>
            刷新
          </Button>
        </div>

        <div style={{ padding: '4px 16px 16px' }}>
          <div className="ps-sysprompt-active">
            <Avatar size={44} icon={<RobotOutlined />} style={{ background: 'var(--ps-accent)', color: '#fff' }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <b>当前生效</b>
                {info?.active ? (
                  <Tag color="blue">{info.active.name || '（未命名，直接编辑）'}</Tag>
                ) : (
                  <Tag color="orange">未设置（使用 pi 默认系统提示词）</Tag>
                )}
              </div>
              <div className="ps-sysprompt-preview" style={{ whiteSpace: 'nowrap', marginBottom: 8 }}>
                {info?.active ? preview(info.active.content) : '在 ~/.pi/agent/SYSTEM.md 中放置自定义系统提示词，或从下方模板启用。'}
              </div>
              <Space>
                <Button size="small" icon={<EditOutlined />} disabled={!info?.active} onClick={() => openEditCurrent(info?.active?.content || '')}>
                  编辑当前
                </Button>
                <Button size="small" icon={<SaveOutlined />} disabled={!info?.active} onClick={() => { setCreateMode('from-current'); setCreateOpen(true); setCreateName(''); setCreateContent(''); }}>
                  保存为模板
                </Button>
              </Space>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '10px 2px 8px' }}>
            <span style={{ fontWeight: 600, fontSize: 13 }}>候选模板（~/.pi/agent/prompts/system-prompts/）</span>
            <Button size="small" type="primary" ghost icon={<PlusOutlined />} onClick={() => { setCreateMode('new'); setCreateOpen(true); setCreateName(''); setCreateContent(''); }}>
              新建模板
            </Button>
          </div>

          {info && info.candidates.length === 0 ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无模板，可先「保存为模板」或「新建模板」" style={{ padding: 16 }} />
          ) : (
            info?.candidates.map((c) => (
              <div key={c.name} className={`ps-sysprompt-cand${c.active ? ' active' : ''}`}>
                <div className="ps-sysprompt-cand-main">
                  <Space size={8}>
                    <b className="mono">{c.name}</b>
                    {c.active && <Tag color="green" icon={<ThunderboltFilled />}>当前启用</Tag>}
                  </Space>
                  <div className="ps-sysprompt-preview">{preview(c.content)}</div>
                </div>
                {!c.active && (
                  <Button size="small" type="primary" ghost onClick={() => void enable(c.name)}>
                    启用
                  </Button>
                )}
                <Button size="small" type="text" icon={<EditOutlined />} onClick={() => openEditCandidate(c.name, c.content)} />
                <Popconfirm title={`删除模板 ${c.name}？`} onConfirm={() => void removeCandidate(c.name)}>
                  <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                </Popconfirm>
              </div>
            ))
          )}
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            「启用」会把模板内容写入 <span className="mono">~/.pi/agent/SYSTEM.md</span>（pi 读取为系统提示词，写入前自动备份）。
          </Typography.Text>
        </div>
      </div>

      {/* 模板提示词文件 */}
      <div className="ps-card">
        <div className="ps-card-head">
          <span className="ps-card-title">
            <FileTextOutlined /> 模板提示词 / 斜杠命令（markdown）
          </span>
          <Button size="small" icon={<ReloadOutlined />} loading={loading} onClick={() => void load()}>
            刷新
          </Button>
        </div>
        <div style={{ padding: '4px 16px 16px' }}>
          {files.length === 0 ? (
            <Empty description="暂无提示词文件" style={{ padding: 24 }} />
          ) : (
            scopes.map((sc) => {
              const group = files.filter((f) => f.scope === sc);
              if (group.length === 0) return null;
              return (
                <div key={sc} style={{ marginBottom: 14 }}>
                  <div className="ps-group-label">{group[0].scopeLabel}</div>
                  <div className="ps-plugin-list">
                    {group.map((f) => (
                      <div key={f.path} className="ps-plugin-item">
                        <span className="mono">{f.name}</span>
                        <Space size={2}>
                          <Button size="small" type="text" icon={<EditOutlined />} onClick={() => void openEditFile(f)} />
                          <Popconfirm title="删除该提示词文件？" onConfirm={() => void removeFile(f)}>
                            <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                          </Popconfirm>
                        </Space>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <Card size="small" style={{ marginTop: 12 }}>
        <Space wrap>
          <span style={{ fontSize: 12.5, color: 'var(--ps-text-dim)' }}>新建提示词到：</span>
          <Segmented
            options={[
              { label: 'Claude 斜杠命令', value: 'claude-commands' },
              { label: 'Claude 提示词', value: 'claude-prompts' },
              { label: 'Pi 提示词模板', value: 'pi-prompts' },
            ]}
            value={creating || 'claude-commands'}
            onChange={(v) => setCreating(v as PromptScope)}
          />
          <Input
            style={{ width: 220 }}
            placeholder="文件名（如 review.md）"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onPressEnter={() => void createFile()}
          />
          <Button size="small" type="primary" icon={<PlusOutlined />} onClick={() => void createFile()}>
            新建
          </Button>
        </Space>
      </Card>

      {/* 编辑当前系统提示词 */}
      <Modal
        title={editActive === 'current' ? '编辑当前系统提示词（SYSTEM.md）' : editActive ? `编辑模板 ${editActive}` : ''}
        open={!!editActive}
        onCancel={() => setEditActive(null)}
        onOk={() => void (isTemplateEdit ? saveFile() : saveEdit())}
        width={700}
        okText="保存"
        okButtonProps={{ disabled: editActive === null }}
      >
        {editActive && (
          <Input.TextArea
            rows={16}
            className="mono"
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
          />
        )}
      </Modal>

      {/* 新建/保存为模板 */}
      <Modal
        title={createMode === 'from-current' ? '保存当前系统提示词为模板' : '新建系统提示词模板'}
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={() => void (createMode === 'from-current' ? saveAsTemplate() : createTemplate())}
        width={640}
        okText="创建"
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Input placeholder="模板名称（如 default / concise / review）" value={createName} onChange={(e) => setCreateName(e.target.value)} />
          <Input.TextArea
            rows={8}
            className="mono"
            placeholder="模板内容（留空则基于当前系统提示词保存）"
            value={createContent}
            onChange={(e) => setCreateContent(e.target.value)}
          />
        </Space>
      </Modal>
    </>
  );
}
