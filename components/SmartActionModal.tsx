import React, { useState, useEffect } from 'react';
import { Task } from '../types';
import * as geminiService from '../services/geminiService';
import { DocumentTextIcon, SparklesIcon, ClipboardIcon, CheckIcon } from './Icons';
import LoadingSpinner from './LoadingSpinner';

interface SmartActionModalProps {
  task: Task;
  onClose: () => void;
}

type Mode = 'initial' | 'draft' | 'summary';

const SmartActionModal: React.FC<SmartActionModalProps> = ({ task, onClose }) => {
  const [mode, setMode] = useState<Mode>('initial');
  const [isLoading, setIsLoading] = useState(false);
  const [inputText, setInputText] = useState('');
  const [outputText, setOutputText] = useState('');
  const [isCopied, setIsCopied] = useState(false);

  useEffect(() => {
    const desc = task.description.toLowerCase();
    const draftKeywords = ['email', 'correo', 'enviar', 'escribir', 'redactar', 'mensaje'];
    const summaryKeywords = ['leer', 'resumir', 'revisar', 'analizar', 'informe', 'documento'];

    if (draftKeywords.some(kw => desc.includes(kw))) {
      setMode('draft');
    } else if (summaryKeywords.some(kw => desc.includes(kw))) {
      setMode('summary');
    } else {
      setMode('initial');
    }
    // Reset state when task changes
    setOutputText('');
    setInputText('');
    setIsLoading(false);
    setIsCopied(false);
  }, [task]);

  const handleGenerateDraft = async () => {
    setIsLoading(true);
    setOutputText('');
    const result = await geminiService.generateDraft(task.description);
    setOutputText(result);
    setIsLoading(false);
  };

  const handleGenerateSummary = async () => {
    setIsLoading(true);
    setOutputText('');
    const result = await geminiService.generateSummary(inputText);
    setOutputText(result);
    setIsLoading(false);
  };

  const handleCopyToClipboard = () => {
    if (outputText) {
      navigator.clipboard.writeText(outputText);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    }
  };

  const renderContent = () => {
    switch (mode) {
      case 'draft':
        return (
          <div>
            <p className="text-gray-300 mb-4">La IA generará un borrador para esta tarea.</p>
            <button
              onClick={handleGenerateDraft}
              disabled={isLoading}
              className="w-full flex justify-center items-center gap-2 bg-purple-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-purple-700 disabled:bg-purple-900 transition-colors"
            >
              {isLoading ? <LoadingSpinner /> : <SparklesIcon className="w-5 h-5" />}
              Generar Borrador
            </button>
          </div>
        );
      case 'summary':
        return (
          <div>
            <p className="text-gray-300 mb-2">Pega el texto que quieres resumir a continuación.</p>
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Pega aquí el texto del informe, artículo, correo, etc..."
              rows={6}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg py-2 px-3 focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all text-white mb-4"
            />
            <button
              onClick={handleGenerateSummary}
              disabled={isLoading || !inputText.trim()}
              className="w-full flex justify-center items-center gap-2 bg-purple-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-purple-700 disabled:bg-purple-900/50 disabled:cursor-not-allowed transition-colors"
            >
              {isLoading ? <LoadingSpinner /> : <SparklesIcon className="w-5 h-5" />}
              Generar Resumen
            </button>
          </div>
        );
      case 'initial':
      default:
        return (
          <div className="text-center">
            <p className="text-gray-300 mb-4">¿Qué acción inteligente quieres realizar para esta tarea?</p>
            <div className="flex gap-4">
              <button onClick={() => setMode('draft')} className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-semibold py-2 px-4 rounded-lg transition-colors">Redactar</button>
              <button onClick={() => setMode('summary')} className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-semibold py-2 px-4 rounded-lg transition-colors">Resumir</button>
            </div>
          </div>
        );
    }
  };

  return (
    <div>
      <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-3">
        <DocumentTextIcon className="w-6 h-6 text-purple-400" />
        Acción Inteligente
      </h2>
      <p className="text-sm text-gray-400 mb-4">Tarea: "{task.description}"</p>

      {renderContent()}

      {outputText && (
        <div className="mt-4 pt-4 border-t border-gray-700/50">
          <h3 className="font-semibold text-gray-300 mb-2">Resultado:</h3>
          <div className="relative">
            <textarea
              readOnly
              value={outputText}
              rows={8}
              className="w-full bg-gray-900/50 border border-gray-600 rounded-lg py-2 px-3 text-gray-200 whitespace-pre-wrap"
            />
            <button
              onClick={handleCopyToClipboard}
              className="absolute top-2 right-2 bg-gray-600 text-white p-2 rounded-lg hover:bg-gray-500 transition-colors"
              aria-label="Copiar al portapapeles"
            >
              {isCopied ? <CheckIcon className="w-5 h-5 text-green-400" /> : <ClipboardIcon className="w-5 h-5" />}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SmartActionModal;
