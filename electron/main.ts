import { app, BrowserWindow, nativeImage } from 'electron';
import path from 'node:path';
import { loadConfig, ensureDataDir } from './switch-engine/app-config';
import { registerIpc, syncProxy } from './ipc';
import { openDb, insertRecords, closeDb } from './stats/db';
import { backfillCosts } from './stats/aggregator';
import { scanAllLogs } from './stats/parsers';
import { createTray, rebuildMenu } from './services/tray';
import { setAutoStart } from './services/autostart';
import { ProxyManager, type ProxyBinding } from './proxy/server';
import { on, emit } from './util/bus';
import { APP_NAME } from './constants';
import { agentProvider, agentModel } from './switch-engine/app-config';
import { applyProfile } from './switch-engine/switch-service';

// 编译产物位于 dist/main/electron/，项目根在其上三级
const ROOT = path.join(__dirname, '..', '..', '..');
const ICON_PATH = path.join(ROOT, 'build', 'icon.png');
const RENDERER_HTML = path.join(ROOT, 'dist', 'renderer', 'index.html');
// 托盘图标：打包后位于 resources/tray.png（extraResources），开发模式在项目 resources/
const TRAY_ICON_PATH = app.isPackaged ? path.join(process.resourcesPath, 'tray.png') : path.join(ROOT, 'resources', 'tray.png');

let mainWindow: BrowserWindow | null = null;
let tray: Electron.Tray | null = null;
let isQuitting = false;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1240,
    height: 800,
    minWidth: 1024,
    minHeight: 680,
    title: APP_NAME,
    icon: ICON_PATH,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webviewTag: true,
    },
  });
  mainWindow.loadFile(RENDERER_HTML);
  mainWindow.on('close', (e) => {
    const cfg = loadConfig();
    if (isQuitting) return;
    const action = cfg.settings.closeAction || 'ask';
    if (action === 'ask') {
      // 弹窗询问（渲染进程处理）
      e.preventDefault();
      mainWindow?.webContents.send('piswitch:close-requested');
    } else if (action === 'minimize') {
      e.preventDefault();
      mainWindow?.hide();
    } else {
      isQuitting = true;
      app.quit();
    }
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // 开发辅助：PS_SHOT 环境变量 → 截图后退出（用于 UI 设计验证）
  if (process.env.PS_SHOT) {
    const shotDir = process.env.PS_SHOT;
    const { mkdirSync, writeFileSync } = require('node:fs') as typeof import('node:fs');
    const pathMod = require('node:path') as typeof import('node:path');
    mainWindow.webContents.on('did-finish-load', () => {
      setTimeout(() => {
        void (async () => {
          try {
            if (process.env.PS_SHOT_NAV) {
              await mainWindow?.webContents.executeJavaScript(
                `document.querySelectorAll('.ps-nav-item')[${Number(process.env.PS_SHOT_NAV)}]?.click()`
              );
              await new Promise((r) => setTimeout(r, 1200));
            }
            if (process.env.PS_SHOT_EVAL) {
              const result = await mainWindow?.webContents.executeJavaScript(process.env.PS_SHOT_EVAL);
              console.log('[shot-eval]', JSON.stringify(result));
            }
            const img = await mainWindow?.webContents.capturePage();
            if (img) {
              mkdirSync(pathMod.dirname(shotDir), { recursive: true });
              writeFileSync(shotDir, img.toPNG());
            }
          } catch (e) {
            console.error('[shot]', (e as Error).message);
          }
          app.quit();
        })();
      }, 2600);
    });
  }
}

function showWindow(): void {
  if (!mainWindow) {
    createWindow();
  } else {
    mainWindow.show();
    mainWindow.focus();
  }
}

function initTray(): void {
  // 使用专用托盘图标（64x64，Windows 自动缩放到托盘尺寸，高分屏清晰）
  const img = nativeImage.createFromPath(TRAY_ICON_PATH);
  const trayIcon = img.isEmpty() ? nativeImage.createFromPath(ICON_PATH).resize({ width: 16, height: 16 }) : img;
  tray = createTray(trayIcon, {
    showWindow,
    applyProfile: (profileId) => {
      void applyProfile(profileId).then(() => rebuildTrayMenu());
    },
    quit,
  });
}

function rebuildTrayMenu(): void {
  if (!tray) return;
  rebuildMenu(tray, {
    showWindow,
    applyProfile: (profileId) => {
      void applyProfile(profileId).then(() => rebuildTrayMenu());
    },
    quit,
  });
}

function quit(): void {
  isQuitting = true;
  app.quit();
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => showWindow());

  app.whenReady().then(async () => {
    ensureDataDir();
    const cfg = loadConfig();
    openDb();
    // 历史记录费用回填（幂等，仅处理 cost_usd IS NULL 且有 token 的记录）
    try {
      backfillCosts();
    } catch {
      /* 回填失败不影响启动 */
    }

    // 开机自启状态对齐
    if (cfg.settings.autoStart) setAutoStart(true);

    // 代理
    const proxyManager = new ProxyManager({
      resolveBinding: (tool): ProxyBinding | undefined => {
        const c = loadConfig();
        const agent = c.agents[tool];
        if (!agent?.providerId) return undefined;
        const p = agentProvider(agent, agent.providerId);
        const m = agentModel(agent, agent.providerId, agent.modelId);
        if (!p) return undefined;
        return {
          tool,
          providerId: p.id,
          modelId: agent.modelId,
          api: p.api,
          upstreamBaseUrl: p.baseUrl,
          model: m
            ? { priceInput: m.priceInput, priceOutput: m.priceOutput, priceCacheRead: m.priceCacheRead, priceCacheWrite: m.priceCacheWrite }
            : undefined,
        };
      },
      onUsage: (record) => {
        insertRecords([record]);
        emit('statsChanged');
      },
    });
    await syncProxy(cfg, proxyManager);

    registerIpc(proxyManager, () => mainWindow);

    // 配置变化 → 通知渲染进程 + 重建托盘
    on('configChanged', () => {
      rebuildTrayMenu();
      mainWindow?.webContents.send('piswitch:config-changed');
    });
    on('statsChanged', () => {
      mainWindow?.webContents.send('piswitch:stats-changed');
    });

    // 自动增量统计：启动 30 秒后首次扫描，之后每 3 分钟一次（日志解析 + 费用回填 + 通知界面）
    const statsScan = (): void => {
      try {
        scanAllLogs();
        backfillCosts();
        emit('statsChanged');
      } catch (e) {
        console.error('[PiSwitch] 自动统计扫描失败:', (e as Error).message);
      }
    };
    setTimeout(statsScan, 30_000);
    setInterval(statsScan, 3 * 60_000);

    createWindow();
    initTray();
  });

  app.on('window-all-closed', () => {
    // 常驻托盘，不退出
  });

  app.on('before-quit', () => {
    isQuitting = true;
  });

  app.on('will-quit', () => {
    closeDb();
  });

  app.on('activate', () => {
    showWindow();
  });
}
