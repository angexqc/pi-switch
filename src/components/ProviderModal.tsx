import React, { useContext, useState } from 'react';
import { Button, Form, Input, InputNumber, Modal, Select, Table, Tooltip, message } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import type { Model, Provider, Tool } from '../../shared/types';
import { ConfigContext } from '../App';
import { API_LABELS, KNOWN_PROVIDERS } from '../constants';
import type { KnownProviderPreset } from '../constants';

const EMPTY_MODEL: Model = { id: '', name: '' };

interface Props {
  tool: Tool;
  open: boolean;
  editing: Provider | null;
  onClose: () => void;
}

export default function ProviderModal({ tool, open, editing, onClose }: Props) {
  const { setConfig } = useContext(ConfigContext);
  const [form] = Form.useForm<Provider>();
  const [saving, setSaving] = useState(false);

  const applyPreset = (kp: KnownProviderPreset) => {
    form.setFieldsValue({
      name: kp.name,
      id: kp.id,
      api: kp.api,
      baseUrl: kp.baseUrl,
      apiKeyLiteral: undefined,
      apiKeyEnv: undefined,
      models: kp.models,
    } as never);
    message.success(`已填充 ${kp.name}（可修改 baseUrl / 模型 / 价格）`);
  };
  const openEdit = () => {
    if (editing) {
      form.resetFields();
      form.setFieldsValue({ ...editing, headers: editing.headers ? JSON.stringify(editing.headers) : undefined } as never);
    } else {
      form.resetFields();
      form.setFieldsValue({ api: 'openai-completions', models: [{ ...EMPTY_MODEL }] } as never);
    }
  };

  const save = async () => {
    const values = await form.validateFields();
    let headers: Record<string, string> | undefined;
    if (typeof values.headers === 'string' && (values.headers as string).trim()) {
      try {
        headers = JSON.parse(values.headers);
      } catch {
        message.error('附加请求头不是合法 JSON');
        return;
      }
    }
    const provider: Provider = {
      ...values,
      models: (values.models || []).filter((m: Model) => m.id.trim()),
      headers,
    };
    setSaving(true);
    try {
      const cfg = editing
        ? await window.piswitch.updateProvider(tool, provider)
        : await window.piswitch.addProvider(tool, provider);
      setConfig(cfg);
      onClose();
      message.success('已保存');
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={editing ? `编辑供应商（${tool}）` : `新增供应商（${tool}）`}
      open={open}
      onOk={save}
      onCancel={onClose}
      confirmLoading={saving}
      width={860}
      destroyOnClose
      afterOpenChange={(o) => o && openEdit()}
    >
      <Form form={form} layout="vertical" initialValues={{ api: 'openai-completions' }}>
        {!editing && (
          <div style={{ marginBottom: 6 }}>
            <div className="ps-group-label">知名供应商预设（点击一键填充，参考 cc-switch）</div>
            <div className="ps-known-grid">
              {KNOWN_PROVIDERS.map((kp) => (
                <div key={kp.id} className="ps-known-chip" onClick={() => applyPreset(kp)} title={`${kp.baseUrl}`}>
                  <span className="ps-known-avatar" style={{ background: kp.color }}>
                    {kp.name.charAt(0)}
                  </span>
                  {kp.name}
                </div>
              ))}
            </div>
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 16px' }}>
          <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入名称' }]}>
            <Input placeholder="如 DeepSeek" />
          </Form.Item>
          <Form.Item
            name="id"
            label="ID（唯一标识）"
            rules={[{ required: true, message: '请输入 ID' }, { pattern: /^[a-zA-Z0-9_-]+$/, message: '仅限字母数字-_' }]}
          >
            <Input disabled={!!editing} placeholder="如 deepseek" />
          </Form.Item>
          <Form.Item name="api" label="API 类型" rules={[{ required: true }]}>
            <Select options={Object.entries(API_LABELS).map(([v, l]) => ({ value: v, label: l }))} />
          </Form.Item>
          <Form.Item name="baseUrl" label="Base URL" rules={[{ required: true, message: '请输入 Base URL' }]}>
            <Input placeholder="https://api.deepseek.com/v1" className="mono" />
          </Form.Item>
          <Form.Item name="apiKeyLiteral" label="API Key（字面量）">
            <Input.Password placeholder="sk-…（与 env 二选一）" autoComplete="new-password" />
          </Form.Item>
          <Form.Item name="apiKeyEnv" label="或环境变量名">
            <Input placeholder="DEEPSEEK_API_KEY" className="mono" />
          </Form.Item>
        </div>
        <Form.Item name="headers" label="附加请求头（JSON，可选）" style={{ marginBottom: 8 }}>
          <Input.TextArea rows={2} placeholder='{"X-Custom": "value"}' className="mono" />
        </Form.Item>

        <Form.List name="models">
          {(fields, { add, remove }) => (
            <>
              <Table
                size="small"
                rowKey={(_, i) => String(i)}
                pagination={false}
                dataSource={fields}
                scroll={{ x: 700 }}
                columns={[
                  {
                    title: '模型 ID *',
                    key: 'id',
                    width: 200,
                    render: (_, f) => (
                      <Form.Item name={[f.name, 'id']} rules={[{ required: true, message: '必填' }]} style={{ margin: 0 }}>
                        <Input placeholder="deepseek-v4-pro" className="mono" />
                      </Form.Item>
                    ),
                  },
                  {
                    title: '显示名 *',
                    key: 'name',
                    width: 170,
                    render: (_, f) => (
                      <Form.Item name={[f.name, 'name']} rules={[{ required: true, message: '必填' }]} style={{ margin: 0 }}>
                        <Input placeholder="DeepSeek V4 Pro" />
                      </Form.Item>
                    ),
                  },
                  {
                    title: '上下文',
                    key: 'ctx',
                    width: 90,
                    render: (_, f) => (
                      <Form.Item name={[f.name, 'contextWindow']} style={{ margin: 0 }}>
                        <InputNumber placeholder="K" style={{ width: '100%' }} min={0} />
                      </Form.Item>
                    ),
                  },
                  {
                    title: '输出上限',
                    key: 'max',
                    width: 90,
                    render: (_, f) => (
                      <Form.Item name={[f.name, 'maxTokens']} style={{ margin: 0 }}>
                        <InputNumber placeholder="上限" style={{ width: '100%' }} min={0} />
                      </Form.Item>
                    ),
                  },
                  {
                    title: '推理',
                    key: 'reason',
                    width: 80,
                    render: (_, f) => (
                      <Form.Item name={[f.name, 'reasoning']} valuePropName="checked" style={{ margin: 0 }}>
                        <Select
                          allowClear
                          placeholder="否"
                          options={[
                            { value: true, label: '是' },
                            { value: false, label: '否' },
                          ]}
                          style={{ width: '100%' }}
                        />
                      </Form.Item>
                    ),
                  },
                  {
                    title: '输入价',
                    key: 'pi',
                    width: 92,
                    render: (_, f) => (
                      <Form.Item name={[f.name, 'priceInput']} style={{ margin: 0 }}>
                        <InputNumber placeholder="$/1M" style={{ width: '100%' }} min={0} step={0.01} />
                      </Form.Item>
                    ),
                  },
                  {
                    title: '输出价',
                    key: 'po',
                    width: 92,
                    render: (_, f) => (
                      <Form.Item name={[f.name, 'priceOutput']} style={{ margin: 0 }}>
                        <InputNumber placeholder="$/1M" style={{ width: '100%' }} min={0} step={0.01} />
                      </Form.Item>
                    ),
                  },
                  {
                    title: '缓存读',
                    key: 'cr',
                    width: 92,
                    render: (_, f) => (
                      <Form.Item name={[f.name, 'priceCacheRead']} style={{ margin: 0 }}>
                        <InputNumber placeholder="$/1M" style={{ width: '100%' }} min={0} step={0.01} />
                      </Form.Item>
                    ),
                  },
                  {
                    title: '缓存写',
                    key: 'cw',
                    width: 92,
                    render: (_, f) => (
                      <Form.Item name={[f.name, 'priceCacheWrite']} style={{ margin: 0 }}>
                        <InputNumber placeholder="$/1M" style={{ width: '100%' }} min={0} step={0.01} />
                      </Form.Item>
                    ),
                  },
                  {
                    title: '',
                    key: 'op',
                    width: 44,
                    render: (_, f) => (
                      <Tooltip title="删除该模型">
                        <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => remove(f.name)} />
                      </Tooltip>
                    ),
                  },
                ]}
              />
              <Button type="dashed" block icon={<PlusOutlined />} onClick={() => add({ ...EMPTY_MODEL })} style={{ marginTop: 8 }}>
                添加模型
              </Button>
            </>
          )}
        </Form.List>
      </Form>
    </Modal>
  );
}
