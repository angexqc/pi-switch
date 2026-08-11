import { app } from 'electron';

/** 设置/取消开机自启（Windows: HKCU Run） */
export function setAutoStart(enabled: boolean): void {
  try {
    app.setLoginItemSettings({ openAtLogin: enabled, path: process.execPath });
  } catch (e) {
    console.error('[PiSwitch] 设置开机自启失败:', (e as Error).message);
  }
}

export function isAutoStart(): boolean {
  try {
    return app.getLoginItemSettings().openAtLogin;
  } catch {
    return false;
  }
}
