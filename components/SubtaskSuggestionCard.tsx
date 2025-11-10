import React from 'react';
import { BrainIcon, XIcon } from './Icons';

interface SubtaskSuggestionCardProps {
  suggestions: string[];
  parentTaskDescription: string;
  parentTaskId: string;
  chatItemIndex: number;
  onAddSuggestionAsSubtask: (chatItemIndex: number, suggestionText: string, parentTaskId: string) => void;
  onDismiss: (chatItemIndex: number) => void;
}

const SubtaskSuggestionCard: React.FC<SubtaskSuggestionCardProps> = ({ 
  suggestions, 
  parentTaskDescription,
  parentTaskId,
  chatItemIndex,
  onAddSuggestionAsSubtask,
  onDismiss,
}) => {
  return (
    <div className="relative bg-gray-800/50 p-4 rounded-xl border border-purple-700/50 mt-4 animate-fade-in">
      <button 
        onClick={() => onDismiss(chatItemIndex)}
        className="absolute top-2 right-2 p-1 rounded-full text-gray-400 hover:bg-gray-700 hover:text-white transition-colors"
        aria-label="Descartar Plan de Acción"
      >
        <XIcon className="w-4 h-4" />
      </button>
      <div className="flex items-center gap-2 text-purple-300 mb-3">
        <BrainIcon className="w-5 h-5" />
        <h3 className="font-semibold">Plan de Acción para: "{parentTaskDescription}"</h3>
      </div>
      <ul className="space-y-2">
        {suggestions.map((suggestion, index) => (
          <li key={index} className="flex items-center justify-between bg-gray-700/50 p-2 rounded-lg">
            <span className="text-gray-200 text-sm">{suggestion}</span>
            <button
              onClick={() => onAddSuggestionAsSubtask(chatItemIndex, suggestion, parentTaskId)}
              className="text-xs bg-purple-600 text-white font-semibold py-1 px-3 rounded-md hover:bg-purple-700 transition-colors whitespace-nowrap ml-4"
            >
              Añadir Subtarea
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default SubtaskSuggestionCard;