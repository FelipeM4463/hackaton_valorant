import React from 'react';
import { LayoutDashboard, Repeat, Cpu } from 'lucide-react';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export const Sidebar: