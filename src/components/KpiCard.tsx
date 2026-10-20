import React from 'react';

interface KpiCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  colorClass?: string;
}

export const KpiCard: React.FC<KpiCardProps> = ({ title, value, subtitle, icon, colorClass = '' }) => {
  return (
    <div className={`kpi-card ${colorClass}`}>
      <div className="kpi-icon">{icon}</div>
      <div className="kpi-content">
        <span className="kpi-title">{title}</span>
        <h2 style = {{color: "white"}} className="kpi-value">{value}</h2>
        {subtitle && <span className="kpi-subtitle">{subtitle}</span>}
      </div>
    </div>
  );
};