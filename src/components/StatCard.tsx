import React from 'react';
import { Card, Statistic } from 'antd';

interface Props {
  title: string;
  value: React.ReactNode;
  suffix?: string;
  precision?: number;
  color?: string;
  extra?: React.ReactNode;
}

export default function StatCard({ title, value, suffix, precision, color, extra }: Props) {
  return (
    <Card size="small">
      <Statistic
        title={title}
        value={value as never}
        suffix={suffix}
        precision={precision}
        valueStyle={color ? { color } : undefined}
      />
      {extra}
    </Card>
  );
}
