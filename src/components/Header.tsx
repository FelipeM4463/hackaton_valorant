import React from 'react';

interface HeaderProps {
  selectedTeam: string;
  onSelectTeam: (team: string) => void;
}

export const Header: React.FC<HeaderProps> = ({ selectedTeam, onSelectTeam }) => {
  return (
    <header className="dashboard-header">
      <div className="logo-container">
        <span className="logo-badge">VALO</span>
        <h1 style = {{color: "white"}}>ECONOMIX</h1>
      </div>
      <div className="header-controls">
        <label>Equipe:</label>
        <select value={selectedTeam} onChange={(e) => onSelectTeam(e.target.value)}>
          <option value="Time Alpha">Time Alpha</option>
          <option value="Time Beta">Time Beta</option>
        </select>
      </div>
    </header>
  );
};