import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
  const [page, setPage] = useState<PageKey>('dashboard');
  const [closeOpen, setCloseOpen] = useState(false);
  const [closeChoice, setCloseChoice] = useState<CloseAction>('minimize');
  const [closeRemember, setCloseRemember] = useState(false);
  const [closeBusy, setCloseBusy] = useState(false);
  const navRef = useRef<HTMLElement | null>(null);
  const indicatorRef = useRef<HTMLSpanElement | null>(null);
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

  // 数字键 1-4 快速切换页面（输入框 / 编辑器中聚焦时不触发）
  useEffect(() => {
    const map: Record<string, PageKey> = { '1': 'dashboard', '2': 'agents', '3': 'stats', '4': 'extensions' };
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const k = map[e.key];
      if (k) setPage(k);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // 侧栏滑动高亮指示器：测量 active 项并定位（须在 if(!config) 之前，保证 hook 数量稳定）
  useLayoutEffect(() => {
    const nav = navRef.current, indicator = indicatorRef.current;
    if (!nav || !indicator) return;
    const active = nav.querySelector('.ps-nav-item.active') as HTMLElement | null;
    if (!active) {
      indicator.style.opacity = '0';
      return;
    }
    indicator.style.opacity = '1';
    indicator.style.transform = `translateY(${active.offsetTop}px)`;
    indicator.style.height = `${active.offsetHeight}px`;
  }, [page, config]);

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
    { key: 'dashboard', icon: <DashboardOutlined />, label: '概览' },
    { key: 'agents', icon: <SlidersOutlined />, label: 'Agent 配置' },
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
          colorPrimary: '#0f6feb',
          colorLink: '#2684ff',
          borderRadius: 6,
          controlHeight: 34,
          colorBgBase: isDark ? '#19191e' : '#f4f5f7',
          colorBgContainer: isDark ? '#202026' : '#ffffff',
          colorBgElevated: isDark ? '#27272e' : '#ffffff',
          colorBorder: isDark ? '#383840' : '#d8dce3',
          colorBorderSecondary: isDark ? '#303037' : '#e6e8ec',
          colorText: isDark ? '#f2f2f4' : '#202127',
          colorTextSecondary: isDark ? '#a1a1aa' : '#626772',
          colorTextTertiary: isDark ? '#71717b' : '#8b919c',
          colorSuccess: '#23b26d',
          colorWarning: '#d99328',
          colorError: '#e45454',
          fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', 'Segoe UI', 'Microsoft YaHei UI', 'Microsoft YaHei', system-ui, sans-serif",
        },
        components: {
          Button: { primaryShadow: 'none', defaultShadow: 'none' },
          Tabs: { inkBarColor: '#0f6feb', itemSelectedColor: isDark ? '#f2f2f4' : '#202127' },
          Table: { headerBg: isDark ? '#26262c' : '#f1f2f4', rowHoverBg: isDark ? '#27272e' : '#f7f8fa' },
          Modal: { contentBg: isDark ? '#202026' : '#ffffff' },
          Segmented: { itemSelectedBg: '#0f6feb', itemSelectedColor: '#ffffff' },
        },
      }}
    >
      <AntApp>
        <ConfigContext.Provider value={ctx}>
          <div className="ps-app-shell" data-theme={isDark ? 'dark' : 'light'}>
            <div className="ps-shell-inner">
              <aside className="ps-sider">
                <div className="ps-brand">
                  <div className="ps-brand-mark">
                    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                      <path d="M12 2v20M3.34 7l17.32 10M20.66 7L3.34 17" />
                      <path d="M12 5.7l-1.9 1.9M12 5.7l1.9 1.9M12 18.3l-1.9-1.9M12 18.3l1.9-1.9" />
                      <path d="M6.9 8.55L5.1 9.6M6.9 8.55l2 1.15M17.1 8.55l1.8 1.05M17.1 8.55l-2 1.15M17.1 15.45l1.8-1.05M17.1 15.45l-2-1.15M6.9 15.45L5.1 14.4M6.9 15.45l2-1.15" />
                    </svg>
                  </div>
                  <div>
                    <div className="ps-brand-name">PiSwitch</div>
                    <div className="ps-brand-sub">Agent Console</div>
                  </div>
                </div>
                <nav className="ps-nav" ref={navRef}>
                  <span className="ps-nav-indicator" ref={indicatorRef} aria-hidden="true" />
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
