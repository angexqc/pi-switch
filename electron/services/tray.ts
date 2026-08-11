import { Tray, Menu, type NativeImage } from 'electron';
import { TOOLS, TOOL_LABELS, APP_NAME } from '../constants';
import { loadConfig } from '../switch-engine/app-config';

export interface TrayActions {
  showWindow: () => void;
  applyProfile: (profileId: string) => void;
  quit: () => void;
}

export function createTray(icon: NativeImage, actions: TrayActions): Tray {
  const tray = new Tray(icon);
  tray.setToolTip(APP_NAME);
  rebuildMenu(tray, actions);
  return tray;
}

export function rebuildMenu(tray: Tray, actions: TrayActions): void {
  const cfg = loadConfig();
  const profiles = cfg.profiles;
  const template: Electron.MenuItemConstructorOptions[] = [
    { label: `打开 ${APP_NAME}`, click: () => actions.showWindow() },
  ];
  if (profiles.length) {
    template.push({ type: 'separator' });
    template.push({
      label: '快捷切换 Profile',
      submenu: profiles.map((p) => ({
        label: p.name,
        click: () => actions.applyProfile(p.id),
      })),
    });
  }
  template.push(
    { type: 'separator' },
    { label: '退出', click: () => actions.quit() }
  );
  tray.setContextMenu(Menu.buildFromTemplate(template));
}

export { TOOLS, TOOL_LABELS };
