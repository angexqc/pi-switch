import { describe, expect, it } from 'vitest';
import { compareVersions, extractVersion } from '../electron/services/updater';

describe('extractVersion', () => {
  it('从纯版本号提取', () => {
    expect(extractVersion('0.84.1')).toBe('0.84.1');
  });
  it('从带前缀/后缀的输出提取', () => {
    expect(extractVersion('codex-cli 0.147.0')).toBe('0.147.0');
    expect(extractVersion('2.1.226 (Claude Code)')).toBe('2.1.226');
    expect(extractVersion('pi version 1.2.3-beta.1')).toBe('1.2.3-beta.1');
  });
  it('无版本号返回 undefined', () => {
    expect(extractVersion('command not found')).toBeUndefined();
    expect(extractVersion('')).toBeUndefined();
  });
});

describe('compareVersions', () => {
  it('数值逐段比较', () => {
    expect(compareVersions('0.84.1', '0.85.0')).toBe(-1);
    expect(compareVersions('2.1.226', '2.1.225')).toBe(1);
    expect(compareVersions('1.17.20', '1.17.20')).toBe(0);
    expect(compareVersions('0.147.0', '0.147.10')).toBe(-1);
  });
  it('预发布低于正式版', () => {
    expect(compareVersions('1.0.0-beta.1', '1.0.0')).toBe(-1);
    expect(compareVersions('1.0.0', '1.0.0-beta.1')).toBe(1);
    expect(compareVersions('1.0.0-rc.1', '1.0.0-beta.2')).toBe(1);
  });
  it('位数不同的版本', () => {
    expect(compareVersions('1.0', '1.0.1')).toBe(-1);
    expect(compareVersions('1.0.1', '1.0')).toBe(1);
  });
});
