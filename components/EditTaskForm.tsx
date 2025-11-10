import React, { useState, useRef } from 'react';
import { Task, Category, Priority, Attachment } from '../types';
import * as geminiService from '../services/geminiService';
import { SparklesIcon, FileTextIcon, XIcon, CalendarPlusIcon } from './Icons';
import LoadingSpinner from './LoadingSpinner';

interface EditTaskFormProps {
  task: Task;
  onSave: (task: Task) => void;
  onCancel: () => void;
}

const EditTaskForm: React.FC<EditTaskFormProps> = ({ task, onSave, onCancel }) => {
  const [description, setDescription] = useState(task.description);
  const [category, setCategory] = useState(task.category);
  const [priority, setPriority] = useState(task.priority);
  const [notes, setNotes] = useState(task.notes || '');
  const [attachments, setAttachments] = useState<Attachment[]>(task.attachments || []);
  const [isGeneratingNotes, setIsGeneratingNotes] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);


  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      ...task,
      description,
      category,
      priority,
      notes,
      attachments,
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
        const files = Array.from(e.target.files);
        // FIX: Explicitly type `file` as `File` to resolve type inference issues where it was being treated as `unknown`.
        files.forEach((file: File) => {
            const reader = new FileReader();
            reader.onload = (loadEvent) => {
                const newAttachment: Attachment = {
                    id: crypto.randomUUID(),
                    name: file.name,
                    type: file.type,
                    data: loadEvent.target?.result as string,
                };
                setAttachments(prev => [...prev, newAttachment]);
            };
            reader.readAsDataURL(file);
        });
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    }
  };

  const handleRemoveAttachment = (id: string) => {
    setAttachments(prev => prev.filter(att => att.id !== id));
  };

  const handleGenerateNotes = async () => {
    setIsGeneratingNotes(true);
    const generatedNotes = await geminiService.generateNotesForTask(task.description, notes);
    setNotes(generatedNotes);
    setIsGeneratingNotes(false);
  };
  
  const handleSyncToCalendar = () => {
    if (!task.dueDate) return;

    const formatDateForGoogle = (date: Date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}${month}${day}`;
    };

    // The dueDate is in "YYYY-MM-DD" format. Adding 'T00:00:00' ensures it's parsed in the user's local timezone
    // rather than UTC midnight, which can cause off-by-one day errors.
    const startDate = new Date(`${task.dueDate}T00:00:00`); 
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 1);

    const googleCalendarUrl = new URL('https://www.google.com/calendar/render');
    googleCalendarUrl.searchParams.append('action', 'TEMPLATE');
    googleCalendarUrl.searchParams.append('text', description); // Use current description from state
    googleCalendarUrl.searchParams.append('details', notes); // Use current notes from state
    googleCalendarUrl.searchParams.append('dates', `${formatDateForGoogle(startDate)}/${formatDateForGoogle(endDate)}`);

    window.open(googleCalendarUrl.toString(), '_blank');
  };


  const formElementClass = "w-full bg-gray-700 border border-gray-600 rounded-lg py-2 px-3 focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all text-white";

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-h-[80vh] overflow-y-auto pr-2">
      <h2 className="text-xl font-bold text-white mb-4">Editar Tarea</h2>
      <div>
        <label htmlFor="description" className="block text-sm font-medium text-gray-400 mb-1">
          Descripción
        </label>
        <textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className={formElementClass}
          required
        />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label htmlFor="category" className="block text-sm font-medium text-gray-400 mb-1">
            Categoría
          </label>
          <select id="category" value={category} onChange={(e) => setCategory(e.target.value as Category)} className={formElementClass}>
            {Object.values(Category).map((cat) => ( <option key={cat} value={cat}>{cat}</option>))}
          </select>
        </div>
        <div>
          <label htmlFor="priority" className="block text-sm font-medium text-gray-400 mb-1">
            Prioridad
          </label>
          <select id="priority" value={priority} onChange={(e) => setPriority(e.target.value as Priority)} className={formElementClass}>
            {Object.values(Priority).map((prio) => (<option key={prio} value={prio}>{prio.charAt(0).toUpperCase() + prio.slice(1)}</option>))}
          </select>
        </div>
      </div>
      
      <div>
        <label className="block text-sm font-medium text-gray-400 mb-1">Integraciones</label>
        <button
          type="button"
          onClick={handleSyncToCalendar}
          disabled={!task.dueDate}
          title={!task.dueDate ? "Guarda una fecha de vencimiento para poder sincronizar" : "Añadir a Google Calendar"}
          className="w-full flex items-center justify-center gap-2 bg-gray-700 border border-gray-600 rounded-lg py-2 px-3 focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all text-white disabled:opacity-50 disabled:cursor-not-allowed hover:enabled:bg-gray-600"
        >
          <CalendarPlusIcon className="w-5 h-5" />
          Añadir a Google Calendar
        </button>
      </div>

      <div>
        <label htmlFor="notes" className="block text-sm font-medium text-gray-400 mb-1">
          Notas
        </label>
        <div className="relative">
          <textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} className={formElementClass} placeholder="Añade detalles, enlaces o cualquier información relevante..."/>
          <button type="button" onClick={handleGenerateNotes} disabled={isGeneratingNotes} className="absolute bottom-2 right-2 p-1.5 rounded-full bg-purple-600 text-white hover:bg-purple-700 disabled:bg-purple-900 transition-colors" title="Generar notas con IA">
            {isGeneratingNotes ? <LoadingSpinner /> : <SparklesIcon className="w-4 h-4" />}
          </button>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-400 mb-1">Adjuntos</label>
        <div className="border border-dashed border-gray-600 rounded-lg p-4 text-center">
            {attachments.length > 0 && (
                <div className="flex flex-wrap gap-3 mb-4">
                    {attachments.map(att => (
                        <div key={att.id} className="relative group">
                            {att.type.startsWith('image/') ? (
                                <img src={att.data} alt={att.name} className="w-20 h-20 object-cover rounded-md" />
                            ) : (
                                <div className="w-20 h-20 bg-gray-700 rounded-md flex flex-col items-center justify-center p-1">
                                    <FileTextIcon className="w-8 h-8 text-gray-400"/>
                                    <span className="text-xs text-gray-300 truncate w-full text-center mt-1">{att.name}</span>
                                </div>
                            )}
                            <button type="button" onClick={() => handleRemoveAttachment(att.id)} className="absolute -top-2 -right-2 p-0.5 bg-red-500 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity">
                                <XIcon className="w-4 h-4"/>
                            </button>
                        </div>
                    ))}
                </div>
            )}
            <input type="file" multiple ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/*,.pdf,.txt,.md" id="file-upload"/>
            <label htmlFor="file-upload" className="cursor-pointer text-purple-400 font-semibold hover:text-purple-300">
                Añadir archivos...
            </label>
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-4">
        <button type="button" onClick={onCancel} className="bg-gray-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-gray-700 transition-colors">
          Cancelar
        </button>
        <button type="submit" className="bg-purple-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-purple-700 transition-colors">
          Guardar Cambios
        </button>
      </div>
    </form>
  );
};

export default EditTaskForm;