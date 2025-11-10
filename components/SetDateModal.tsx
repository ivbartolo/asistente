import React, { useState } from 'react';
import { Task } from '../types';

interface SetDateModalProps {
  task: Task;
  onSave: (taskId: string, date: string) => void;
  onCancel: () => void;
}

const SetDateModal: React.FC<SetDateModalProps> = ({ task, onSave, onCancel }) => {
  // FIX: Use a helper function or inline logic to get the local date string,
  // preventing timezone bugs that occur with `new Date().toISOString()`.
  const getLocalDateString = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // The input type="date" requires YYYY-MM-DD format.
  const [date, setDate] = useState(task.dueDate || getLocalDateString(new Date()));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(task.id, date);
  };

  const formElementClass = "w-full bg-gray-700 border border-gray-600 rounded-lg py-2 px-3 focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all text-white";

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <h2 className="text-xl font-bold text-white mb-2">Establecer Fecha de Vencimiento</h2>
      <p className="text-sm text-gray-400 mb-4">Para la tarea: "{task.description}"</p>
      <div>
        <label htmlFor="dueDate" className="block text-sm font-medium text-gray-400 mb-1">
          Fecha
        </label>
        <input
          id="dueDate"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className={formElementClass}
          required
        />
      </div>
      <div className="flex justify-end gap-3 pt-4">
        <button
          type="button"
          onClick={onCancel}
          className="bg-gray-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-gray-700 transition-colors"
        >
          Cancelar
        </button>
        <button
          type="submit"
          className="bg-purple-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-purple-700 transition-colors"
        >
          Guardar Fecha
        </button>
      </div>
    </form>
  );
};

export default SetDateModal;