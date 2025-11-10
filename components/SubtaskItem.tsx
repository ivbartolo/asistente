import React, { useState } from 'react';
import { Subtask } from '../types';
import { PlusIcon, SearchIcon, SparklesIcon, PencilIcon, TrashIcon, DocumentTextIcon } from './Icons';
import LoadingSpinner from './LoadingSpinner';

interface SubtaskItemProps {
  taskId: string;
  subtask: Subtask;
  generatingSubtasksFor: string | null;
  onToggleSubtask: (taskId: string, subtaskId: string) => void;
  onRequestDelete: (details: { taskId: string; subtaskId: string }) => void;
  onAddManualSubtask: (taskId: string, parentSubtaskId: string | null, description: string) => void;
  onGenerateSubtasks: (taskId: string, parentSubtaskId: string | null, description: string) => void;
  onSearchForInfo: (prompt: string) => void;
  onEditSubtask: (taskId: string, subtaskId: string, newDescription: string) => void;
  onSmartAction: (description: string) => void;
}

const SubtaskItem: React.FC<SubtaskItemProps> = ({
  taskId,
  subtask,
  generatingSubtasksFor,
  onToggleSubtask,
  onRequestDelete,
  onAddManualSubtask,
  onGenerateSubtasks,
  onSearchForInfo,
  onEditSubtask,
  onSmartAction,
}) => {
  const [isAddingSubtask, setIsAddingSubtask] = useState(false);
  const [newSubtaskDesc, setNewSubtaskDesc] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(subtask.description);
  
  const isGenerating = generatingSubtasksFor === subtask.id;
  
  const handleAddSubtaskSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newSubtaskDesc.trim()) {
      onAddManualSubtask(taskId, subtask.id, newSubtaskDesc);
      setNewSubtaskDesc('');
      setIsAddingSubtask(false);
    }
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editText.trim()) {
      onEditSubtask(taskId, subtask.id, editText);
      setIsEditing(false);
    }
  };

  return (
    <div className="pl-4 border-l border-gray-700/50">
      {isEditing ? (
        <form onSubmit={handleEditSubmit} className="flex gap-2 items-center py-1">
          <input
            type="text"
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            className="flex-1 bg-gray-700/80 border border-gray-600 rounded-md py-1 px-2 text-sm focus:outline-none focus:ring-1 focus:ring-purple-500"
            autoFocus
          />
          <button type="submit" className="text-xs bg-purple-600 text-white font-semibold py-1 px-2 rounded-md hover:bg-purple-700">
            Guardar
          </button>
        </form>
      ) : (
        <div className="flex items-center gap-2 group py-1">
          <input 
            type="checkbox" 
            checked={subtask.isDone}
            onChange={() => onToggleSubtask(taskId, subtask.id)}
            className="form-checkbox h-4 w-4 rounded bg-gray-700 border-gray-600 text-purple-500 focus:ring-purple-600 cursor-pointer flex-shrink-0"
          />
          <span className={`flex-1 text-sm ${subtask.isDone ? 'line-through text-gray-400' : 'text-gray-200'}`}>
            {subtask.description}
          </span>
          <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center flex-shrink-0">
              <button onClick={() => setIsAddingSubtask(p => !p)} className="p-1 text-gray-400 hover:text-green-400" aria-label="Añadir sub-subtarea">
                  <PlusIcon className="w-3.5 h-3.5" />
              </button>
              <button 
                onClick={() => onGenerateSubtasks(taskId, subtask.id, subtask.description)} 
                disabled={isGenerating}
                className="p-1 text-gray-400 hover:text-purple-400 disabled:cursor-not-allowed" aria-label="Desglosar sub-subtarea con IA">
                  {isGenerating ? <LoadingSpinner/> : <SparklesIcon className="w-3.5 h-3.5" />}
              </button>
              <button onClick={() => onSmartAction(subtask.description)} className="p-1 text-gray-400 hover:text-indigo-400" aria-label="Acción inteligente IA">
                  <DocumentTextIcon className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => onSearchForInfo(subtask.description)} className="p-1 text-gray-400 hover:text-blue-400" aria-label="Buscar información sobre la subtarea">
                  <SearchIcon className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => setIsEditing(true)} className="p-1 text-gray-400 hover:text-yellow-400" aria-label="Editar subtarea">
                <PencilIcon className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => onRequestDelete({ taskId, subtaskId: subtask.id })} className="p-1 text-gray-400 hover:text-red-400" aria-label="Eliminar subtarea">
                  <TrashIcon className="w-3.5 h-3.5" />
              </button>
          </div>
        </div>
      )}

      {(subtask.subtasks && subtask.subtasks.length > 0) && (
        <div className="mt-1">
          {subtask.subtasks.map(childSubtask => (
            <SubtaskItem
              key={childSubtask.id}
              taskId={taskId}
              subtask={childSubtask}
              generatingSubtasksFor={generatingSubtasksFor}
              onToggleSubtask={onToggleSubtask}
              onRequestDelete={onRequestDelete}
              onAddManualSubtask={onAddManualSubtask}
              onGenerateSubtasks={onGenerateSubtasks}
              onSearchForInfo={onSearchForInfo}
              onEditSubtask={onEditSubtask}
              onSmartAction={onSmartAction}
            />
          ))}
        </div>
      )}

      {isAddingSubtask && (
        <form onSubmit={handleAddSubtaskSubmit} className="flex gap-2 pl-6 pt-1">
          <input 
            type="text"
            value={newSubtaskDesc}
            onChange={(e) => setNewSubtaskDesc(e.target.value)}
            placeholder="Nueva sub-subtarea..."
            className="flex-1 bg-gray-700/80 border border-gray-600 rounded-md py-1 px-2 text-sm focus:outline-none focus:ring-1 focus:ring-purple-500"
            autoFocus
          />
          <button type="submit" className="text-xs bg-purple-600 text-white font-semibold py-1 px-2 rounded-md hover:bg-purple-700">Añadir</button>
        </form>
      )}
    </div>
  );
};

export default SubtaskItem;
