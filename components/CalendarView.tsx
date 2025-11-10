import React, { useState } from 'react';
import { Task } from '../types';
import { CATEGORY_COLORS } from '../constants';
import { ChevronDownIcon, ChevronUpIcon, ClipboardListIcon } from './Icons';
import Modal from './Modal';

interface CalendarViewProps {
  tasks: Task[];
  onTaskClick: (taskId: string) => void;
  onSetTaskDate: (taskId: string, date: string) => void;
  currentDate: Date;
  setCurrentDate: React.Dispatch<React.SetStateAction<Date>>;
}

const CalendarView: React.FC<CalendarViewProps> = ({ tasks, onTaskClick, onSetTaskDate, currentDate, setCurrentDate }) => {
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);
  const [viewingDay, setViewingDay] = useState<{ date: Date; tasks: Task[] } | null>(null);

  const TASK_DISPLAY_LIMIT = 2;

  const unscheduledTasks = tasks.filter(task => !task.dueDate && !task.isDone);

  const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
  const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
  const startDate = new Date(startOfMonth);
  startDate.setDate(startDate.getDate() - startDate.getDay());
  const endDate = new Date(endOfMonth);
  endDate.setDate(endDate.getDate() + (6 - endDate.getDay()));

  const days = [];
  let day = new Date(startDate);
  while (day <= endDate) {
    days.push(new Date(day));
    day.setDate(day.getDate() + 1);
  }

  const tasksByDate: { [key: string]: Task[] } = {};
  tasks.forEach(task => {
    if (task.dueDate) {
      const dateKey = task.dueDate;
      if (!tasksByDate[dateKey]) {
        tasksByDate[dateKey] = [];
      }
      tasksByDate[dateKey].push(task);
    }
  });

  const changeMonth = (amount: number) => {
    setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() + amount, 1));
  };

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, taskId: string) => {
    e.dataTransfer.setData('taskId', taskId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>, dateKey: string) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('taskId');
    if (taskId) {
        onSetTaskDate(taskId, dateKey);
    }
    setDragOverDate(null);
  };
  
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const weekdays = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

  return (
    <>
      <div className="bg-gray-800/50 p-4 rounded-xl border border-gray-700/50 animate-fade-in flex flex-col lg:flex-row gap-4">
        {/* Calendar Grid */}
        <div className="flex-1">
          <div className="flex justify-between items-center mb-4">
            <button onClick={() => changeMonth(-1)} className="p-2 rounded-full hover:bg-white/10">
              <ChevronDownIcon className="w-6 h-6 transform rotate-90" />
            </button>
            <h2 className="text-xl font-bold">
              {currentDate.toLocaleString('es-ES', { month: 'long', year: 'numeric' }).replace(/^\w/, c => c.toUpperCase())}
            </h2>
            <button onClick={() => changeMonth(1)} className="p-2 rounded-full hover:bg-white/10">
              <ChevronUpIcon className="w-6 h-6 transform rotate-90" />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1">
            {weekdays.map(weekday => (
              <div key={weekday} className="text-center text-xs font-bold text-gray-400 pb-2">{weekday}</div>
            ))}
            {days.map((d, i) => {
              const year = d.getFullYear();
              const month = String(d.getMonth() + 1).padStart(2, '0');
              const dayOfMonth = String(d.getDate()).padStart(2, '0');
              const dateKey = `${year}-${month}-${dayOfMonth}`;
              
              const tasksForDay = tasksByDate[dateKey] || [];
              const displayedTasks = tasksForDay.slice(0, TASK_DISPLAY_LIMIT);
              const hiddenTasksCount = tasksForDay.length - TASK_DISPLAY_LIMIT;
              
              const isCurrentMonth = d.getMonth() === currentDate.getMonth();
              
              const today = new Date();
              const isToday = today.getFullYear() === d.getFullYear() && today.getMonth() === d.getMonth() && today.getDate() === d.getDate();
              const isDragOver = dragOverDate === dateKey;

              return (
                <div 
                  key={i}
                  onDrop={(e) => handleDrop(e, dateKey)}
                  onDragOver={handleDragOver}
                  onDragEnter={() => setDragOverDate(dateKey)}
                  onDragLeave={() => setDragOverDate(null)}
                  onClick={() => tasksForDay.length > 0 && setViewingDay({ date: d, tasks: tasksForDay })}
                  className={`
                    h-28 rounded-lg p-1.5 border transition-all duration-200
                    ${isCurrentMonth ? 'bg-gray-700/50 border-gray-600/50' : 'bg-gray-800/30 border-gray-700/30'}
                    ${isDragOver ? 'ring-2 ring-purple-500 bg-purple-900/40' : ''}
                    ${tasksForDay.length > 0 ? 'cursor-pointer hover:bg-gray-700' : ''}
                    flex flex-col
                  `}
                >
                  <span className={`text-xs font-semibold ${isToday ? 'bg-purple-500 rounded-full h-5 w-5 flex items-center justify-center text-white' : ''} ${!isCurrentMonth ? 'text-gray-500' : 'text-gray-200'}`}>
                    {d.getDate()}
                  </span>
                  <div className="mt-1 space-y-1 overflow-hidden text-xs">
                    {displayedTasks.map(task => (
                      <div 
                        key={task.id}
                        className={`
                          w-full text-left p-1 rounded transition-colors truncate
                          ${CATEGORY_COLORS[task.category].bg} 
                          ${CATEGORY_COLORS[task.category].text}
                          ${task.isDone ? 'line-through opacity-50' : ''}
                        `}
                      >
                        {task.description}
                      </div>
                    ))}
                    {hiddenTasksCount > 0 && (
                      <div className="w-full text-left p-1 font-semibold text-gray-300">
                        + {hiddenTasksCount} más...
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        
        {/* Unscheduled Tasks Sidebar */}
        <div className="lg:w-64 flex-shrink-0 bg-gray-900/40 p-3 rounded-lg border border-gray-700/50">
          <h3 className="font-semibold text-gray-300 mb-3 flex items-center gap-2">
              <ClipboardListIcon className="w-5 h-5" />
              Tareas sin Fecha
          </h3>
          {unscheduledTasks.length > 0 ? (
              <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                  {unscheduledTasks.map(task => (
                      <div
                          key={task.id}
                          draggable
                          onDragStart={(e) => handleDragStart(e, task.id)}
                          className={`
                              p-2 rounded-md cursor-grab active:cursor-grabbing text-sm
                              ${CATEGORY_COLORS[task.category].bg} 
                              ${CATEGORY_COLORS[task.category].text}
                          `}
                      >
                          {task.description}
                      </div>
                  ))}
              </div>
          ) : (
              <p className="text-xs text-gray-400 italic mt-4 text-center">¡Todas las tareas pendientes están programadas!</p>
          )}
        </div>
      </div>

      {viewingDay && (
        <Modal isOpen={!!viewingDay} onClose={() => setViewingDay(null)}>
          <div className="p-2">
            <h2 className="text-xl font-bold text-white mb-4">
              Tareas para el {viewingDay.date.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
            </h2>
            <ul className="space-y-2 max-h-[60vh] overflow-y-auto pr-2">
              {viewingDay.tasks.map(task => (
                <li key={task.id}>
                  <button
                    onClick={() => {
                      onTaskClick(task.id);
                      setViewingDay(null);
                    }}
                    className={`w-full text-left p-3 rounded-lg transition-colors flex justify-between items-center
                      ${CATEGORY_COLORS[task.category].bg} 
                      hover:ring-2 hover:ring-purple-400
                    `}
                  >
                    <span className={`font-medium ${CATEGORY_COLORS[task.category].text} ${task.isDone ? 'line-through opacity-70' : ''}`}>
                      {task.description}
                    </span>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${task.isDone ? 'bg-green-800 text-green-300' : 'bg-gray-900/50 text-gray-300'}`}>
                      {task.isDone ? 'Hecha' : 'Pendiente'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </Modal>
      )}
    </>
  );
};

export default CalendarView;