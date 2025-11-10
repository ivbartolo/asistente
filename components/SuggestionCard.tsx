import React from 'react';
import { ProactiveSuggestion } from '../types';

interface SuggestionCardProps {
    suggestion: ProactiveSuggestion;
    onAdd: (description: string) => void;
    onDismiss: () => void;
}

const SuggestionCard: React.FC<SuggestionCardProps> = ({ suggestion, onAdd, onDismiss }) => {
    return (
        <div className="bg-indigo-900/40 p-3 rounded-lg border border-indigo-700/50 animate-fade-in">
            <p className="font-semibold text-indigo-200 text-sm">{suggestion.title}</p>
            <div className="flex items-center gap-2 mt-2">
                <button
                    onClick={() => onAdd(suggestion.description)}
                    className="flex-1 text-xs bg-indigo-600 text-white font-semibold py-1 px-2 rounded-md hover:bg-indigo-700 transition-colors"
                >
                    Añadir Tarea
                </button>
                <button
                    onClick={onDismiss}
                    className="text-xs bg-gray-700/50 text-gray-300 font-semibold py-1 px-2 rounded-md hover:bg-gray-600 transition-colors"
                >
                    Descartar
                </button>
            </div>
        </div>
    );
};

export default SuggestionCard;