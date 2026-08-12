import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import ErrorBoundary from '../src/components/ErrorBoundary';

describe('ErrorBoundary', () => {
  it('getDerivedStateFromError 记录错误，触发兜底渲染分支', () => {
    const err = new Error('boom: render crashed');
    const state = ErrorBoundary.getDerivedStateFromError(err);
    expect(state.error).toBe(err);
  });

  it('存在错误时渲染兜底界面（页面渲染出错 + 重新加载）而非白屏', () => {
    const inst = new ErrorBoundary({ children: null });
    inst.state = { error: new Error('boom: render crashed') };
    const html = renderToString(inst.render() as React.ReactElement);
    expect(html).toContain('页面渲染出错');
    expect(html).toContain('boom: render crashed');
    expect(html).toContain('重新加载');
  });

  it('无错误时正常渲染子内容，不受影响', () => {
    const child = React.createElement('div', null, '正常内容');
    const inst = new ErrorBoundary({ children: child });
    inst.state = { error: null };
    expect(inst.render()).toBe(child);
  });
});
