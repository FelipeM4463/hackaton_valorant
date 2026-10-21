import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  Cell,
  Legend
} from 'recharts';

interface RoundData {
  roundNum: number;
  totalLoadoutValue: number;
  buyType: string;
  won: boolean;
  winningTeam: string;
}

interface EconomyChartProps {
  data: RoundData[];
}

export const EconomyChart: React.FC<EconomyChartProps> = ({ data }) => {
  // Dados formatados com rotulo de vitória/derrota para renderização na legenda lateral
  const formattedData = data.map((item) => ({
    ...item,
    Resultado: item.won ? 'Vitória' : 'Derrota'
  }));

  return (
    <div style={{ width: '100%', height: 450, backgroundColor: '#111827', padding: '20px', borderRadius: '8px' }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={formattedData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis dataKey="roundNum" stroke="#9ca3af" label={{ value: 'Round', position: 'insideBottom', offset: -10, fill: '#9ca3af' }} />
          <YAxis stroke="#9ca3af" tickFormatter={(val) => `$${val.toLocaleString()}`} />
          <Tooltip
            contentStyle={{ backgroundColor: '#1f2937', borderColor: '#374151', color: '#fff' }}
            formatter={(value: number, name: string, item: any) => [
              `$${value.toLocaleString()} (${item.payload.buyType})`,
              item.payload.won ? 'Vitória' : 'Derrota'
            ]}
            labelFormatter={(label) => `Round ${label}`}
          />
          <Bar dataKey="totalLoadoutValue" radius={[4, 4, 0, 0]}>
            {formattedData.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={entry.won ? '#00e5a3' : '#ff4655'} // Verde Ciano para Vitória, Vermelho para Derrota
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};