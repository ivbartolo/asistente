import React, { useState } from 'react';
import { Task, Subtask, Attachment } from '../types';
import { CATEGORY_COLORS, PRIORITY_STYLES } from '../constants';
import { CheckIcon, PencilIcon, CalendarIcon, SparklesIcon, PlusIcon, TrashIcon, SearchIcon, ChevronDownIcon, ChevronUpIcon, MaximizeIcon, DocumentTextIcon, NoteIcon, PaperclipIcon, FileTextIcon } from './Icons';
import LoadingSpinner from './LoadingSpinner';
import SubtaskItem from './SubtaskItem';

interface TaskCardProps {
  task: Task;
  generatingSubtasksFor: string | null;
  onToggleDone: (id: string) => void;
  onEdit: (task: Task) => void;
  onDeleteTask: (details: { taskId: string }) => void;
  onAddDate: (id: string) => void;
  onGenerateSubtasks: (taskId: string, parentSubtaskId: string | null, taskDescription: string) => void;
  onAddManualSubtask: (taskId: string, parentSubtaskId: string | null, description: string) => void;
  onToggleSubtask: (taskId: string, subtaskId: string) => void;
  onRequestDeleteSubtask: (details: { taskId: string, subtaskId: string }) => void;
  onSearchForInfo: (prompt: string) => void;
  onMaximize: (id: string) => void;
  onEditSubtask: (taskId: string, subtaskId: string, newDescription: string) => void;
  onDragStart: (e: React.DragEvent<HTMLDivElement>, taskId: string) => void;
  onDragEnter: (e: React.DragEvent<HTMLDivElement>, taskId: string) => void;
  onDragEnd: () => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>, taskId: string) => void;
  isDragging: boolean;
  isDraggingOver: boolean;
  onSmartAction: (task: Task) => void;
  onSmartActionForSubtask: (description: string) => void;
  isMaximized?: boolean;
}

const countNestedSubtasks = (subtasks: Subtask[]): { completed: number; total: number } => {
  let completed = 0;
  let total = 0;

  for (const subtask of subtasks) {
    total++;
    if (subtask.isDone) {
      completed++;
    }
    if (subtask.subtasks) {
      const nestedCounts = countNestedSubtasks(subtask.subtasks);
      completed += nestedCounts.completed;
      total += nestedCounts.total;
    }
  }
  return { completed, total };
};


const TaskCard: React.FC<TaskCardProps> = ({ 
    task, 
    generatingSubtasksFor,
    onToggleDone, 
    onEdit, 
    onDeleteTask,
    onAddDate,
    onGenerateSubtasks,
    onAddManualSubtask,
    onToggleSubtask,
    onRequestDeleteSubtask,
    onSearchForInfo,
    onMaximize,
    onEditSubtask,
    onDragStart,
    onDragEnter,
    onDragEnd,
    onDrop,
    isDragging,
    isDraggingOver,
    onSmartAction,
    onSmartActionForSubtask,
    isMaximized = false,
}) => {
  const [isAddingSubtask, setIsAddingSubtask] = useState(false);
  const [newSubtaskDesc, setNewSubtaskDesc] = useState('');
  const [isSubtasksExpanded, setIsSubtasksExpanded] = useState(true);

  const categoryStyle = CATEGORY_COLORS[task.category];
  const priorityStyle = PRIORITY_STYLES[task.priority];

  const { completed: completedSubtasks, total: totalSubtasks } = task.subtasks ? countNestedSubtasks(task.subtasks) : { completed: 0, total: 0 };
  const progress = totalSubtasks > 0 ? (completedSubtasks / totalSubtasks) * 100 : 0;

  const handleAddSubtaskSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newSubtaskDesc.trim()) {
      onAddManualSubtask(task.id, null, newSubtaskDesc);
      setNewSubtaskDesc('');
      setIsAddingSubtask(false);
    }
  };

  const hasSubtasks = totalSubtasks > 0;
  const isGenerating = generatingSubtasksFor === task.id;
  
  // FIX: Correctly parse the dueDate string to avoid timezone issues.
  // new Date('YYYY-MM-DD') is parsed as UTC midnight, which can cause the date to be off by one day
  // in timezones west of UTC. Creating the date from parts forces local timezone interpretation.
  const getDisplayDate = () => {
    if (!task.dueDate) return null;
    const [year, month, day] = task.dueDate.split('-').map(Number);
    return new Date(year, month - 1, day);
  };
  const displayDate = getDisplayDate();
  
  const baseClasses = `relative p-4 rounded-xl border transition-all duration-300 transform flex flex-col gap-4 ${categoryStyle.bg} ${categoryStyle.border}`;
  const opacityClass = task.isDone ? 'opacity-50' : 'opacity-100';

  const getDynamicClasses = () => {
    if (isMaximized) return 'overflow-y-auto max-h-[80vh]';
    if (isDragging) {
      return 'opacity-40 border-dashed border-white cursor-grabbing';
    }
    if (isDraggingOver) {
      return 'scale-105 ring-2 ring-purple-500';
    }
    return 'hover:scale-105 hover:shadow-lg hover:shadow-black/20 cursor-grab';
  };

  return (
    <div
      draggable={!isMaximized}
      onDragStart={(e) => onDragStart(e, task.id)}
      onDragEnter={(e) => onDragEnter(e, task.id)}
      onDragEnd={onDragEnd}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => onDrop(e, task.id)}
      className={`${baseClasses} ${opacityClass} ${getDynamicClasses()}`}
    >
      <div className="absolute top-2 right-2 flex items-center gap-2 text-xs font-semibold">
        <span className={`px-2 py-0.5 rounded-full text-white ${priorityStyle.color}`}>{priorityStyle.label}</span>
        <span className={`px-2 py-0.5 rounded-full ${categoryStyle.bg} ${categoryStyle.text}`}>{task.category}</span>
         {displayDate && (
            <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full ${categoryStyle.bg} ${categoryStyle.text}`}>
                <CalendarIcon className="w-3 h-3" />
                {displayDate.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
            </span>
        )}
      </div>
      
      <p className={`text-lg pr-4 mt-8 ${task.isDone ? 'line-through' : ''}`}>{task.description}</p>
      
      {(hasSubtasks || isAddingSubtask) && (
        <div className="space-y-3 pt-2 border-t border-white/10">
          {hasSubtasks && (
            <>
              <div className="flex items-center gap-2">
                  <button onClick={() => setIsSubtasksExpanded(!isSubtasksExpanded)} className="p-1 rounded-full hover:bg-white/10 transition-colors" aria-label={isSubtasksExpanded ? 'Contraer subtareas' : 'Expandir subtareas'}>
                      {isSubtasksExpanded ? <ChevronUpIcon className="w-4 h-4 text-gray-400" /> : <ChevronDownIcon className="w-4 h-4 text-gray-400" />}
                  </button>
                  <span className="text-xs font-medium text-gray-300">{completedSubtasks}/{totalSubtasks} completadas</span>
                  <div className="w-full bg-gray-700/50 rounded-full h-1.5">
                      <div className="bg-green-500 h-1.5 rounded-full transition-all" style={{ width: `${progress}%` }}></div>
                  </div>
              </div>
              {isSubtasksExpanded && (
                <div className="space-y-1 max-h-48 overflow-y-auto pr-2 animate-fade-in">
                  {task.subtasks!.map(subtask => (
                      <SubtaskItem
                          key={subtask.id}
                          taskId={task.id}
                          subtask={subtask}
                          generatingSubtasksFor={generatingSubtasksFor}
                          onToggleSubtask={onToggleSubtask}
                          onRequestDelete={onRequestDeleteSubtask}
                          onAddManualSubtask={onAddManualSubtask}
                          onGenerateSubtasks={onGenerateSubtasks}
                          onSearchForInfo={onSearchForInfo}
                          onEditSubtask={onEditSubtask}
                          onSmartAction={onSmartActionForSubtask}
                      />
                  ))}
                </div>
              )}
            </>
          )}

          {isAddingSubtask && (
            <form onSubmit={handleAddSubtaskSubmit} className="flex gap-2">
              <input 
                type="text"
                value={newSubtaskDesc}
                onChange={(e) => setNewSubtaskDesc(e.target.value)}
                placeholder="Nueva subtarea..."
                className="flex-1 bg-gray-700/80 border border-gray-600 rounded-md py-1 px-2 text-sm focus:outline-none focus:ring-1 focus:ring-purple-500"
                autoFocus
              />
              <button type="submit" className="text-xs bg-purple-600 text-white font-semibold py-1 px-2 rounded-md hover:bg-purple-700">Añadir</button>
            </form>
          )}
        </div>
      )}

      {isMaximized && (task.notes || (task.attachments && task.attachments.length > 0)) && (
        <div className="space-y-4 pt-3 mt-3 border-t border-white/10">
            {task.notes && (
                <div>
                    <h4 className="text-sm font-semibold text-gray-300 mb-2">Notas</h4>
                    <p className="text-sm text-gray-200 whitespace-pre-wrap bg-gray-900/50 p-3 rounded-md border border-gray-700/50">{task.notes}</p>
                </div>
            )}
            {task.attachments && task.attachments.length > 0 && (
                <div>
                    <h4 className="text-sm font-semibold text-gray-300 mb-2">Adjuntos</h4>
                    <div className="flex flex-wrap gap-3">
                        {task.attachments.map(att => (
                            <a key={att.id} href={att.data} download={att.name} title={`Descargar ${att.name}`} className="group">
                                {att.type.startsWith('image/') ? (
                                    <img src={att.data} alt={att.name} className="w-24 h-24 object-cover rounded-md border border-gray-700 group-hover:ring-2 ring-purple-500" />
                                ) : (
                                    <div className="w-24 h-24 bg-gray-700 rounded-md flex flex-col items-center justify-center p-2 border border-gray-600 group-hover:ring-2 ring-purple-500">
                                        <FileTextIcon className="w-10 h-10 text-gray-400"/>
                                        <span className="text-xs text-gray-300 truncate w-full text-center mt-1">{att.name}</span>
                                    </div>
                                )}
                            </a>
                        ))}
                    </div>
                </div>
            )}
        </div>
      )}

      <div className="flex items-center justify-end gap-1.5 mt-auto border-t border-white/10 pt-3">
        {task.notes && <NoteIcon className="w-4 h-4 text-gray-400" title="Esta tarea tiene notas"/>}
        {task.attachments && task.attachments.length > 0 && <PaperclipIcon className="w-4 h-4 text-gray-400" title={`${task.attachments.length} adjuntos`}/>}
        {(task.notes || (task.attachments && task.attachments.length > 0)) && <div className="h-5 w-px bg-white/10 mx-1"></div>}

        <button onClick={() => onToggleDone(task.id)} className="p-2 rounded-full hover:bg-white/10 transition-colors" aria-label="Marcar como hecha">
            <CheckIcon className="w-5 h-5 text-green-400" />
        </button>
        <button onClick={() => onEdit(task)} className="p-2 rounded-full hover:bg-white/10 transition-colors" aria-label="Editar tarea">
          <PencilIcon className="w-5 h-5 text-yellow-400" />
        </button>
        <button onClick={() => onAddDate(task.id)} className="p-2 rounded-full hover:bg-white/10 transition-colors" aria-label="Añadir fecha">
          <CalendarIcon className="w-5 h-5 text-blue-400" />
        </button>
         <button onClick={() => onSearchForInfo(task.description)} className="p-2 rounded-full hover:bg-white/10 transition-colors" aria-label="Buscar información">
          <SearchIcon className="w-5 h-5 text-gray-300" />
        </button>
        <button onClick={() => onDeleteTask({ taskId: task.id })} className="p-2 rounded-full hover:bg-white/10 transition-colors" aria-label="Eliminar tarea">
          <TrashIcon className="w-5 h-5 text-red-400" />
        </button>
        {!isMaximized && (
            <button onClick={() => onMaximize(task.id)} className="p-2 rounded-full hover:bg-white/10 transition-colors" aria-label="Maximizar tarea">
                <MaximizeIcon className="w-5 h-5 text-gray-300" />
            </button>
        )}
        <div className="h-5 w-px bg-white/10 mx-1"></div>
        <button onClick={() => setIsAddingSubtask(prev => !prev)} className="p-2 rounded-full hover:bg-white/10 transition-colors" aria-label="Añadir subtarea manual">
          <PlusIcon className="w-5 h-5 text-gray-300" />
        </button>
        <button 
          onClick={() => onGenerateSubtasks(task.id, null, task.description)} 
          className="p-2 rounded-full hover:bg-white/10 transition-colors disabled:cursor-not-allowed" 
          aria-label="Desglosar con IA"
          disabled={isGenerating}
        >
          {isGenerating ? <LoadingSpinner /> : <SparklesIcon className="w-5 h-5 text-purple-400" />}
        </button>
        <button onClick={() => onSmartAction(task)} className="p-2 rounded-full hover:bg-white/10 transition-colors" aria-label="Acción inteligente IA">
          <DocumentTextIcon className="w-5 h-5 text-indigo-400" />
        </button>
      </div>
    </div>
  );
};

export default TaskCard;