import React, { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { ConfigProvider, theme as antdTheme, App as AntApp, Modal, Radio, Checkbox, message } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import {
  DashboardOutlined,
  SwapOutlined,
  BarChartOutlined,
  SettingOutlined,
  SlidersOutlined,
  SunOutlined,
  MoonOutlined,
  AppstoreOutlined,
} from '@ant-design/icons';
import type { AppConfig, CloseAction } from '../shared/types';
import Dashboard from './pages/Dashboard';
import Agents from './pages/Agents';
import Stats from './pages/Stats';
import Settings from './pages/Settings';
import Extensions from './pages/Extensions';
import ErrorBoundary from './components/ErrorBoundary';
type PageKey = 'agents' | 'dashboard' | 'stats' | 'extensions' | 'settings';

export const ConfigContext = React.createContext<{
  config: AppConfig;
  setConfig: (c: AppConfig) => void;
}>({ config: null as never, setConfig: () => undefined });

export default function App() {
  const [config, setConfigState] = useState<AppConfig | null>(null);
  const [page, setPage] = useState<PageKey>('agents');
  const [closeOpen, setCloseOpen] = useState(false);
  const [closeChoice, setCloseChoice] = useState<CloseAction>('minimize');
  const [closeRemember, setCloseRemember] = useState(false);
  const [closeBusy, setCloseBusy] = useState(false);

  useEffect(() => {
    window.piswitch.getConfig().then(setConfigState);
    const off = window.piswitch.onConfigChanged((c) => setConfigState(c));
    const offClose = window.piswitch.onCloseRequested(() => {
      setCloseChoice('minimize');
      setCloseRemember(false);
      setCloseOpen(true);
    });
    return () => {
      off();
      offClose();
    };
  }, []);

  const setConfig = (c: AppConfig) => setConfigState(c);

  const toggleTheme = async () => {
    try {
      const next = isDark ? 'light' : 'dark';
      const cfg = await window.piswitch.setSetting('theme', next);
      setConfigState(cfg);
    } catch {
      /* 忽略主题保存失败 */
    }
  };

  const isDark = useMemo(() => {
    if (!config) return true;
    if (config.settings.theme === 'system') {
      return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true;
    }
    return config.settings.theme === 'dark';
  }, [config]);

  // 同步主题到 <html>：antd Modal / Select 下拉等 portal 渲染在 body 下，
  // 若 data-theme 只挂在 .ps-app-shell 上，浅色模式下弹窗仍继承 :root 深色变量
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = isDark ? 'dark' : 'light';
  }, [isDark]);

  const confirmClose = async () => {
    setCloseBusy(true);
    try {
      if (closeRemember) {
        await window.piswitch.setSetting('closeAction', closeChoice);
      }
      if (closeChoice === 'minimize') {
        await window.piswitch.hideWindow();
      } else {
        await window.piswitch.exitApp();
      }
      setCloseOpen(false);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setCloseBusy(false);
    }
  };

  if (!config) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--ps-bg)', color: 'var(--ps-text-dim)' }}>
        加载中…
      </div>
    );
  }

  const navItems: { key: PageKey; icon: React.ReactNode; label: string }[] = [
    { key: 'agents', icon: <SlidersOutlined />, label: 'Agent 配置' },
    { key: 'dashboard', icon: <DashboardOutlined />, label: '概览' },
    { key: 'stats', icon: <BarChartOutlined />, label: '用量统计' },
    { key: 'extensions', icon: <AppstoreOutlined />, label: '扩展中心' },
  ];

  const ctx = { config, setConfig };

  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        token: {
          colorPrimary: isDark ? '#35d0ba' : '#0f9d8a',
          colorLink: isDark ? '#35d0ba' : '#0f9d8a',
          borderRadius: 8,
          colorBgBase: isDark ? '#0a0e13' : '#f2f5f7',
          colorBgContainer: isDark ? '#10161d' : '#ffffff',
          colorBgElevated: isDark ? '#141c25' : '#ffffff',
          colorBorder: isDark ? '#1e2a36' : '#dbe4ea',
          colorBorderSecondary: isDark ? '#1a2430' : '#e6edf2',
          colorText: isDark ? '#dbe6ee' : '#18222c',
          colorTextSecondary: isDark ? '#8394a3' : '#5b6b79',
          colorTextTertiary: isDark ? '#5c6b79' : '#8b99a5',
          colorSuccess: '#5ee08a',
          colorWarning: '#f5b942',
          colorError: '#ff6b6b',
          fontFamily: "'Segoe UI Variable Text', 'Segoe UI', 'Microsoft YaHei UI', 'Microsoft YaHei', system-ui, sans-serif",
        },
        components: {
          Tabs: { inkBarColor: isDark ? '#35d0ba' : '#0f9d8a', itemSelectedColor: isDark ? '#dbe6ee' : '#18222c' },
          Table: { headerBg: isDark ? '#141c25' : '#f7fafb' },
          Modal: { contentBg: isDark ? '#10161d' : '#ffffff' },
        },
      }}
    >
      <AntApp>
        <ConfigContext.Provider value={ctx}>
          <div className="ps-app-shell" data-theme={isDark ? 'dark' : 'light'}>
            <div className="ps-shell-inner">
              <aside className="ps-sider">
                <div className="ps-brand">
                  <div className="ps-brand-mark">P</div>
                  <div>
                    <div className="ps-brand-name">PiSwitch</div>
                    <div className="ps-brand-sub">Agent Console</div>
                  </div>
                </div>
                <nav className="ps-nav">
                  {navItems.map((n) => (
                    <button
                      key={n.key}
                      className={`ps-nav-item${page === n.key ? ' active' : ''}`}
                      onClick={() => setPage(n.key)}
                    >
                      {n.icon}
                      <span>{n.label}</span>
                    </button>
                  ))}
                </nav>
                <div className="ps-sider-foot">
                  <div className="ps-foot-actions">
                    <button
                      className={`ps-side-btn${page === 'settings' ? ' active' : ''}`}
                      onClick={() => setPage('settings')}
                      title="设置"
                    >
                      <SettingOutlined />
                      <span>设置</span>
                    </button>
                    <button
                      className="ps-side-btn"
                      onClick={toggleTheme}
                      title={isDark ? '切换浅色模式' : '切换深色模式'}
                    >
                      {isDark ? <SunOutlined /> : <MoonOutlined />}
                      <span>{isDark ? '浅色模式' : '深色模式'}</span>
                    </button>
                  </div>
                </div>
              </aside>

              <main className="ps-main">
                <div className="ps-content">
                  <ErrorBoundary>
                    {page === 'agents' && <Agents />}
                    {page === 'dashboard' && <Dashboard />}
                    {page === 'stats' && <Stats />}
                    {page === 'extensions' && <Extensions />}
                    {page === 'settings' && <Settings />}
                  </ErrorBoundary>
                </div>
              </main>
            </div>

            <Modal
              title="关闭 PiSwitch？"
              open={closeOpen}
              onOk={confirmClose}
              onCancel={() => setCloseOpen(false)}
              okText="确定"
              cancelText="取消"
              confirmLoading={closeBusy}
              okButtonProps={{ danger: closeChoice === 'exit' }}
              width={440}
              centered
            >
              <p style={{ color: 'var(--ps-text-dim)', marginBottom: 16 }}>
                选择关闭窗口后的行为。PiSwitch 将持续在系统托盘常驻，随时可重新打开。
              </p>
              <Radio.Group
                value={closeChoice}
                onChange={(e) => setCloseChoice(e.target.value as CloseAction)}
                style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
              >
                <Radio value="minimize">
                  <b>最小化到托盘</b>
                  <span style={{ color: 'var(--ps-text-faint)', marginLeft: 8 }}>应用继续在后台运行</span>
                </Radio>
                <Radio value="exit">
                  <b>完全退出</b>
                  <span style={{ color: 'var(--ps-text-faint)', marginLeft: 8 }}>停止代理与后台服务</span>
                </Radio>
              </Radio.Group>
              <Checkbox checked={closeRemember} onChange={(e) => setCloseRemember(e.target.checked)} style={{ marginTop: 18 }}>
                记住我的选择，下次不再询问
              </Checkbox>
            </Modal>
          </div>
        </ConfigContext.Provider>
      </AntApp>
    </ConfigProvider>
  );
}
