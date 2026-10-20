import React from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import type{ RoundData } from '../types/match';

interface EconomyChartProps {
  data: RoundData[];
}

export const EconomyChart: React.FC<EconomyChartProps> = ({ data }) => {
  return (
    <div className="chart-card">
      <h3>Investimento por Round (Loadout Value vs. Resultado)</h3>
      <div className="chart-container">
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data} margin={{ top: 20, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2A313A" />
            <XAxis dataKey="roundNum" stroke="#8A96A3" label={{ value: 'Round', position: 'insideBottom', offset: -5, fill: '#8A96A3' }} />
            <YAxis stroke="#8A96A3" />
            <Tooltip
              contentStyle={{ backgroundColor: '#1F2326', borderColor: '#2A313A', color: '#FFF' }}
              formatter={(value: number) => [`$${value.toLocaleString()}`, 'Valor Equipamento']}
              labelFormatter={(label) => `Round ${label}`}
            />
            <Bar
              dataKey="teamLoadoutValue"
              fill="#FF4655"
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};