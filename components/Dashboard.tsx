import React, { useState, useEffect } from 'react';
import { Task, Priority } from '../types';
import * as geminiService from '../services/geminiService';
import { TargetIcon, ClockIcon, SparklesIcon } from './Icons';
import LoadingSpinner from './LoadingSpinner';

const getLocalDateString = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const formatDateForDisplay = (dateString: string): string => {
    const today = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(today.getDate() + 1);

    if (dateString === getLocalDateString(today)) return 'Hoy';
    if (dateString === getLocalDateString(tomorrow)) return 'Mañana';
    
    const [year, month, day] = dateString.split('-').map(Number);
    const date = new Date(year, month - 1, day);

    return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
};

interface DashboardProps {
  tasks: Task[];
  onTaskClick: (taskId: string) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ tasks, onTaskClick }) => {
    const [dailySuggestion, setDailySuggestion] = useState<string>('');
    const [isSuggestionLoading, setIsSuggestionLoading] = useState<boolean>(true);

    const todayStr = getLocalDateString(new Date());
    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
    const sevenDaysStr = getLocalDateString(sevenDaysFromNow);

    const tasksForToday = tasks
        .filter(t => !t.isDone && (t.dueDate === todayStr || t.priority === Priority.Urgent))
        .slice(0, 4);

    const upcomingTasks = tasks
        .filter(t => t.dueDate && !t.isDone && t.dueDate > todayStr && t.dueDate <= sevenDaysStr)
        .sort((a, b) => a.dueDate!.localeCompare(b.dueDate!))
        .slice(0, 4);

    useEffect(() => {
        const fetchSuggestion = async () => {
            setIsSuggestionLoading(true);
            try {
                // We pass the calculated tasks directly to the service
                const suggestion = await geminiService.getDailyFocusSuggestion(tasksForToday, upcomingTasks);
                setDailySuggestion(suggestion);
            } catch (error) {
                console.error(error);
                setDailySuggestion("No se pudo cargar la sugerencia, ¡pero tú puedes con todo!");
            } finally {
                setIsSuggestionLoading(false);
            }
        };

        fetchSuggestion();
    }, [tasks]);

    return (
        <div className="mb-6 p-3 bg-gray-800 rounded-xl border border-gray-700">
             <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Today's Focus */}
                <div className="bg-gray-900/50 p-4 rounded-lg">
                    <h3 className="font-semibold text-lg text-amber-300 mb-3 flex items-center gap-2">
                        <TargetIcon className="w-5 h-5" /> Enfoque de Hoy
                    </h3>
                    {tasksForToday.length > 0 ? (
                        <ul className="space-y-2">
                            {tasksForToday.map(task => (
                                <li key={task.id}>
                                    <button onClick={() => onTaskClick(task.id)} className="w-full text-left p-2 rounded-md bg-gray-700/50 hover:bg-gray-700 transition-colors text-sm text-gray-200 truncate">
                                        {task.description}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="text-sm text-gray-400 italic">¡Todo tranquilo por hoy! Tómate un respiro.</p>
                    )}
                </div>
                
                {/* Upcoming */}
                <div className="bg-gray-900/50 p-4 rounded-lg">
                     <h3 className="font-semibold text-lg text-sky-300 mb-3 flex items-center gap-2">
                        <ClockIcon className="w-5 h-5" /> Próximamente
                    </h3>
                    {upcomingTasks.length > 0 ? (
                         <ul className="space-y-2">
                            {upcomingTasks.map(task => (
                                <li key={task.id}>
                                    <button onClick={() => onTaskClick(task.id)} className="w-full text-left p-2 rounded-md bg-gray-700/50 hover:bg-gray-700 transition-colors text-sm text-gray-200 flex justify-between items-center">
                                        <span className="truncate pr-2">{task.description}</span>
                                        <span className="text-xs font-semibold bg-sky-900/70 text-sky-300 px-2 py-0.5 rounded-full flex-shrink-0">{formatDateForDisplay(task.dueDate!)}</span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    ) : (
                         <p className="text-sm text-gray-400 italic">Sin plazos inminentes a la vista.</p>
                    )}
                </div>

                {/* AI Suggestion */}
                <div className="bg-purple-900/30 p-4 rounded-lg border border-purple-700/50 flex flex-col justify-center">
                    <h3 className="font-semibold text-lg text-purple-300 mb-3 flex items-center gap-2">
                        <SparklesIcon className="w-5 h-5" /> Sugerencia del Día
                    </h3>
                    {isSuggestionLoading ? (
                        <div className="flex items-center justify-center h-full">
                            <LoadingSpinner />
                        </div>
                    ) : (
                        <p className="text-sm text-purple-200 italic">"{dailySuggestion}"</p>
                    )}
                </div>
             </div>
        </div>
    );
};

export default Dashboard;