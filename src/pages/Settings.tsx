import React, { useContext, useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Descriptions,
  Input,
  InputNumber,
  List,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import {
  CloudDownloadOutlined,
  DeleteOutlined,
  FolderOpenOutlined,
  ImportOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import type { BackupEntry, CloseAction, ImportSourcePreview, Tool } from '../../shared/types';
import { ConfigContext } from '../App';
import { TOOL_LABELS, fmtTime } from '../constants';

const TOOLS: Tool[] = ['pi', 'codex', 'claude', 'opencode'];

export default function Settings() {
  const { config, setConfig } = useContext(ConfigContext);
  const [backups, setBackups] = useState<BackupEntry[]>([]);
  const [paths, setPaths] = useState<{ dataDir: string; piswitchOldDir?: string } | null>(null);
  const [preview, setPreview] = useState<{ id: string; name: string; models: number }[] | null>(null);
  // 配置导入（cc-switch / 工具自身配置）
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importSources, setImportSources] = useState<ImportSourcePreview[]>([]);
  const [importScanning, setImportScanning] = useState(false);
  const [importing, setImporting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [hasOld, setHasOld] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);

  const load = () => {
    window.piswitch.getBackups().then(setBackups).catch(() => undefined);
    window.piswitch.getPaths().then(setPaths).catch(() => undefined);
    window.piswitch.hasOldPiswitch().then(setHasOld).catch(() => undefined);
  };

  useEffect(() => {
    load();
  }, []);

  const set = async <K extends keyof typeof config.settings>(key: K, value: (typeof config.settings)[K]) => {
    const cfg = await window.piswitch.setSetting(key, value);
    setConfig(cfg);
  };

  const pickDir = async (key: 'cliPaths' | 'workingDirs', tool: Tool) => {
    const dir = await window.piswitch.pickDirectory();
    if (!dir) return;
    const cfg = await window.piswitch.setSetting(key, { ...config.settings[key], [tool]: dir } as never);
    setConfig(cfg);
  };

  const importPiswitch = async (apply: boolean) => {
    const r = await window.piswitch.importFromPiswitch(apply);
    message.success(`导入完成：${r.importedProviders} 个供应商，${r.importedModels} 个模型${r.bindingsApplied ? '，已应用到所有工具' : ''}`);
    if (r.errors.length) message.warning(r.errors.join('；'));
    load();
  };

  /** 扫描并打开导入预览（回显各来源的供应商/模型） */
  const openImportModal = async () => {
    setImportScanning(true);
    setImportModalOpen(true);
    try {
      const sources = await window.piswitch.scanImportSources();
      setImportSources(sources);
      // 默认勾选全部可导入供应商
      setSelectedIds(sources.flatMap((s) => s.providers.map((p) => p.id)));
    } finally {
      setImportScanning(false);
    }
  };

  const applyImports = async (key: 'ccs' | 'codex' | 'claude') => {
    const src = importSources.find((s) => s.key === key);
    if (!src) return;
    const ids = selectedIds.filter((id) => src.providers.some((p) => p.id === id));
    if (!ids.length) {
      message.info('请先勾选要导入的供应商');
      return;
    }
    setImporting(true);
    try {
      const r = await window.piswitch.applyImportSource(key, ids);
      message.success(`已导入 ${r.importedProviders} 个供应商、${r.importedModels} 个模型`);
      if (r.errors.length) message.warning(r.errors.join('；'));
      setImportModalOpen(false);
      load();
    } finally {
      setImporting(false);
    }
  };

  const restore = async (entry: BackupEntry) => {
    setRestoring(entry.path);
    try {
      const r = await window.piswitch.restoreBackup(entry);
      if (r.ok) {
        message.success(`已从备份还原 ${TOOL_LABELS[entry.tool]} 配置`);
        load();
      } else {
        message.error(`还原失败：${r.error}`);
      }
    } finally {
      setRestoring(null);
    }
  };

  return (
    <div className="page">
      <div className="page-title">
        <div>
          <div className="title">设置</div>
          <div className="title-desc">外观、关闭行为、代理端口、备份与数据</div>
        </div>
      </div>

      <div className="card-grid card-grid-2">
        <Card title="外观与行为" size="small">
          <Space direction="vertical" style={{ width: '100%' }}>
            <div className="ps-binding-row">
              <span className="ps-bind-label">主题</span>
              <Select
                style={{ width: 160 }}
                value={config.settings.theme}
                options={[
                  { value: 'system', label: '跟随系统' },
                  { value: 'dark', label: '深色' },
                  { value: 'light', label: '浅色' },
                ]}
                onChange={(v) => set('theme', v)}
              />
            </div>
            <div className="ps-binding-row">
              <span className="ps-bind-label">点击关闭</span>
              <Select
                style={{ width: 200 }}
                value={config.settings.closeAction}
                options={[
                  { value: 'ask', label: '每次询问（关闭/最小化）' },
                  { value: 'minimize', label: '最小化到托盘' },
                  { value: 'exit', label: '直接退出' },
                ]}
                onChange={(v) => set('closeAction', v as CloseAction)}
              />
            </div>
            <div className="ps-binding-row">
              <span className="ps-bind-label">最小化到托盘</span>
              <Switch checked={config.settings.minimizeToTray} onChange={(v) => set('minimizeToTray', v)} />
            </div>
            <div className="ps-binding-row">
              <span className="ps-bind-label">开机自启</span>
              <Switch checked={config.settings.autoStart} onChange={(v) => set('autoStart', v)} />
            </div>
            <div className="ps-binding-row">
              <span className="ps-bind-label">备份保留</span>
              <InputNumber
                min={1}
                max={200}
                value={config.settings.backupRetention}
                onChange={(v) => v && set('backupRetention', v)}
              />
              <span style={{ fontSize: 12, color: 'var(--ps-text-faint)' }}>份 / 每工具</span>
            </div>
          </Space>
        </Card>

        <Card title="精确统计（本地代理）" size="small">
          <Alert
            type="warning"
            showIcon
            style={{ marginBottom: 12 }}
            message="在「Agent 配置」中为工具打开「精确统计」即自动启用全局代理并应用。"
          />
          <Space direction="vertical" style={{ width: '100%' }}>
            <div className="ps-binding-row">
              <span className="ps-bind-label">全局代理</span>
              <Switch checked={config.settings.proxy.enabled} onChange={(v) => set('proxy', { ...config.settings.proxy, enabled: v })} />
              <span style={{ fontSize: 12, color: 'var(--ps-text-faint)' }}>仅监听 127.0.0.1</span>
            </div>
            <div className="ps-port-grid">
              {TOOLS.map((t) => (
                <div className="ps-binding-row" key={t}>
                  <span className="ps-bind-label">{TOOL_LABELS[t]} 端口</span>
                  <InputNumber
                    min={1024}
                    max={65535}
                    style={{ width: 110 }}
                    value={config.settings.proxy.ports[t]}
                    onChange={(v) => v && set('proxy', { ...config.settings.proxy, ports: { ...config.settings.proxy.ports, [t]: v } })}
                  />
                </div>
              ))}
            </div>
          </Space>
        </Card>
      </div>

      <Card title="工具 CLI 路径与工作目录" size="small" className="mb16">
        <Table
          className="ps-settings-table"
          size="small"
          rowKey="t"
          pagination={false}
          dataSource={TOOLS.map((t) => ({ t }))}
          columns={[
            {
              title: '工具',
              dataIndex: 't',
              width: 90,
              render: (t: Tool) => <b>{TOOL_LABELS[t]}</b>,
            },
            {
              title: 'CLI 路径',
              dataIndex: 't',
              render: (t: Tool) => (
                <Input
                  value={config.settings.cliPaths[t]}
                  placeholder={t}
                  onChange={(e) => set('cliPaths', { ...config.settings.cliPaths, [t]: e.target.value })}
                />
              ),
            },
            {
              title: '工作目录',
              dataIndex: 't',
              render: (t: Tool) => (
                <Input
                  value={config.settings.workingDirs[t]}
                  placeholder="留空用当前目录"
                  onChange={(e) => set('workingDirs', { ...config.settings.workingDirs, [t]: e.target.value })}
                />
              ),
            },
            {
              title: '',
              dataIndex: 't',
              width: 96,
              render: (t: Tool) => (
                <Button icon={<FolderOpenOutlined />} onClick={() => pickDir('workingDirs', t)}>
                  选择
                </Button>
              ),
            },
          ]}
        />
      </Card>

      <Card title="数据导入" size="small" className="mb16">
        <div className="ps-import-block">
          <div className="ps-import-title">旧版 .piswitch 数据</div>
          {hasOld ? (
            <Space direction="vertical" style={{ width: '100%' }}>
              <Alert
                type="info"
                showIcon
                message="检测到旧版 ~/.piswitch/config.json"
                description="可将已有的供应商与模型（含 API Key）一次性导入到全部 Agent。"
              />
              <Space wrap>
                <Button icon={<CloudDownloadOutlined />} onClick={() => importPiswitch(false)}>
                  仅导入供应商
                </Button>
                <Button type="primary" icon={<CloudDownloadOutlined />} onClick={() => importPiswitch(true)}>
                  导入并应用到所有工具
                </Button>
                <Button onClick={() => window.piswitch.previewImport().then(setPreview)}>预览</Button>
              </Space>
              {preview && (
                <List
                  size="small"
                  bordered
                  dataSource={preview}
                  renderItem={(p) => (
                    <List.Item>
                      <Tag color="blue">{p.name}</Tag>
                      <span className="mono">{p.id}</span>
                      <span style={{ opacity: 0.6 }}>{p.models} 个模型</span>
                    </List.Item>
                  )}
                />
              )}
            </Space>
          ) : (
            <Typography.Text type="secondary">未检测到旧版配置（~/.piswitch/config.json）</Typography.Text>
          )}
        </div>
        <div className="ps-import-block">
          <div className="ps-import-title">cc-switch / 工具自身配置</div>
          <Space direction="vertical" style={{ width: '100%' }}>
            <Alert
              type="info"
              showIcon
              message="从 cc-switch 或系统内已有配置反向导入"
              description="可从 cc-switch 数据库、Codex 自身 config.toml、Claude Code 自身 settings.json 读取已有供应商与模型（含密钥），导入到对应 Agent 的供应商库。导入前可预览回显。"
            />
            <Button type="primary" icon={<ImportOutlined />} onClick={openImportModal} loading={importScanning}>
              扫描导入来源
            </Button>
          </Space>
        </div>
      </Card>

      <Modal
        title="导入配置预览"
        open={importModalOpen}
        width={760}
        onCancel={() => setImportModalOpen(false)}
        footer={[
          <Button key="c" onClick={() => setImportModalOpen(false)}>
            取消
          </Button>,
          ...importSources.map((s) => (
            <Button
              key={s.key}
              type="primary"
              loading={importing}
              disabled={!s.providers.length}
              onClick={() => applyImports(s.key)}
            >
              导入{s.label === 'cc-switch' ? ' cc-switch' : s.key === 'codex' ? ' Codex' : ' Claude'}
            </Button>
          )),
        ]}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          {importSources.map((s) => (
            <div key={s.key} className="import-source-block">
              <Typography.Title level={5} style={{ margin: 0 }}>
                {s.label}
                <Typography.Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>
                  {s.sourcePath}
                </Typography.Text>
              </Typography.Title>
              {s.providers.length === 0 ? (
                <Typography.Text type="secondary">未发现可导入的供应商</Typography.Text>
              ) : (
                <List
                  size="small"
                  bordered
                  dataSource={s.providers}
                  renderItem={(p) => {
                    const checked = selectedIds.includes(p.id);
                    return (
                      <List.Item
                        actions={[
                          <Checkbox
                            key="chk"
                            checked={checked}
                            onChange={(e) =>
                              setSelectedIds((prev) =>
                                e.target.checked ? [...prev, p.id] : prev.filter((x) => x !== p.id)
                              )
                            }
                          >
                            导入
                          </Checkbox>,
                        ]}
                      >
                        <Space direction="vertical" size={0}>
                          <Space>
                            <Tag color="blue">{p.name}</Tag>
                            <span className="mono">{p.id}</span>
                          </Space>
                          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                            <span className="mono">{p.baseUrl || '(未设置 Base URL)'}</span>
                            {p.apiKeyMasked ? ` · 密钥 ${p.apiKeyMasked}` : ''} · {p.models.length} 个模型
                            {p.models.length ? `（${p.models.slice(0, 4).map((m) => m.id).join(', ')}${p.models.length > 4 ? '…' : ''}）` : ''}
                          </Typography.Text>
                        </Space>
                      </List.Item>
                    );
                  }}
                />
              )}
            </div>
          ))}
        </Space>
      </Modal>

      <div className="card-grid card-grid-2">
        <Card title="配置备份与还原" size="small">
          <Space direction="vertical" style={{ width: '100%' }}>
            <Button icon={<ReloadOutlined />} onClick={load}>
              刷新备份列表
            </Button>
            {backups.length === 0 && <Typography.Text type="secondary">暂无备份（应用配置时自动创建）</Typography.Text>}
            <List
              size="small"
              bordered
              dataSource={backups.slice(0, 20)}
              renderItem={(b) => (
                <List.Item
                  actions={[
                    <Popconfirm
                      key="r"
                      title={`还原 ${TOOL_LABELS[b.tool]} 配置？当前配置会先备份。`}
                      onConfirm={() => restore(b)}
                    >
                      <Button size="small" loading={restoring === b.path}>
                        还原
                      </Button>
                    </Popconfirm>,
                  ]}
                >
                  <Tag color="blue">{TOOL_LABELS[b.tool]}</Tag>
                  <span className="mono" style={{ marginRight: 8 }}>
                    {fmtTime(b.timestamp)}
                  </span>
                  <span style={{ opacity: 0.6 }}>{(b.size / 1024).toFixed(1)} KB</span>
                </List.Item>
              )}
            />
          </Space>
        </Card>

        <Card title="数据目录" size="small">
          <Descriptions
            size="small"
            column={1}
            items={[
              { key: 'd', label: '应用数据目录', children: <span className="mono">{paths?.dataDir || '-'}</span> },
              {
                key: 'o',
                label: '旧 .piswitch',
                children: paths?.piswitchOldDir ? <span className="mono">{paths.piswitchOldDir}</span> : '未检测到',
              },
            ]}
          />
          <Space style={{ marginTop: 8 }}>
            <Button icon={<FolderOpenOutlined />} onClick={() => window.piswitch.openDataDir()}>
              打开数据目录
            </Button>
            <Button danger icon={<DeleteOutlined />} disabled>
              清空统计（开发中）
            </Button>
          </Space>
        </Card>
      </div>
    </div>
  );
}
