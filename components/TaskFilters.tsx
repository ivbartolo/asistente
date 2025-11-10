import React from 'react';
import { Category, Priority } from '../types';
import { SearchIcon } from './Icons';

interface Filters {
  searchTerm: string;
  category: string;
  priority: string;
  status: 'all' | 'pending' | 'completed';
}

interface TaskFiltersProps {
  filters: Filters;
  onFilterChange: (name: keyof Filters, value: string) => void;
}

const TaskFilters: React.FC<TaskFiltersProps> = ({ filters, onFilterChange }) => {
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    onFilterChange(e.target.name as keyof Filters, e.target.value);
  };

  const handleStatusChange = (status: Filters['status']) => {
    onFilterChange('status', status);
  };
  
  const baseSelectClass = "bg-gray-700 border border-gray-600 rounded-lg py-2 px-3 focus:outline-none focus:ring-1 focus:ring-purple-500 transition-all text-white text-sm";
  const statusButtonBase = "px-4 py-2 text-sm font-medium rounded-lg transition-colors flex-1";
  const statusButtonActive = "bg-purple-600 text-white";
  const statusButtonInactive = "bg-gray-700 text-gray-300 hover:bg-gray-600";

  return (
    <div className="p-3 bg-gray-800/50 rounded-xl border border-gray-700/50 mb-4 animate-fade-in">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-center">
        {/* Search */}
        <div className="relative lg:col-span-2">
          <input
            type="text"
            name="searchTerm"
            placeholder="Buscar tarea por descripción..."
            value={filters.searchTerm}
            onChange={handleInputChange}
            className={`${baseSelectClass} w-full pl-10`}
          />
          <SearchIcon className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
        </div>

        {/* Category & Priority Filters */}
        <div className="grid grid-cols-2 gap-4">
            <select
              name="category"
              value={filters.category}
              onChange={handleInputChange}
              className={baseSelectClass}
            >
              <option value="all">Categorías</option>
              {Object.values(Category).map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
            
            <select
              name="priority"
              value={filters.priority}
              onChange={handleInputChange}
              className={baseSelectClass}
            >
              <option value="all">Prioridad</option>
              {Object.values(Priority).map(prio => (
                <option key={prio} value={prio}>{prio.charAt(0).toUpperCase() + prio.slice(1)}</option>
              ))}
            </select>
        </div>


        {/* Status Filter */}
        <div className="flex items-center justify-center bg-gray-700/50 p-1 rounded-lg gap-1">
          <button
            onClick={() => handleStatusChange('pending')}
            className={`${statusButtonBase} ${filters.status === 'pending' ? statusButtonActive : statusButtonInactive}`}
          >
            Pendientes
          </button>
          <button
            onClick={() => handleStatusChange('completed')}
            className={`${statusButtonBase} ${filters.status === 'completed' ? statusButtonActive : statusButtonInactive}`}
          >
            Completadas
          </button>
          <button
            onClick={() => handleStatusChange('all')}
            className={`${statusButtonBase} ${filters.status === 'all' ? statusButtonActive : statusButtonInactive}`}
          >
            Todas
          </button>
        </div>
      </div>
    </div>
  );
};

export default TaskFilters;
