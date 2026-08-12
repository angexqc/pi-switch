import React from 'react';

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * 渲染错误边界：任何页面渲染异常时显示可恢复的兜底界面，
 * 避免 React 卸载整棵组件树导致白屏。
 */
export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('[PiSwitch] 渲染异常:', error, info.componentStack);
  }

  private reload = (): void => {
    this.setState({ error: null });
    window.location.reload();
  };

  render(): React.ReactNode {
    if (this.state.error) {
      return (
        <div
          style={{
            height: '100%',
            minHeight: 360,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            padding: 24,
            color: 'var(--ps-text-dim)',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 40 }}>⚠️</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--ps-text)' }}>页面渲染出错</div>
          <div style={{ maxWidth: 560, fontSize: 12, wordBreak: 'break-all', opacity: 0.75 }}>{this.state.error.message}</div>
          <button
            onClick={this.reload}
            style={{
              marginTop: 8,
              padding: '6px 18px',
              borderRadius: 8,
              border: '1px solid var(--ps-border)',
              background: 'var(--ps-bg-elevated)',
              color: 'var(--ps-text)',
              cursor: 'pointer',
            }}
          >
            重新加载
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
