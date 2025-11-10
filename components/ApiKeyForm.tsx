import React, { useState } from 'react';

interface ApiKeyFormProps {
  initialValue: string;
  onSave: (apiKey: string) => void;
  onCancel: () => void;
  onClear: () => void;
}

const ApiKeyForm: React.FC<ApiKeyFormProps> = ({ initialValue, onSave, onCancel, onClear }) => {
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) {
      setError('Introduce una clave API válida.');
      return;
    }
    setError(null);
    onSave(trimmed);
  };

  const handleClear = () => {
    setValue('');
    setError(null);
    onClear();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <h2 className="text-xl font-bold text-white">Configurar clave de Gemini</h2>
      <p className="text-sm text-gray-300">
        La clave se guarda de forma local en este navegador y solo se usa para las llamadas directas a la API de Gemini.
        Puedes revocarla o reemplazarla cuando quieras.
      </p>
      <div>
        <label htmlFor="geminiApiKey" className="block text-sm font-medium text-gray-400 mb-2">
          Clave API
        </label>
        <input
          id="geminiApiKey"
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Introduce tu GEMINI_API_KEY"
          className="w-full bg-gray-700 border border-gray-600 rounded-lg py-2 px-3 focus:outline-none focus:ring-2 focus:ring-purple-500 text-white"
          autoFocus
        />
        {error && <p className="text-sm text-red-400 mt-2">{error}</p>}
      </div>
      <div className="flex flex-col sm:flex-row sm:justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={handleClear}
          className="order-3 sm:order-1 bg-gray-700 hover:bg-gray-600 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
        >
          Borrar clave
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="order-1 sm:order-2 bg-gray-600 hover:bg-gray-500 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
        >
          Cancelar
        </button>
        <button
          type="submit"
          className="order-2 sm:order-3 bg-purple-600 hover:bg-purple-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
        >
          Guardar
        </button>
      </div>
    </form>
  );
};

export default ApiKeyForm;

