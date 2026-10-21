import React from 'react';

interface HeaderProps {
  selectedTeam: string;
  teams: string[];
  onSelectTeam: (team: string) => void;
}

export const Header: React.FC<HeaderProps> = ({teams, selectedTeam, onSelectTeam }) => {
  return (
    <header className="dashboard-header">
      <div className="logo-container">
        <span className="logo-badge">VALO</span>
        <h1 style = {{color: "white"}}>ECONOMIX</h1>
      </div>
      <div className="header-controls">
        <label>Equipe:</label>
        <select value={selectedTeam} onChange={(e) => onSelectTeam(e.target.value)}>
          {
            teams.map((team) => <option>{team}</option>)
          }
        </select>
      </div>
    </header>
  );
};