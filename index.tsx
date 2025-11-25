import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import './index.css';
import { createRoot } from 'react-dom/client';
import { Mic, Search, Plus, Calendar, X, Link as LinkIcon, DollarSign, FileText, BrainCircuit, MoreHorizontal, Layout, Share2, Info, Menu, CornerDownRight, Disc, ArrowLeft, Sparkles, Camera, Undo, Redo, Image as ImageIcon, MessageCircle, Send, CheckSquare, Square, Download, FileType } from 'lucide-react';
import { db, saveViewport, saveSelectedNode, getMetadata } from './db';
import { IdeaNode, Connection, Viewport, ChatMessage, CheckListItem, NodeType, NodeStatus, AttachmentFile } from './types';

// --- TYPES ---
// (Imported from types.ts)



// --- AI SERVICE ---

const SYSTEM_INSTRUCTION = `
Eres un asistente experto en gestión de conocimiento y productividad (GTD). 
Tu trabajo es analizar una idea en bruto (texto o transcripción de voz) y estructurarla.

Si se proporciona CONTEXTO (una idea padre seleccionada), interpreta la nueva idea como una subtarea, detalle o evolución de ese contexto. Ajusta la categoría y el resumen para que tengan sentido dentro del proyecto padre.

Output JSON requerido:
1. title: Un título corto y accionable (max 5 palabras).
2. summary: Un resumen claro de la idea (max 20 palabras).
3. category: Una categoría general o subcategoría lógica basada en el contexto.
4. cost: Si se menciona dinero, extrae el valor numérico (ej: "unos 50 euros" -> 50). Si no, 0.
5. links: Si se mencionan sitios web, extráelos como array de strings.
6. checklist: SIEMPRE intenta extraer tareas/items de listas del texto.
   - Formato EXACTO: array de objetos [{"text": "tarea", "done": false}, ...]
   - Ejemplos que DEBEN generar checklist:
     * "comprar X, Y y Z" -> [{"text":"comprar X","done":false},{"text":"comprar Y","done":false},{"text":"comprar Z","done":false}]
     * "pasos: hacer A, hacer B" -> [{"text":"hacer A","done":false},{"text":"hacer B","done":false}]
     * "tengo que llamar, estudiar y limpiar" -> [{"text":"llamar","done":false},{"text":"estudiar","done":false},{"text":"limpiar","done":false}]
   - Si NO hay lista clara, devuelve array vacío []
   - NUNCA devuelvas string, SIEMPRE array de objetos

Ejemplo completo:
{
  "title": "Compras del super",
  "summary": "Lista de compras pendientes",
  "category": "Personal",
  "cost": 0,
  "links": [],
  "checklist": [
    {"text": "comprar leche", "done": false},
    {"text": "comprar pan", "done": false}
  ]
}

IMPORTANTE: Devuelve SOLO JSON válido, sin texto adicional.
`;

// --- HELPERS: COMPRESSION ---

const compressImage = async (base64: string, maxWidth = 800, quality = 0.7): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onerror = () => reject(new Error('Error al cargar la imagen'));
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('No se pudo obtener el contexto del canvas'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      } catch (error) {
        reject(error);
      }
    };
    img.src = base64;
  });
};

// --- AI HELPER ---
const callAI = async (params: { prompt: string, image?: string, audio?: string, mimeType?: string, systemInstruction?: string, isJson?: boolean }) => {
  // Nota: process.env no está disponible en el navegador en tiempo de ejecución.
  // Si necesitas desarrollo local, usa import.meta.env.VITE_API_KEY con Vite
  // Por ahora, siempre usamos el modo producción (serverless proxy)

  // 2. Modo Producción (Serverless Proxy)
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout for audio

    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: params.prompt,
        image: params.image ? params.image.split(',')[1] : undefined,
        audio: params.audio ? params.audio.split(',')[1] : undefined,
        mimeType: params.mimeType,
        systemInstruction: params.systemInstruction,
        isJson: params.isJson
      }),
      signal: controller.signal
    });
    // ... (rest of callAI)


    clearTimeout(timeoutId);

    if (!response.ok) {
      let err: any;
      try {
        err = await response.json();
      } catch {
        err = { error: `HTTP ${response.status}: ${response.statusText}` };
      }

      // Mejorar el mensaje de error para que sea más descriptivo
      let errorMessage = err.error || err.message || JSON.stringify(err);

      // Si es un objeto, intentar extraer información útil
      if (typeof err === 'object' && err !== null) {
        if (err.error) {
          errorMessage = err.error;
          if (err.details) {
            errorMessage += ` Details: ${typeof err.details === 'string' ? err.details : JSON.stringify(err.details)}`;
          }
        } else if (err.message) {
          errorMessage = err.message;
        } else if (err.details) {
          errorMessage = `Error: ${JSON.stringify(err.details)}`;
        } else {
          errorMessage = `Error: ${JSON.stringify(err)}`;
        }
      }

      if (typeof errorMessage !== 'string') {
        try {
          // Si es un objeto Error nativo, JSON.stringify devuelve {}, así que extraemos sus propiedades
          if (errorMessage instanceof Error) {
            errorMessage = `${errorMessage.name}: ${errorMessage.message}`;
          } else {
            errorMessage = JSON.stringify(errorMessage, null, 2);
          }
        } catch {
          errorMessage = String(errorMessage);
        }
      }

      console.error("[callAI] API Error:", {
        status: response.status,
        statusText: response.statusText,
        error: err,
        errorMessage
      });

      throw new Error(errorMessage);
    }

    let data;
    try {
      const responseText = await response.text();
      console.log("[callAI] Respuesta recibida (primeros 200 chars):", responseText.substring(0, 200));

      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        console.error("[callAI] Error parsing JSON:", parseError);
        console.error("[callAI] Respuesta completa:", responseText);
        throw new Error(`Error al procesar la respuesta del servidor (Invalid JSON). Respuesta: ${responseText.substring(0, 100)}...`);
      }
    } catch (parseError: any) {
      console.error("[callAI] Error parsing API response:", parseError);
      throw new Error(parseError.message || 'Error al procesar la respuesta del servidor');
    }

    if (!data || typeof data.text !== 'string') {
      console.error("[callAI] Respuesta inválida:", data);
      throw new Error(`Respuesta inválida del servidor (No text field). Estructura recibida: ${JSON.stringify(data).substring(0, 200)}`);
    }

    return data.text;

  } catch (fetchError: any) {
    // Manejar timeout
    if (fetchError.name === 'AbortError') {
      throw new Error('La solicitud tardó demasiado. Verifica tu conexión a internet.');
    }

    // Manejar errores de red
    if (fetchError.message?.includes('fetch failed') || fetchError.message?.includes('NetworkError')) {
      throw new Error('Error de conexión. Verifica que estés conectado a internet.');
    }

    // Re-lanzar otros errores
    throw fetchError;
  }
};

// --- COMPONENT: APP ---

const Inspector = ({ node, onClose, onUpdate, onDelete, onGenerateBrainstorm }: {
  node: IdeaNode,
  onClose: () => void,
  onUpdate: (n: IdeaNode) => void,
  onDelete: () => void,
  onGenerateBrainstorm: (n: IdeaNode) => void
}) => {

  const getCalendarLink = () => {
    const title = encodeURIComponent(node.title);
    const details = encodeURIComponent(`${node.summary}\n\nContexto:\n${node.originalContext}\n\nCoste: ${node.cost}`);
    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&details=${details}`;
  };

  const handleImageAdd = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = reader.result as string;
        const compressed = await compressImage(base64);
        onUpdate({ ...node, images: [...(node.images || []), compressed] });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files) as File[];
      const newAttachments: AttachmentFile[] = [];
      const errors: string[] = [];

      for (const file of files) {
        // Validar extensión del archivo
        const allowedExtensions = ['.pdf', '.doc', '.docx', '.txt', '.jpg', '.jpeg', '.png', '.gif', '.zip', '.rar'];
        const fileExt = '.' + (file.name.split('.').pop()?.toLowerCase() || '');

        if (!allowedExtensions.includes(fileExt)) {
          errors.push(`"${file.name}" tiene una extensión no permitida (${fileExt})`);
          continue;
        }

        // Limitar total de archivos por nodo
        if ((node.attachments || []).length + newAttachments.length >= 10) {
          errors.push('Máximo 10 archivos por nodo');
          break;
        }

        // Validar que el archivo tenga nombre
        if (!file.name || file.name.trim().length === 0) {
          errors.push("Un archivo no tiene nombre válido");
          continue;
        }

        // Limitar tamaño a 10MB por archivo
        if (file.size > 10 * 1024 * 1024) {
          errors.push(`"${file.name}" es demasiado grande (máximo 10MB)`);
          continue;
        }

        // Validar que el archivo no esté vacío
        if (file.size === 0) {
          errors.push(`"${file.name}" está vacío`);
          continue;
        }

        try {
          const reader = new FileReader();
          await new Promise<void>((resolve, reject) => {
            reader.onloadend = () => {
              try {
                const base64 = reader.result as string;
                if (!base64 || !base64.startsWith('data:')) {
                  reject(new Error(`Error al leer el archivo "${file.name}"`));
                  return;
                }

                const attachment: AttachmentFile = {
                  id: `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
                  name: file.name,
                  type: file.type || 'application/octet-stream', // Tipo por defecto si no está disponible
                  size: file.size,
                  data: base64,
                  uploadedAt: Date.now()
                };
                newAttachments.push(attachment);
                resolve();
              } catch (error) {
                reject(error);
              }
            };
            reader.onerror = () => reject(new Error(`Error al leer el archivo "${file.name}"`));
            reader.readAsDataURL(file);
          });
        } catch (error) {
          console.error(`Error procesando archivo "${file.name}":`, error);
          errors.push(`Error al procesar "${file.name}": ${error instanceof Error ? error.message : 'Error desconocido'}`);
        }
      }

      // Mostrar errores si los hay
      if (errors.length > 0) {
        alert(`Errores al subir archivos:\n${errors.join('\n')}`);
      }

      // Agregar archivos exitosos
      if (newAttachments.length > 0) {
        onUpdate({
          ...node,
          attachments: [...(node.attachments || []), ...newAttachments]
        });
      }

      // Reset input
      e.target.value = '';
    }
  };

  const handleFileDownload = (attachment: AttachmentFile) => {
    try {
      // Validar que el attachment tenga datos
      if (!attachment.data || attachment.data.trim().length === 0) {
        alert("El archivo no tiene datos válidos");
        return;
      }

      // Extraer la parte base64 (después de la coma)
      const base64Data = attachment.data.includes(',')
        ? attachment.data.split(',')[1]
        : attachment.data;

      if (!base64Data) {
        alert("Formato de archivo inválido");
        return;
      }

      // Decodificar base64
      const byteCharacters = atob(base64Data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: attachment.type || 'application/octet-stream' });

      // Crear URL y descargar
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = attachment.name || 'archivo';
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();

      // Limpiar
      setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }, 100);
    } catch (error) {
      console.error("Error downloading file:", error);
      alert(`Error al descargar el archivo: ${error instanceof Error ? error.message : 'Error desconocido'}`);
    }
  };

  const handleFileDelete = (attachmentId: string) => {
    onUpdate({
      ...node,
      attachments: (node.attachments || []).filter(a => a.id !== attachmentId)
    });
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType.includes('pdf')) return FileText;
    if (mimeType.includes('image')) return ImageIcon;
    if (mimeType.includes('word') || mimeType.includes('document')) return FileText;
    return FileType;
  };

  // Checklist handlers
  const toggleCheck = (id: string) => {
    const newChecklist = node.checklist.map(item =>
      item.id === id ? { ...item, done: !item.done } : item
    );
    onUpdate({ ...node, checklist: newChecklist });
  };

  const addCheckItem = (text: string) => {
    if (!text.trim()) return;
    const newItem: CheckListItem = {
      id: Date.now().toString(),
      text: text,
      done: false
    };
    onUpdate({ ...node, checklist: [...(node.checklist || []), newItem] });
  };

  const deleteCheckItem = (id: string) => {
    onUpdate({ ...node, checklist: node.checklist.filter(i => i.id !== id) });
  };

  return (
    <div className="fixed inset-x-0 bottom-0 h-[85vh] bg-white rounded-t-3xl shadow-[0_-10px_40px_rgba(0,0,0,0.1)] z-50 flex flex-col animate-in slide-in-from-bottom duration-300 touch-auto" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0)' }}>
      <div className="w-full flex justify-center pt-3 pb-1" onClick={onClose}>
        <div className="w-12 h-1.5 bg-slate-200 rounded-full" />
      </div>
      <div className="p-6 flex-1 overflow-y-auto">
        <div className="flex items-center justify-between text-slate-400 mb-4">
          <button onClick={onClose} className="p-2 bg-slate-100 rounded-full hover:bg-slate-200"><X className="w-5 h-5 text-slate-600" /></button>
          <button onClick={onDelete} className="text-red-500 px-3 py-1 bg-red-50 rounded-lg text-xs font-bold">ELIMINAR</button>
        </div>

        <div className="space-y-1 mb-6">
          <input value={node.category} onChange={e => onUpdate({ ...node, category: e.target.value })} className="text-xs font-bold text-cyan-600 uppercase tracking-wider bg-transparent outline-none w-full" placeholder="CATEGORIA" />
          <textarea value={node.title} onChange={e => onUpdate({ ...node, title: e.target.value })} className="text-2xl font-bold text-slate-800 bg-transparent outline-none w-full resize-none" rows={2} />
        </div>

        {/* Images Gallery */}
        <div className="flex gap-2 overflow-x-auto pb-4 mb-2">
          {node.images?.map((img, i) => (
            <div key={i} className="relative flex-shrink-0">
              <img src={img} className="h-20 w-20 object-cover rounded-xl border border-slate-200" />
              <button onClick={() => onUpdate({ ...node, images: node.images.filter((_, idx) => idx !== i) })} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1"><X className="w-3 h-3" /></button>
            </div>
          ))}
          <label className="h-20 w-20 flex-shrink-0 flex flex-col items-center justify-center border-2 border-dashed border-slate-300 rounded-xl text-slate-400 cursor-pointer hover:bg-slate-50">
            <ImageIcon className="w-6 h-6 mb-1" />
            <span className="text-[9px] font-bold">AÑADIR</span>
            <input type="file" accept="image/*" className="hidden" onChange={handleImageAdd} />
          </label>
        </div>

        {/* AI Actions */}
        <button onClick={() => onGenerateBrainstorm(node)} className="w-full py-3 mb-6 bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white rounded-xl font-bold shadow-lg flex items-center justify-center gap-2 hover:opacity-90 active:scale-95 transition-all">
          <Sparkles className="w-5 h-5" /> Generar Ideas con IA
        </button>

        <div className="grid grid-cols-2 gap-3 mb-6">
          <a href={getCalendarLink()} target="_blank" rel="noopener noreferrer" onClick={() => onUpdate({ ...node, status: 'scheduled' })} className={`flex flex-col items-center justify-center gap-1 p-4 rounded-2xl font-medium transition-colors ${node.status === 'scheduled' ? 'bg-green-100 text-green-700 border-2 border-green-200' : 'bg-slate-800 text-white active:scale-95 transition-transform'}`}>
            <Calendar className="w-6 h-6 mb-1" />
            <span className="text-sm">{node.status === 'scheduled' ? 'Agendado' : 'Agendar'}</span>
          </a>
          <div className="flex flex-col items-center justify-center gap-1 p-4 rounded-2xl bg-slate-50 border border-slate-100">
            <DollarSign className="w-6 h-6 text-emerald-500 mb-1" />
            <input type="number" value={node.cost} onChange={e => onUpdate({ ...node, cost: Number(e.target.value) })} className="bg-transparent w-full text-center outline-none font-bold text-slate-700 text-lg" placeholder="0" />
            <span className="text-[10px] text-slate-400 uppercase font-bold">Coste Est.</span>
          </div>
        </div>

        <div className="space-y-6">
          {/* CHECKLIST SECTION */}
          <div>
            <label className="flex items-center gap-2 text-[10px] font-bold text-slate-400 mb-3 uppercase"><CheckSquare className="w-3 h-3" />Tareas / Checklist</label>
            <div className="space-y-2">
              {node.checklist?.map((item) => (
                <div key={item.id} className="flex items-center gap-3 group">
                  <button onClick={() => toggleCheck(item.id)} className={`flex-shrink-0 transition-colors ${item.done ? 'text-green-500' : 'text-slate-300 hover:text-slate-400'}`}>
                    {item.done ? <CheckSquare className="w-6 h-6" /> : <Square className="w-6 h-6" />}
                  </button>
                  <span className={`flex-1 text-sm ${item.done ? 'line-through text-slate-400' : 'text-slate-700'}`}>{item.text}</span>
                  <button onClick={() => deleteCheckItem(item.id)} className="opacity-0 group-hover:opacity-100 p-1 text-red-400 hover:text-red-500 transition-opacity"><X className="w-4 h-4" /></button>
                </div>
              ))}
              <div className="flex items-center gap-3 mt-2">
                <Plus className="w-5 h-5 text-slate-400" />
                <input
                  className="flex-1 bg-transparent text-sm outline-none placeholder-slate-400 border-b border-transparent focus:border-cyan-200 py-1"
                  placeholder="Añadir nueva tarea..."
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      addCheckItem(e.currentTarget.value);
                      e.currentTarget.value = '';
                    }
                  }}
                />
              </div>
            </div>
          </div>

          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
            <label className="flex items-center gap-2 text-[10px] font-bold text-slate-400 mb-2 uppercase"><Info className="w-3 h-3" />Resumen IA</label>
            <textarea value={node.summary} onChange={e => onUpdate({ ...node, summary: e.target.value })} className="w-full bg-transparent text-sm text-slate-600 min-h-[80px] outline-none resize-none" />
          </div>
          {node.originalContext && (
            <div className="bg-yellow-50/50 p-4 rounded-2xl border border-yellow-100">
              <label className="flex items-center gap-2 text-[10px] font-bold text-yellow-600/70 mb-2 uppercase"><Mic className="w-3 h-3" />Transcripción</label>
              <div className="text-xs text-slate-600 italic leading-relaxed">"{node.originalContext}"</div>
            </div>
          )}
          <div>
            <label className="flex items-center gap-2 text-[10px] font-bold text-slate-400 mb-3 uppercase"><LinkIcon className="w-3 h-3" />Enlaces y Recursos</label>
            <div className="space-y-3">
              {/* Enlaces URL */}
              {node.links.map((link, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <input value={link} onChange={(e) => { const newLinks = [...node.links]; newLinks[i] = e.target.value; onUpdate({ ...node, links: newLinks }); }} className="flex-1 bg-white text-sm p-3 rounded-xl text-blue-600 border border-slate-200 shadow-sm" placeholder="https://..." />
                  <button onClick={() => { const newLinks = node.links.filter((_, idx) => idx !== i); onUpdate({ ...node, links: newLinks }); }} className="w-10 h-10 flex items-center justify-center bg-red-50 text-red-400 rounded-xl hover:bg-red-100 transition-colors"><X className="w-5 h-5" /></button>
                </div>
              ))}
              <button onClick={() => onUpdate({ ...node, links: [...node.links, ""] })} className="w-full py-3 flex items-center justify-center gap-2 text-sm text-slate-500 border border-dashed border-slate-300 rounded-xl hover:bg-slate-50 active:bg-slate-100 transition-colors"><Plus className="w-4 h-4" /> Añadir enlace</button>

              {/* Archivos adjuntos */}
              {node.attachments && node.attachments.length > 0 && (
                <div className="mt-4 pt-4 border-t border-slate-200">
                  <label className="flex items-center gap-2 text-[10px] font-bold text-slate-400 mb-3 uppercase"><FileText className="w-3 h-3" />Archivos Adjuntos</label>
                  <div className="space-y-2">
                    {node.attachments.map((attachment) => {
                      const FileIcon = getFileIcon(attachment.type);
                      return (
                        <div key={attachment.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200 group hover:bg-slate-100 transition-colors">
                          <div className="flex-shrink-0 w-10 h-10 bg-white rounded-lg flex items-center justify-center border border-slate-200">
                            <FileIcon className="w-5 h-5 text-slate-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-slate-800 truncate">{attachment.name}</div>
                            <div className="text-[10px] text-slate-500">{formatFileSize(attachment.size)}</div>
                          </div>
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => handleFileDownload(attachment)}
                              className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                              title="Descargar"
                            >
                              <Download className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleFileDelete(attachment.id)}
                              className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                              title="Eliminar"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Botón para subir archivos */}
              <label className="w-full py-3 flex items-center justify-center gap-2 text-sm text-slate-500 border border-dashed border-slate-300 rounded-xl hover:bg-slate-50 active:bg-slate-100 transition-colors cursor-pointer">
                <FileText className="w-4 h-4" />
                <span>Subir archivo (PDF, imágenes, etc.)</span>
                <input
                  type="file"
                  multiple
                  accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png,.gif,.zip,.rar"
                  className="hidden"
                  onChange={handleFileUpload}
                />
              </label>
            </div>
          </div>
        </div>
        <div className="h-20" />
      </div>
    </div>
  );
};

const App = () => {
  // -- STATE --
  const [nodes, setNodes] = useState<IdeaNode[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, scale: 1 });

  // Selection & Inspection
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null); // Highlighted only
  const [inspectorNodeId, setInspectorNodeId] = useState<string | null>(null); // Panel open
  const [isMenuOpen, setIsMenuOpen] = useState(false); // Sidebar state

  // Chat State
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    { role: 'model', text: 'Hola. Soy tu asistente de proyecto. Pregúntame sobre costes, tareas pendientes o resúmenes de tus ideas.' }
  ]);
  const [isChatLoading, setIsChatLoading] = useState(false);

  // Persistence State
  const [isLoaded, setIsLoaded] = useState(false);

  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [recognitionStatus, setRecognitionStatus] = useState<string>("");
  const [lastProcessTime, setLastProcessTime] = useState(0); // Rate limiting

  // Audio Visualizer State
  const [audioData, setAudioData] = useState<Uint8Array>(new Uint8Array(0));
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioInitLock = useRef<boolean>(false); // Prevenir race conditions en audio init

  // Interaction States
  const [tempConnection, setTempConnection] = useState<{ sourceId: string, endX: number, endY: number } | null>(null);

  // Undo/Redo History Stacks
  const pastHistory = useRef<{ nodes: IdeaNode[], connections: Connection[] }[]>([]);
  const futureHistory = useRef<{ nodes: IdeaNode[], connections: Connection[] }[]>([]);
  // To force re-render on history change
  const [historyVersion, setHistoryVersion] = useState(0);

  // --- GESTURE & POINTER REFS ---
  const canvasRef = useRef<HTMLDivElement>(null);

  // Pointers map for multi-touch logic (ID -> {x, y})
  const activePointers = useRef(new Map<number, { x: number, y: number }>());
  const initialPinchDistance = useRef<number | null>(null);
  const initialViewportScale = useRef<number>(1);

  // Node Interaction Refs
  const draggingNodeId = useRef<string | null>(null);
  const dragStartPos = useRef<{ x: number, y: number } | null>(null);
  const lastNodeTapTime = useRef<{ id: string, time: number } | null>(null);
  const isDraggingNodeRef = useRef(false);

  // Physics Refs
  const simulationFrameRef = useRef<number | null>(null);
  const alphaRef = useRef(0); // Simulation energy (0 to 1)

  // -- PERSISTENCE & INITIALIZATION --

  // Load Initial Data
  useEffect(() => {
    const loadData = async () => {
      try {
        const storedNodes = await db.nodes.toArray();
        const storedConnections = await db.connections.toArray();
        const meta = await getMetadata();

        if (storedNodes.length > 0) {
          // Asegurar compatibilidad: inicializar attachments si no existe
          const normalizedNodes = storedNodes.map(node => ({
            ...node,
            attachments: node.attachments || []
          }));
          setNodes(normalizedNodes);
          setConnections(storedConnections);
          if (meta.viewport) setViewport(meta.viewport);
          if (meta.selectedNodeId) setSelectedNodeId(meta.selectedNodeId);
        } else {
          // No data -> Ready but empty
          setViewport({ x: 0, y: 0, scale: 1 });
        }
        setIsLoaded(true);
      } catch (e) {
        console.error("Failed to load DB data", e);
        setIsLoaded(true);
      }
    };
    loadData();
  }, []);

  // Save Data on Change
  useEffect(() => {
    if (!isLoaded) return;

    // Debounce save
    const timeoutId = setTimeout(async () => {
      try {
        await db.transaction('rw', db.nodes, db.connections, db.metadata, async () => {
          // Full sync strategy: Clear and bulk add is safest for React state sync
          // For very large datasets, we would optimize this to only save diffs, 
          // but for < 10k nodes this is fine and robust.
          await db.nodes.clear();
          await db.nodes.bulkAdd(nodes);

          await db.connections.clear();
          await db.connections.bulkAdd(connections);

          await saveViewport(viewport);
          await saveSelectedNode(selectedNodeId);
        });
      } catch (e) {
        console.error("Failed to save to DB", e);
      }
    }, 1000);
    return () => clearTimeout(timeoutId);
  }, [nodes, connections, viewport, selectedNodeId, isLoaded]);

  // Handle Device Orientation Changes (Mobile)
  useEffect(() => {
    const handleOrientationChange = () => {
      console.log('[Mobile] Orientación cambiada');
      // El viewport ya se ajustará automáticamente con el resize del window
      // pero podemos forzar un re-render si es necesario
    };

    window.addEventListener('orientationchange', handleOrientationChange);
    window.addEventListener('resize', handleOrientationChange);

    return () => {
      window.removeEventListener('orientationchange', handleOrientationChange);
      window.removeEventListener('resize', handleOrientationChange);
    };
  }, []);


  // -- HISTORY MANAGEMENT --

  const saveSnapshot = useCallback(() => {
    // Limit history size to 50
    if (pastHistory.current.length > 50) pastHistory.current.shift();

    pastHistory.current.push({
      nodes: JSON.parse(JSON.stringify(nodes)), // Deep copy
      connections: JSON.parse(JSON.stringify(connections))
    });
    futureHistory.current = []; // Clear redo stack on new action
    setHistoryVersion(v => v + 1);
  }, [nodes, connections]);

  const undo = () => {
    if (pastHistory.current.length === 0) return;

    const previous = pastHistory.current.pop();
    if (previous) {
      futureHistory.current.push({
        nodes: JSON.parse(JSON.stringify(nodes)),
        connections: JSON.parse(JSON.stringify(connections))
      });

      setNodes(previous.nodes);
      setConnections(previous.connections);
      setHistoryVersion(v => v + 1);
      wakeSimulation();
    }
  };

  const redo = () => {
    if (futureHistory.current.length === 0) return;

    const next = futureHistory.current.pop();
    if (next) {
      pastHistory.current.push({
        nodes: JSON.parse(JSON.stringify(nodes)),
        connections: JSON.parse(JSON.stringify(connections))
      });

      setNodes(next.nodes);
      setConnections(next.connections);
      setHistoryVersion(v => v + 1);
      wakeSimulation();
    }
  };

  // -- PHYSICS ENGINE --

  const wakeSimulation = useCallback(() => {
    alphaRef.current = 1.0; // Reset energy
    if (!simulationFrameRef.current) {
      runSimulationStep();
    }
  }, []);

  const runSimulationStep = () => {
    if (alphaRef.current <= 0.05) {
      simulationFrameRef.current = null;
      return;
    }

    setNodes(prevNodes => {
      const newNodes = prevNodes.map(n => ({ ...n }));
      const nodeCount = newNodes.length;

      const repulsionRadius = 250;
      const repulsionStrength = 50 * alphaRef.current;
      const springLength = 200;
      const springStrength = 0.05 * alphaRef.current;

      // Repulsion
      for (let i = 0; i < nodeCount; i++) {
        if (newNodes[i].id === draggingNodeId.current) continue;

        for (let j = i + 1; j < nodeCount; j++) {
          if (newNodes[j].id === draggingNodeId.current) continue;

          const n1 = newNodes[i];
          const n2 = newNodes[j];
          const dx = n1.x - n2.x;
          const dy = n1.y - n2.y;
          const distSq = dx * dx + dy * dy || 1;
          const dist = Math.sqrt(distSq);

          if (dist < repulsionRadius) {
            const force = (repulsionRadius - dist) / repulsionRadius;
            const fx = (dx / dist) * force * repulsionStrength;
            const fy = (dy / dist) * force * repulsionStrength;
            n1.x += fx; n1.y += fy;
            n2.x -= fx; n2.y -= fy;
          }
        }
      }

      // Springs (reading from closure state 'connections', might be slightly stale but ok for visual physics)
      connections.forEach(conn => {
        const source = newNodes.find(n => n.id === conn.sourceId);
        const target = newNodes.find(n => n.id === conn.targetId);

        if (source && target) {
          if (source.id === draggingNodeId.current && target.id === draggingNodeId.current) return;

          const dx = target.x - source.x;
          const dy = target.y - source.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;

          const displacement = dist - springLength;
          const force = displacement * springStrength;

          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;

          if (source.id !== draggingNodeId.current) { source.x += fx; source.y += fy; }
          if (target.id !== draggingNodeId.current) { target.x -= fx; target.y -= fy; }
        }
      });

      return newNodes;
    });

    alphaRef.current *= 0.92;
    simulationFrameRef.current = requestAnimationFrame(runSimulationStep);
  };

  useEffect(() => {
    wakeSimulation();
  }, [nodes.length, connections.length, wakeSimulation]);

  // Cleanup audio resources when component unmounts
  useEffect(() => {
    return () => {
      console.log("[Cleanup] Limpiando recursos de audio");
      stopAudioAnalysis();
    };
  }, []);


  // -- TREE TRAVERSAL HELPERS --

  const getRootAncestor = (nodeId: string, allConnections: Connection[]): string => {
    let currentId = nodeId;
    let hasParent = true;
    while (hasParent) {
      const parentConn = allConnections.find(c => c.targetId === currentId);
      if (parentConn) {
        currentId = parentConn.sourceId;
      } else {
        hasParent = false;
      }
    }
    return currentId;
  };

  const getDescendants = (rootId: string, allConnections: Connection[]): Set<string> => {
    const descendants = new Set<string>();
    const queue = [rootId];

    while (queue.length > 0) {
      const curr = queue.shift()!;
      descendants.add(curr);
      const children = allConnections
        .filter(c => c.sourceId === curr)
        .map(c => c.targetId);
      queue.push(...children);
    }
    return descendants;
  };

  const rootNodes = useMemo(() => {
    const targetIds = new Set(connections.map(c => c.targetId));
    return nodes.filter(n => !targetIds.has(n.id));
  }, [nodes, connections]);

  const visibleNodes = useMemo(() => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return nodes.filter(n =>
        n.title.toLowerCase().includes(q) ||
        n.category.toLowerCase().includes(q) ||
        n.summary.toLowerCase().includes(q)
      ).map(n => ({ ...n, isDimmed: false }));
    }
    if (!selectedNodeId) {
      return rootNodes.map(n => ({ ...n, isDimmed: false }));
    }
    const rootId = getRootAncestor(selectedNodeId, connections);
    const descendantIds = getDescendants(rootId, connections);
    const validIds = new Set([rootId, ...descendantIds]);
    return nodes.filter(n => validIds.has(n.id)).map(n => ({ ...n, isDimmed: false }));

  }, [nodes, connections, selectedNodeId, searchQuery, rootNodes]);

  const visibleConnections = useMemo(() => {
    const visibleNodeIds = new Set(visibleNodes.map(n => n.id));
    return connections.filter(c => visibleNodeIds.has(c.sourceId) && visibleNodeIds.has(c.targetId));
  }, [connections, visibleNodes]);

  const getNodeStyle = (node: IdeaNode) => {
    const isGlobalRoot = !connections.some(c => c.targetId === node.id);
    if (isGlobalRoot) {
      return "bg-cyan-500 text-white text-lg font-bold py-4 px-6 rounded-full shadow-cyan-500/30 border-4 border-cyan-200";
    }
    return "bg-amber-100 text-slate-800 text-xs font-medium py-2 px-4 rounded-full border-2 border-amber-300 shadow-sm";
  };

  const drawCurve = (x1: number, y1: number, x2: number, y2: number) => {
    return `M ${x1} ${y1} C ${x1 + (x2 - x1) / 2} ${y1}, ${x2 - (x2 - x1) / 2} ${y2}, ${x2} ${y2}`;
  };

  // -- HELPERS --

  const focusOnNode = (nodeId: string) => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    setViewport({
      x: cx - node.x * 1,
      y: cy - node.y * 1,
      scale: 1
    });
    setSelectedNodeId(nodeId);
  };

  const startAudioAnalysis = async () => {
    // Prevenir race conditions con lock
    if (audioInitLock.current) {
      console.warn('[Audio] Ya se está inicializando el audio, esperando...');
      return;
    }

    audioInitLock.current = true;
    try {
      // Cerrar stream anterior si existe
      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach(track => track.stop());
        audioStreamRef.current = null;
      }

      // Cerrar AudioContext anterior si existe
      if (audioContextRef.current) {
        try {
          await audioContextRef.current.close();
        } catch (e) {
          console.log("[Audio] Error cerrando AudioContext anterior:", e);
        }
        audioContextRef.current = null;
      }

      // Cancelar animación anterior si existe
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }

      console.log("[Audio] Solicitando acceso al micrófono...");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      console.log("[Audio] Acceso al micrófono concedido");

      audioStreamRef.current = stream;
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) {
        throw new Error('Este navegador no soporta AudioContext.');
      }
      const audioCtx = new AudioContextClass();
      if (audioCtx.state === 'suspended') {
        try {
          await audioCtx.resume();
        } catch (resumeError) {
          console.warn("[Audio] No se pudo reanudar AudioContext automáticamente:", resumeError);
        }
      }
      audioContextRef.current = audioCtx;
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      analyserRef.current = analyser;
      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      const updateVisualizer = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);
        setAudioData(new Uint8Array(dataArray));
        animationFrameRef.current = requestAnimationFrame(updateVisualizer);
      };
      updateVisualizer();
      console.log("[Audio] Visualizador de audio iniciado");
    } catch (e: any) {
      console.error("[Audio] Error al inicializar visualizador de audio:", e);
      throw e; // Re-lanzar el error para que handleMicClick lo maneje
    } finally {
      audioInitLock.current = false;
    }
  };

  const stopAudioAnalysis = () => {
    console.log("[Audio] Deteniendo análisis de audio...");

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    if (audioContextRef.current) {
      try {
        audioContextRef.current.close().catch((e: any) => {
          console.log("[Audio] Error cerrando AudioContext:", e);
        });
      } catch (e) {
        console.log("[Audio] Error al intentar cerrar AudioContext:", e);
      }
      audioContextRef.current = null;
    }

    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach(track => {
        track.stop();
        console.log("[Audio] Track detenido:", track.kind);
      });
      audioStreamRef.current = null;
    }

    analyserRef.current = null;
    setAudioData(new Uint8Array(0));
    console.log("[Audio] Análisis de audio detenido");
  };

  const getSupportedMimeType = () => {
    if (typeof window === 'undefined' || typeof MediaRecorder === 'undefined') {
      return 'audio/webm'; // Fallback por defecto
    }

    if (typeof MediaRecorder.isTypeSupported !== 'function') {
      console.warn('[Audio] MediaRecorder.isTypeSupported no disponible, usando fallback');
      return 'audio/webm';
    }

    const mimeTypes = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/ogg',
      'audio/wav'
    ];

    const supported = mimeTypes.find(type => MediaRecorder.isTypeSupported(type));
    return supported || 'audio/webm'; // Fallback explícito
  };

  const isSecureOrigin = () => {
    if (typeof window === 'undefined') return false;
    if (window.isSecureContext || location.protocol === 'https:') return true;
    const allowedHosts = ['localhost', '127.0.0.1'];
    return allowedHosts.includes(location.hostname);
  };

  const promptManualIdea = () => {
    const manualText = prompt("Tu navegador no puede usar el micrófono. Escribe tu idea:");
    if (manualText && manualText.trim()) {
      processInput(manualText.trim());
    } else if (manualText !== null) {
      alert("No ingresaste ninguna idea. Intenta de nuevo.");
    }
  };

  const ensureMicPermission = async () => {
    if (!navigator.permissions || !navigator.permissions.query) return;
    try {
      const permissionStatus = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      if (permissionStatus.state === 'denied') {
        throw new Error('MIC_PERMISSION_DENIED');
      }
    } catch (error: any) {
      if (error?.message === 'MIC_PERMISSION_DENIED') {
        throw error;
      }
      // Safari iOS no soporta navigator.permissions para micrófono: ignoramos ese error.
    }
  };

  const mapMicErrorToMessage = (error: any): string => {
    if (!error) return "No se pudo usar el micrófono.";
    if (typeof error === 'string') return error;

    if (error.message === 'MIC_PERMISSION_DENIED') {
      return "El micrófono está bloqueado para este sitio. Habilítalo desde el icono de candado del navegador y recarga la página.";
    }
    if (error.message === 'MEDIA_RECORDER_UNSUPPORTED') {
      return "Este navegador no soporta grabación de audio. Usa la versión más reciente de Chrome, Edge o Safari, o dicta desde escritorio.";
    }

    const name = error.name || '';
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') {
      return "Debes conceder permiso de micrófono para poder grabar.";
    }
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
      return "No se detectó ningún micrófono. Conecta uno y vuelve a intentarlo.";
    }
    if (name === 'NotReadableError' || name === 'TrackStartError') {
      return "Otra aplicación está usando el micrófono. Ciérrala e inténtalo nuevamente.";
    }
    if (name === 'OverconstrainedError') {
      return "No hay dispositivo de audio compatible con la configuración solicitada.";
    }

    return error.message || "Error desconocido al acceder al micrófono.";
  };

  const startRecording = async () => {
    try {
      await startAudioAnalysis();

      const stream = audioStreamRef.current;
      if (!stream) {
        throw new Error("No se pudo inicializar el micrófono.");
      }

      if (typeof window === 'undefined' || typeof MediaRecorder === 'undefined') {
        throw new Error('MEDIA_RECORDER_UNSUPPORTED');
      }

      const mimeType = getSupportedMimeType();
      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      } catch (recorderError) {
        console.warn("[Audio] MediaRecorder no aceptó el mimeType seleccionado, reintentando sin opciones explícitas.", recorderError);
        recorder = new MediaRecorder(stream);
      }

      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data?.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onerror = (event: any) => {
        console.error("[Audio] MediaRecorder error:", event?.error || event);
        stopAudioAnalysis();
        mediaRecorderRef.current = null;
        audioChunksRef.current = [];
        setIsRecording(false);
        setRecognitionStatus("");
        alert(mapMicErrorToMessage(event?.error || event));
      };

      recorder.start();
      setIsRecording(true);
      setRecognitionStatus("Grabando... (toca para terminar)");
    } catch (error) {
      stopAudioAnalysis();
      setIsRecording(false);
      throw error;
    }
  };

  const stopRecording = () => {
    return new Promise<{ audio: string, mimeType: string }>((resolve, reject) => {
      const mediaRecorder = mediaRecorderRef.current;
      if (!mediaRecorder) {
        reject(new Error("No hay una grabación activa."));
        return;
      }

      mediaRecorder.onstop = () => {
        const mimeType = mediaRecorder.mimeType || getSupportedMimeType() || 'audio/webm';
        mediaRecorderRef.current = null;
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        audioChunksRef.current = [];
        const reader = new FileReader();
        reader.onloadend = () => {
          stopAudioAnalysis();
          resolve({ audio: reader.result as string, mimeType });
        };
        reader.onerror = () => {
          stopAudioAnalysis();
          reject(new Error("Error al leer la grabación."));
        };
        reader.readAsDataURL(audioBlob);
        setIsRecording(false);
      };

      mediaRecorder.onerror = (event: any) => {
        console.error("[Audio] Error al detener MediaRecorder:", event?.error || event);
        mediaRecorderRef.current = null;
        audioChunksRef.current = [];
        stopAudioAnalysis();
        setIsRecording(false);
        reject(event?.error || new Error("Error en la grabación."));
      };

      setRecognitionStatus("Procesando audio...");
      mediaRecorder.stop();
    });
  };

  // -- EXPORT HELPERS --

  const exportAsImage = () => {
    const nodesToExport = visibleNodes;
    const connectionsToExport = visibleConnections;

    if (nodesToExport.length === 0) {
      alert('No hay nodos visibles para exportar');
      return;
    }

    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        alert('Tu navegador no soporta exportación de imágenes');
        return;
      }

      // Calculate bounds with padding
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      nodesToExport.forEach(n => {
        minX = Math.min(minX, n.x - 120);
        minY = Math.min(minY, n.y - 60);
        maxX = Math.max(maxX, n.x + 120);
        maxY = Math.max(maxY, n.y + 60);
      });

      const width = maxX - minX;
      const height = maxY - minY;

      // Validar tamaño máximo del canvas
      const MAX_CANVAS_SIZE = 16384; // Límite seguro para la mayoría de navegadores
      if (width > MAX_CANVAS_SIZE || height > MAX_CANVAS_SIZE) {
        alert(`El mapa es demasiado grande para exportar (${Math.round(width)}×${Math.round(height)}px).\n\nIntenta:\n• Reducir el zoom\n• Filtrar nodos con búsqueda\n• Exportar en partes más pequeñas\n\nTamaño máximo: ${MAX_CANVAS_SIZE}×${MAX_CANVAS_SIZE}px`);
        return;
      }

      canvas.width = width;
      canvas.height = height;

      // Background
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(0, 0, width, height);

      ctx.translate(-minX, -minY);

      // Draw Connections
      connectionsToExport.forEach(conn => {
        const source = nodesToExport.find(n => n.id === conn.sourceId);
        const target = nodesToExport.find(n => n.id === conn.targetId);
        if (!source || !target) return;

        ctx.beginPath();
        const isRootSource = !connections.some(c => c.targetId === source.id);

        const x1 = source.x, y1 = source.y;
        const x2 = target.x, y2 = target.y;
        ctx.moveTo(x1, y1);
        ctx.bezierCurveTo(x1 + (x2 - x1) / 2, y1, x2 - (x2 - x1) / 2, y2, x2, y2);

        ctx.strokeStyle = isRootSource ? "#22d3ee" : "#a3e635";
        ctx.lineWidth = isRootSource ? 3 : 1.5;
        ctx.stroke();
      });

      // Draw Nodes
      nodesToExport.forEach(node => {
        const isGlobalRoot = !connections.some(c => c.targetId === node.id);

        const w = 160;
        const h = isGlobalRoot ? 60 : 40;
        const x = node.x - w / 2;
        const y = node.y - h / 2;

        // Node Body
        ctx.beginPath();
        if (ctx.roundRect) {
          ctx.roundRect(x, y, w, h, 999);
        } else {
          ctx.rect(x, y, w, h); // Fallback
        }

        ctx.fillStyle = isGlobalRoot ? '#06b6d4' : '#fef3c7';
        ctx.fill();
        ctx.strokeStyle = isGlobalRoot ? '#bae6fd' : '#fcd34d';
        ctx.lineWidth = isGlobalRoot ? 4 : 2;
        ctx.stroke();

        // Node Text
        ctx.fillStyle = isGlobalRoot ? '#ffffff' : '#1e293b';
        ctx.font = isGlobalRoot ? 'bold 14px sans-serif' : '500 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const text = node.title.length > 20 ? node.title.substring(0, 20) + '...' : node.title;
        ctx.fillText(text, node.x, node.y);
      });

      const link = document.createElement('a');
      link.download = 'ideaverse-map.png';
      link.href = canvas.toDataURL();
      link.click();

    } catch (error) {
      console.error('Error al exportar imagen:', error);
      alert('Error al exportar la imagen. Intenta con menos nodos visibles o reduce el zoom.');
    }
  };

  const exportAsMarkdown = () => {
    const nodesToExport = visibleNodes;
    const connectionsToExport = visibleConnections;

    const roots = nodesToExport.filter(n => !connectionsToExport.some(c => c.targetId === n.id));

    let md = "# Exportación de Ideas\n\n";

    const printNode = (nodeId: string, level: number) => {
      const node = nodesToExport.find(n => n.id === nodeId);
      if (!node) return;

      const indent = "  ".repeat(level);
      md += `${indent}- **${node.title}** (${node.status === 'scheduled' ? 'Agendado' : 'Borrador'})\n`;
      if (node.summary && node.summary !== 'Generado por IA') md += `${indent}  > ${node.summary.replace(/\n/g, ' ')}\n`;
      if (node.cost > 0) md += `${indent}  💰 Coste: ${node.cost}\n`;

      if (node.checklist && node.checklist.length > 0) {
        node.checklist.forEach(item => {
          md += `${indent}  - [${item.done ? 'x' : ' '}] ${item.text}\n`;
        });
      }

      const children = connectionsToExport
        .filter(c => c.sourceId === nodeId)
        .map(c => c.targetId);

      children.forEach(childId => printNode(childId, level + 1));
    };

    roots.forEach(root => printNode(root.id, 0));

    const blob = new Blob([md], { type: 'text/markdown' });
    const link = document.createElement('a');
    link.download = 'ideaverse-export.md';
    link.href = URL.createObjectURL(blob);
    link.click();
  };

  const createManualProject = () => {
    const title = prompt("Nombre del nuevo proyecto:");
    if (!title || !title.trim()) return;

    saveSnapshot();

    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    const startX = (cx - viewport.x) / viewport.scale;
    const startY = (cy - viewport.y) / viewport.scale;

    const newNode: IdeaNode = {
      id: Date.now().toString(),
      x: startX,
      y: startY,
      title: title,
      summary: "Proyecto manual",
      originalContext: "",
      category: "Proyecto",
      cost: 0,
      links: [],
      images: [],
      attachments: [],
      checklist: [],
      type: 'text',
      status: 'draft',
      createdAt: Date.now()
    };

    setNodes(prev => [...prev, newNode]);
    setSelectedNodeId(newNode.id);
    setIsMenuOpen(false);
    wakeSimulation();
  };

  // -- AI SERVICE --

  const processInput = async (input: string | { image: string, prompt?: string } | { audio: string, mimeType: string }, isImage = false) => {
    // Rate limiting: prevenir spam de requests
    const now = Date.now();
    if (now - lastProcessTime < 2000) { // 2 segundos de cooldown
      console.warn('[ProcessInput] Cooldown activo, espera antes de procesar otra idea');
      alert('Por favor espera un momento antes de procesar otra idea.');
      return;
    }
    setLastProcessTime(now);

    saveSnapshot(); // Save state before AI creates new nodes

    let text = "";
    let audioData: { audio: string, mimeType: string } | null = null;

    if (isImage) {
      const inp = input as { image: string, prompt?: string };
      text = inp.prompt || "Analiza esta imagen y crea una estructura de idea relevante.";
    } else if (typeof input === 'object' && 'audio' in input) {
      audioData = input as { audio: string, mimeType: string };
      text = ""; // El texto vendrá de la transcripción
    } else {
      text = typeof input === 'string' ? input : '';
    }

    text = (text || "").trim();

    if (!text && !audioData) {
      alert("No se detectó ningún texto para procesar. Intenta dictar nuevamente o escribe tu idea manualmente.");
      return;
    }

    const lowerText = text.toLowerCase();
    const isExplicitNewRoot =
      lowerText.includes('crear nueva idea') ||
      lowerText.includes('nuevo proyecto') ||
      lowerText.includes('nueva idea principal') ||
      lowerText.includes('crear proyecto');

    setIsProcessing(true);
    try {
      let parentNodeId = isExplicitNewRoot ? null : selectedNodeId;
      let parentNode = parentNodeId ? nodes.find(n => n.id === parentNodeId) : null;

      if (!parentNode && !isExplicitNewRoot) {
        parentNodeId = null;
      }

      // Construir Prompt Unificado
      let fullPrompt = text;

      // CRÍTICO: Si solo hay audio sin texto, necesitamos un prompt que pida JSON
      if (audioData && !text) {
        fullPrompt = `Escucha el audio adjunto, transcríbelo y extrae la información para generar ÚNICAMENTE JSON válido con esta estructura exacta:

{
  "title": "título corto (max 5 palabras)",
  "summary": "resumen claro (max 20 palabras)",
  "category": "categoría",
  "cost": 0,
  "links": [],
  "checklist": [{"text": "tarea", "done": false}]
}

NO agregues texto explicativo antes o después del JSON. Devuelve SOLO el objeto JSON.`;
        console.log("[ProcessInput] Audio sin texto - usando prompt automático con estructura JSON explícita");
      }

      if (parentNode) {
        const inputDesc = audioData ? "NUEVA IDEA (de audio transcrito)" : "NUEVA IDEA (INPUT USUARIO)";
        const inputText = audioData && !text ? "Transcribe el audio y estructura la idea" : text;

        fullPrompt = `
        CONTEXTO (La nueva idea es hija de este nodo):
        - Título Padre: "${parentNode.title}"
        - Resumen Padre: "${parentNode.summary}"
        - Categoría Padre: "${parentNode.category}"

        ${inputDesc}:
        "${inputText}"
        
        Instrucción: Genera el JSON para la NUEVA IDEA interpretándola dentro del contexto del padre.
    `;
      }

      const responseText = await callAI({
        prompt: fullPrompt,
        image: isImage ? (input as any).image : undefined,
        audio: audioData ? audioData.audio : undefined,
        mimeType: audioData ? audioData.mimeType : undefined,
        systemInstruction: SYSTEM_INSTRUCTION,
        isJson: true
      });

      let data;
      let cleanedResponse = ""; // Declarar fuera del try para que esté disponible en catch
      try {
        // Limpiar markdown code blocks y extraer JSON puro
        cleanedResponse = responseText || "{}";

        // Método robusto: buscar las llaves del JSON
        const firstBrace = cleanedResponse.indexOf('{');
        const lastBrace = cleanedResponse.lastIndexOf('}');

        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
          // Extraer solo el contenido entre llaves
          cleanedResponse = cleanedResponse.substring(firstBrace, lastBrace + 1);
        } else {
          // Fallback: limpiar markdown tradicional
          cleanedResponse = cleanedResponse.trim();

          // Remover ```json, ```JSON, ``` json, etc. (case insensitive)
          cleanedResponse = cleanedResponse.replace(/^```\s*json\s*/i, '');
          cleanedResponse = cleanedResponse.replace(/^```\s*/, '');
          cleanedResponse = cleanedResponse.replace(/\s*```$/, '');
          cleanedResponse = cleanedResponse.trim();
        }

        console.log("[ProcessInput] Respuesta limpia para parsear:", cleanedResponse.substring(0, 200) + "...");

        data = JSON.parse(cleanedResponse);

        // Debug logging
        console.log("[ProcessInput] Respuesta AI parseada:", data);

        // Validar estructura mínima del JSON
        if (!data || typeof data !== 'object') {
          throw new Error('La respuesta no es un objeto JSON válido');
        }

        // Validar y normalizar campos con valores por defecto
        const validatedData = {
          title: (data.title && typeof data.title === 'string') ? data.title.trim() : 'Nueva Idea',
          summary: (data.summary && typeof data.summary === 'string') ? data.summary.trim() : 'Sin resumen',
          category: (data.category && typeof data.category === 'string') ? data.category.trim() : 'General',
          cost: (typeof data.cost === 'number' && data.cost >= 0) ? data.cost : 0,
          links: Array.isArray(data.links) ? data.links.filter(l => typeof l === 'string') : [],
          checklist: Array.isArray(data.checklist) ? data.checklist : []
        };

        // Reemplazar data con validatedData
        data = validatedData;
        console.log("[ProcessInput] Datos validados:", data);

        // Validar y normalizar checklist
        if (data.checklist) {
          // Si es string, parsear manualmente
          if (typeof data.checklist === 'string') {
            console.warn("[ProcessInput] Checklist es string, parseando:", data.checklist);
            const items = data.checklist
              .split(/[,\n]/)
              .map(s => s.trim())
              .filter(s => s.length > 0)
              .map(text => ({ text, done: false }));
            data.checklist = items;
          }

          // Si es array de strings, convertir a objetos
          if (Array.isArray(data.checklist) && data.checklist.length > 0) {
            if (typeof data.checklist[0] === 'string') {
              console.warn("[ProcessInput] Convirtiendo array de strings a objetos");
              data.checklist = data.checklist.map(text => ({ text, done: false }));
            }

            // Normalizar campos (text, description, task, etc.)
            data.checklist = data.checklist.map((item, i) => {
              if (!item || typeof item !== 'object') {
                console.warn(`[ProcessInput] Item ${i} inválido, skipping`);
                return null;
              }

              const text = item.text || item.description || item.task || item.name || String(item);
              return {
                text: text.trim(),
                done: item.done === true
              };
            }).filter(item => item !== null && item.text?.length > 0);
          }

          console.log("[ProcessInput] Checklist normalizado:", data.checklist);
        }

      } catch (parseError) {
        console.error("[ProcessInput] Error parsing AI response:", parseError);
        console.error("[ProcessInput] Respuesta completa recibida:", responseText);
        console.error("[ProcessInput] Respuesta limpia intentada:", cleanedResponse);

        throw new Error(`Error procesando la idea: La respuesta de la IA no es válida.

Posibles causas:
- La IA devolvió texto en lugar de JSON estructurado
- Problema de conectividad con Gemini
- Audio no transcrito correctamente

Por favor, intenta de nuevo. Si el error persiste, revisa los logs de la consola.`);
      }

      let startX, startY;
      if (parentNode) {
        const angle = Math.random() * Math.PI * 2;
        const distance = 150;
        startX = parentNode.x + Math.cos(angle) * distance;
        startY = parentNode.y + Math.sin(angle) * distance;
      } else {
        const cx = window.innerWidth / 2;
        const cy = window.innerHeight / 2;
        startX = (cx - viewport.x) / viewport.scale;
        startY = (cy - viewport.y) / viewport.scale;
      }

      const newNode: IdeaNode = {
        id: Date.now().toString(),
        x: startX,
        y: startY,
        title: data.title || "Nueva Idea",
        summary: data.summary || text.substring(0, 50),
        originalContext: text,
        category: data.category || "General",
        cost: data.cost || 0,
        links: data.links || [],
        images: isImage ? [(input as any).image] : [],
        attachments: [],
        checklist: (() => {
          try {
            if (!data.checklist || !Array.isArray(data.checklist)) {
              return [];
            }

            return data.checklist
              .map((item: any, i: number) => {
                if (!item || typeof item !== 'object') {
                  console.warn(`[ProcessInput] Skipping invalid checklist item ${i}:`, item);
                  return null;
                }

                const text = item.text || '';
                if (!text || typeof text !== 'string' || text.trim().length === 0) {
                  console.warn(`[ProcessInput] Skipping item ${i} without text:`, item);
                  return null;
                }

                return {
                  id: `task-${Date.now()}-${i}`,
                  text: text.trim(),
                  done: item.done === true
                };
              })
              .filter((item): item is CheckListItem => item !== null);

          } catch (error) {
            console.error("[ProcessInput] Error procesando checklist:", error);
            return [];
          }
        })(),
        type: isImage ? 'image' : 'text',
        status: 'draft',
        createdAt: Date.now()
      };

      setNodes(prev => [...prev, newNode]);

      if (parentNode) {
        setConnections(prev => {
          // Prevenir conexiones duplicadas
          const exists = prev.some(c => c.sourceId === parentNode.id && c.targetId === newNode.id);
          if (exists) return prev;
          return [...prev, {
            id: `c-${Date.now()}`,
            sourceId: parentNode.id,
            targetId: newNode.id
          }];
        });
      }

      setSelectedNodeId(newNode.id);

      if (!parentNode) {
        const cx = window.innerWidth / 2;
        const cy = window.innerHeight / 2;
        setViewport({
          x: cx - newNode.x * 1,
          y: cy - newNode.y * 1,
          scale: 1
        });
      }
      wakeSimulation();

    } catch (e: any) {
      console.error("[ProcessInput] Error procesando idea:", e);

      let errorMessage = "Error procesando la idea. ";

      if (e && e.message) {
        // Analizar el tipo de error
        if (e.message.includes('API') || e.message.includes('servidor') || e.message.includes('fetch')) {
          errorMessage += "No se pudo conectar con el servidor de IA. Verifica tu conexión a internet.";
        } else if (e.message.includes('JSON') || e.message.includes('parsear') || e.message.includes('Invalid JSON')) {
          errorMessage += "La respuesta de la IA no es válida. Esto puede deberse a un problema con el modelo de Gemini. Intenta de nuevo.";
        } else if (e.message.includes('API Key') || e.message.includes('401') || e.message.includes('Invalid API Key')) {
          errorMessage += "Error de autenticación. Verifica la configuración de la API Key en Vercel.";
        } else if (e.message.includes('404') || e.message.includes('Model') || e.message.includes('not found')) {
          errorMessage += "El modelo de IA no está disponible. Esto puede deberse a un problema con la versión de Gemini. Intenta de nuevo.";
        } else if (e.message.includes('429') || e.message.includes('Rate limit')) {
          errorMessage += "Límite de solicitudes excedido. Por favor, espera unos momentos e intenta de nuevo.";
        } else if (e.message.includes('Respuesta inválida') || e.message.includes('No text field')) {
          errorMessage += "La respuesta del servidor no tiene el formato esperado. Esto puede indicar un problema con el modelo de Gemini.";
        } else {
          errorMessage += e.message;
        }
      } else {
        errorMessage += "Error desconocido. Intenta de nuevo.";
      }

      console.error("[ProcessInput] Mensaje de error para usuario:", errorMessage);
      alert(errorMessage);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleMicClick = async () => {
    console.log("[Speech] handleMicClick llamado, isRecording:", isRecording);

    if (isProcessing) {
      console.warn("[Speech] Ya se está procesando una idea. Espera antes de volver a grabar.");
      return;
    }

    if (isRecording) {
      let recordingPayload;
      try {
        recordingPayload = await stopRecording();
      } catch (error) {
        console.error("[Speech] Error al detener la grabación:", error);
        alert(mapMicErrorToMessage(error));
        setRecognitionStatus("");
        return;
      }

      try {
        await processInput(recordingPayload);
      } finally {
        setRecognitionStatus("");
      }
      return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      console.error("[Speech] getUserMedia no está disponible en este navegador.");
      alert("Tu navegador no soporta acceso al micrófono. Usa Chrome, Edge o Safari actualizado.");
      promptManualIdea();
      return;
    }

    if (typeof window === 'undefined' || typeof MediaRecorder === 'undefined') {
      alert("Este navegador no soporta grabación de audio. Dicta desde un navegador actualizado o escribe tu idea manualmente.");
      promptManualIdea();
      return;
    }

    if (!isSecureOrigin()) {
      alert("El navegador bloquea el micrófono porque la conexión no es segura (HTTP). Usa https:// (por ejemplo con `npm run dev -- --https`, un túnel como ngrok o despliega en Vercel) o abre la app en localhost.");
      return;
    }

    try {
      await ensureMicPermission();
    } catch (error) {
      alert(mapMicErrorToMessage(error));
      return;
    }

    try {
      setRecognitionStatus("Conectando con el micrófono...");
      await startRecording();
    } catch (error) {
      console.error("[Speech] Error al iniciar la grabación:", error);
      setRecognitionStatus("");
      alert(mapMicErrorToMessage(error));
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = reader.result as string;
        const compressed = await compressImage(base64);
        processInput({ image: compressed, prompt: "Crea una idea basada en esta imagen" }, true);
      };
      reader.readAsDataURL(file);
    }
  };

  // -- GESTURE HELPERS --

  const getPointersDistance = () => {
    const points = Array.from(activePointers.current.values()) as { x: number; y: number }[];
    if (points.length < 2) return 0;
    return Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
  };

  const getPointersCenter = () => {
    const points = Array.from(activePointers.current.values()) as { x: number; y: number }[];
    let x = 0, y = 0;
    points.forEach(p => { x += p.x; y += p.y; });
    return { x: x / points.length, y: y / points.length };
  };

  // -- POINTER EVENTS (CANVAS) --

  const handlePointerDown = (e: React.PointerEvent) => {
    activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    canvasRef.current?.setPointerCapture(e.pointerId);
    if (activePointers.current.size === 2) {
      initialPinchDistance.current = getPointersDistance();
      initialViewportScale.current = viewport.scale;
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!activePointers.current.has(e.pointerId)) return;

    const prevPos = activePointers.current.get(e.pointerId)!;
    activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (draggingNodeId.current) {
      const dx = e.clientX - prevPos.x;
      const dy = e.clientY - prevPos.y;

      if (!isDraggingNodeRef.current && dragStartPos.current) {
        const dist = Math.hypot(e.clientX - dragStartPos.current.x, e.clientY - dragStartPos.current.y);
        if (dist > 5) {
          isDraggingNodeRef.current = true;
          saveSnapshot(); // Save state before dragging actually changes things significantly
        }
      }

      if (isDraggingNodeRef.current) {
        setNodes(prev => prev.map(n => {
          if (n.id === draggingNodeId.current) {
            return { ...n, x: n.x + dx / viewport.scale, y: n.y + dy / viewport.scale };
          }
          return n;
        }));
      }
      return;
    }

    if (tempConnection) {
      const logicalX = (e.clientX - viewport.x) / viewport.scale;
      const logicalY = (e.clientY - viewport.y) / viewport.scale;
      setTempConnection(prev => prev ? { ...prev, endX: logicalX, endY: logicalY } : null);
      return;
    }

    if (activePointers.current.size === 2 && initialPinchDistance.current) {
      const currentDist = getPointersDistance();
      const center = getPointersCenter();
      const scaleFactor = currentDist / initialPinchDistance.current;
      let newScale = initialViewportScale.current * scaleFactor;
      newScale = Math.min(Math.max(0.1, newScale), 5);
      const newX = center.x - (center.x - viewport.x) * (newScale / viewport.scale);
      const newY = center.y - (center.y - viewport.y) * (newScale / viewport.scale);
      setViewport({ x: newX, y: newY, scale: newScale });
      return;
    }

    if (activePointers.current.size === 1) {
      const dx = e.clientX - prevPos.x;
      const dy = e.clientY - prevPos.y;
      setViewport(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (tempConnection) {
      const targetElement = document.elementFromPoint(e.clientX, e.clientY);
      const targetNodeElement = targetElement?.closest('[data-node-id]');

      if (targetNodeElement) {
        const targetId = targetNodeElement.getAttribute('data-node-id');
        if (targetId && targetId !== tempConnection.sourceId) {
          // Prevenir conexiones duplicadas y ciclos
          const existingConnection = connections.find(
            c => c.sourceId === tempConnection.sourceId && c.targetId === targetId
          );
          if (!existingConnection) {
            // Prevenir ciclos: verificar que el target no sea ancestro del source
            const wouldCreateCycle = (sourceId: string, targetId: string): boolean => {
              const visited = new Set<string>();
              const checkCycle = (currentId: string): boolean => {
                if (currentId === sourceId) return true;
                if (visited.has(currentId)) return false;
                visited.add(currentId);
                const children = connections
                  .filter(c => c.sourceId === currentId)
                  .map(c => c.targetId);
                return children.some(childId => checkCycle(childId));
              };
              return checkCycle(targetId);
            };

            if (!wouldCreateCycle(tempConnection.sourceId, targetId)) {
              saveSnapshot();
              setConnections(prev => {
                const newConns = [...prev, {
                  id: `c-${Date.now()}`,
                  sourceId: tempConnection.sourceId,
                  targetId: targetId
                }];
                setTimeout(wakeSimulation, 0);
                return newConns;
              });
            }
          }
        }
      }
      setTempConnection(null);
    }

    if (draggingNodeId.current) {
      if (!isDraggingNodeRef.current) {
        const nodeId = draggingNodeId.current;
        const now = Date.now();
        const lastTap = lastNodeTapTime.current;
        if (lastTap && lastTap.id === nodeId && (now - lastTap.time) < 300) {
          setInspectorNodeId(nodeId);
          lastNodeTapTime.current = null;
        } else {
          setSelectedNodeId(nodeId);
          lastNodeTapTime.current = { id: nodeId, time: now };
        }
      } else {
        wakeSimulation();
      }
      draggingNodeId.current = null;
      isDraggingNodeRef.current = false;
      dragStartPos.current = null;
    } else {
      const target = e.target as HTMLElement;
      if (!target.closest('.node-interactive') && !tempConnection) {
        setInspectorNodeId(null);
      }
    }

    activePointers.current.delete(e.pointerId);
    if (activePointers.current.size < 2) {
      initialPinchDistance.current = null;
    }
    canvasRef.current?.releasePointerCapture(e.pointerId);
  };

  // -- NODE EVENTS --

  const handleNodePointerDown = (e: React.PointerEvent, nodeId: string) => {
    e.preventDefault();
    draggingNodeId.current = nodeId;
    isDraggingNodeRef.current = false;
    dragStartPos.current = { x: e.clientX, y: e.clientY };
  };

  const startConnection = (e: React.PointerEvent, nodeId: string) => {
    e.stopPropagation();
    e.preventDefault();
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;
    setTempConnection({ sourceId: nodeId, endX: node.x, endY: node.y });
  };

  // -- RENDER LOGIC (FILTERING) --



  // -- CHAT HANDLER --

  const handleSendChatMessage = async (userText: string) => {
    setChatMessages(prev => [...prev, { role: 'user', text: userText }]);
    setIsChatLoading(true);

    try {
      // Prepare Context (simplified structure to save tokens)
      const contextData = visibleNodes.map(n => ({
        title: n.title,
        summary: n.summary,
        category: n.category,
        cost: n.cost,
        checklist: n.checklist,
        status: n.status,
        isRoot: !connections.some(c => c.targetId === n.id)
      }));

      const prompt = `
          Eres un asistente experto analizando el siguiente mapa mental (JSON):
          ${JSON.stringify(contextData)}

          Usuario: "${userText}"

          Responde de forma útil, concisa y directa basándote SOLAMENTE en los datos proporcionados.
          `;

      const responseText = await callAI({
        prompt: prompt
      });

      setChatMessages(prev => [...prev, { role: 'model', text: responseText }]);
    } catch (e) {
      setChatMessages(prev => [...prev, { role: 'model', text: 'Lo siento, hubo un error al conectar con la IA.' }]);
    } finally {
      setIsChatLoading(false);
    }
  };

  return (
    <div className="w-full h-screen bg-[#f0f2f5] overflow-hidden flex relative font-sans text-slate-800 select-none touch-none">

      {/* SIDEBAR MENU */}
      <div
        className={`fixed inset-y-0 left-0 w-72 bg-white shadow-2xl transform transition-transform duration-300 z-[100] flex flex-col ${isMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-bold text-lg text-slate-800">Mis Proyectos</h2>
          <button onClick={() => setIsMenuOpen(false)} className="p-2 hover:bg-slate-100 rounded-full">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          <button
            onClick={createManualProject}
            className="w-full p-3 mb-2 rounded-lg border-2 border-dashed border-slate-300 text-slate-500 hover:bg-slate-50 flex items-center justify-center gap-2 font-semibold text-sm transition-colors"
          >
            <Plus className="w-4 h-4" /> Nuevo Proyecto
          </button>
          {rootNodes.length === 0 && <div className="p-4 text-sm text-slate-400 text-center">No hay proyectos raíz.</div>}
          {rootNodes.map(node => (
            <button
              key={node.id}
              onClick={() => { focusOnNode(node.id); setIsMenuOpen(false); }}
              className={`w-full text-left p-3 rounded-lg mb-1 flex items-center gap-3 transition-colors ${getRootAncestor(selectedNodeId || '', connections) === node.id ? 'bg-cyan-50 border border-cyan-200' : 'hover:bg-slate-50 border border-transparent'}`}
            >
              <Disc className={`w-4 h-4 ${getRootAncestor(selectedNodeId || '', connections) === node.id ? 'text-cyan-600' : 'text-slate-400'}`} />
              <div className="flex flex-col overflow-hidden">
                <span className={`font-semibold text-sm truncate ${getRootAncestor(selectedNodeId || '', connections) === node.id ? 'text-cyan-800' : 'text-slate-700'}`}>{node.title}</span>
                <span className="text-[10px] text-slate-400 uppercase truncate">{node.category}</span>
              </div>
            </button>
          ))}
        </div>

        {/* EXPORT SECTION */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 space-y-2">
          <h3 className="text-xs font-bold text-slate-400 uppercase mb-2">Exportar Vista</h3>
          <button onClick={() => { exportAsImage(); setIsMenuOpen(false); }} className="w-full flex items-center gap-3 p-2 hover:bg-white rounded-lg text-slate-600 text-sm transition-colors border border-transparent hover:border-slate-200">
            <Download className="w-4 h-4 text-cyan-600" />
            Imagen (PNG)
          </button>
          <button onClick={() => { exportAsMarkdown(); setIsMenuOpen(false); }} className="w-full flex items-center gap-3 p-2 hover:bg-white rounded-lg text-slate-600 text-sm transition-colors border border-transparent hover:border-slate-200">
            <FileText className="w-4 h-4 text-violet-500" />
            Markdown (Texto)
          </button>
        </div>
      </div>

      {/* HEADER UI */}
      <div
        className="absolute top-4 z-50 pointer-events-none flex items-start justify-between gap-2 sm:gap-4"
        style={{
          left: 'max(1rem, env(safe-area-inset-left, 1rem))',
          right: 'max(1rem, env(safe-area-inset-right, 1rem))'
        }}
      >
        <div className="flex gap-2 pointer-events-auto flex-shrink-0">
          <button onClick={() => setIsMenuOpen(true)} className="p-3 bg-white rounded-full shadow-md border border-slate-200 hover:bg-slate-50">
            <Menu className="w-5 h-5 text-slate-700" />
          </button>
          {selectedNodeId && (
            <button onClick={() => setSelectedNodeId(null)} className="p-3 bg-white rounded-full shadow-md border border-slate-200 hover:bg-slate-50 flex items-center gap-2 px-4">
              <ArrowLeft className="w-5 h-5 text-slate-700" />
              <span className="text-xs font-bold text-slate-600 hidden sm:inline">Todos</span>
            </button>
          )}
          <div className="flex bg-white rounded-full shadow-md border border-slate-200 ml-2">
            <button onClick={undo} disabled={pastHistory.current.length === 0} className="p-3 hover:bg-slate-50 rounded-l-full disabled:opacity-30">
              <Undo className="w-5 h-5 text-slate-600" />
            </button>
            <div className="w-px bg-slate-200 my-2"></div>
            <button onClick={redo} disabled={futureHistory.current.length === 0} className="p-3 hover:bg-slate-50 rounded-r-full disabled:opacity-30">
              <Redo className="w-5 h-5 text-slate-600" />
            </button>
          </div>
        </div>

        <div className="pointer-events-auto flex-1 max-w-md hidden sm:block">
          <div className="bg-white/90 backdrop-blur-md border border-slate-200 rounded-full p-3 shadow-lg flex items-center gap-2 w-full">
            <Search className="w-5 h-5 text-slate-400" />
            <input
              className="bg-transparent border-none outline-none text-slate-700 w-full placeholder-slate-400 text-sm"
              placeholder="Buscar..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* CANVAS LAYER */}
      <div
        ref={canvasRef}
        className="absolute inset-0 touch-none bg-slate-50"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(#000 1px, transparent 1px)', backgroundSize: '20px 20px' }} />
        <div style={{ transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`, transformOrigin: '0 0', width: '100%', height: '100%', willChange: 'transform' }} className="relative w-full h-full">

          <svg className="absolute inset-0 w-full h-full overflow-visible pointer-events-none">
            {visibleConnections.map(conn => {
              const source = nodes.find(n => n.id === conn.sourceId);
              const target = nodes.find(n => n.id === conn.targetId);
              if (!source || !target) return null;
              const isRootSource = !connections.some(c => c.targetId === source.id);
              return <path key={conn.id} d={drawCurve(source.x, source.y, target.x, target.y)} stroke={isRootSource ? "#22d3ee" : "#a3e635"} strokeWidth={isRootSource ? "3" : "1.5"} fill="none" strokeLinecap="round" />;
            })}
            {tempConnection && <path d={drawCurve(nodes.find(n => n.id === tempConnection.sourceId)!.x, nodes.find(n => n.id === tempConnection.sourceId)!.y, tempConnection.endX, tempConnection.endY)} stroke="#94a3b8" strokeWidth="2" strokeDasharray="5,5" fill="none" />}
          </svg>

          {visibleNodes.map((node: any) => (
            <div
              key={node.id}
              data-node-id={node.id}
              className={`node-interactive absolute group flex justify-center items-center touch-none ${node.isDimmed ? 'opacity-20 blur-sm grayscale' : 'opacity-100'} ${selectedNodeId === node.id ? 'z-50' : 'z-10'} transition-transform duration-75`}
              style={{ transform: `translate(${node.x}px, ${node.y}px) translate(-50%, -50%)` }}
              onPointerDown={(e) => handleNodePointerDown(e, node.id)}
            >
              <div className={`absolute -right-5 w-8 h-8 bg-blue-500/80 rounded-full flex items-center justify-center shadow-md z-50 touch-none ${selectedNodeId === node.id ? 'opacity-100 scale-100' : 'opacity-0 scale-75 pointer-events-none'} transition-all`} onPointerDown={(e) => startConnection(e, node.id)}>
                <Plus className="w-4 h-4 text-white" />
              </div>
              <div className={`${getNodeStyle(node)} shadow-md flex items-center gap-2 max-w-[180px] sm:max-w-[200px] relative overflow-hidden`}>
                {node.images && node.images.length > 0 && (
                  <img src={node.images[0]} alt="" className="w-8 h-8 rounded-full object-cover border border-white/50" />
                )}
                <div className="flex flex-col">
                  <span className="truncate max-w-[140px] sm:max-w-[180px]">{node.title}</span>
                  {node.checklist && node.checklist.length > 0 && (
                    <div className="flex items-center gap-1 text-[10px] opacity-70">
                      <CheckSquare className="w-3 h-3" />
                      <span>{node.checklist.filter((i: any) => i.done).length}/{node.checklist.length}</span>
                    </div>
                  )}
                </div>
                {node.status === 'scheduled' && <div className="w-2 h-2 rounded-full bg-blue-600" />}
                {selectedNodeId === node.id && <div className="absolute inset-0 -m-1 rounded-full border-2 border-blue-400 animate-pulse pointer-events-none" />}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* INPUT BAR (MIC & CAMERA) */}
      <div
        className={`fixed left-1/2 -translate-x-1/2 pointer-events-none flex items-end gap-4 transition-all duration-300 ${inspectorNodeId ? 'z-[60]' : 'z-[100]'
          }`}
        style={{
          bottom: inspectorNodeId
            ? 'calc(85vh + 1rem)'
            : 'calc(2.5rem + env(safe-area-inset-bottom, 32px))',
          transform: 'translateZ(0)',
        }}
      >

        {/* Camera Button */}
        <div className="pointer-events-auto relative">
          <input type="file" accept="image/*" capture="environment" onChange={handleImageUpload} className="absolute inset-0 opacity-0 z-10 cursor-pointer" />
          <button className="w-12 h-12 bg-white rounded-full shadow-lg border border-slate-200 flex items-center justify-center hover:bg-slate-50 active:scale-95 transition-transform text-slate-600">
            <Camera className="w-6 h-6" />
          </button>
        </div>

        {/* Mic Button */}
        <div className="flex flex-col items-center gap-2">
          <div className="bg-black/50 backdrop-blur-sm text-white text-[10px] px-3 py-1 rounded-full pointer-events-none animate-in fade-in slide-in-from-bottom-2 max-w-[200px] truncate">
            {selectedNodeId
              ? `Añadiendo a: ${nodes.find(n => n.id === selectedNodeId)?.title}`
              : 'Creando Nuevo Proyecto'}
          </div>
          <button
            onClick={handleMicClick}
            disabled={isProcessing}
            className={`
                relative pointer-events-auto flex items-center justify-center w-16 h-16 rounded-full shadow-2xl
                transition-all duration-300 transform hover:scale-105 active:scale-95 overflow-hidden
                ${isRecording ? 'bg-red-500 ring-4 ring-red-200' : 'bg-cyan-600'}
                ${isProcessing ? 'opacity-70' : ''}
                border-2 border-white
            `}
          >
            {isProcessing ? (
              <BrainCircuit className="w-8 h-8 animate-spin text-white" />
            ) : isRecording ? (
              <div className="flex items-center justify-center gap-[2px] h-8">
                {[...Array(5)].map((_, i) => {
                  const val = audioData[i * 4] || 0;
                  const height = Math.max(20, (val / 255) * 100);
                  return <div key={i} className="w-1 bg-white rounded-full transition-all duration-75" style={{ height: `${height}%` }} />
                })}
              </div>
            ) : (
              <Mic className="w-8 h-8 text-white" />
            )}
          </button>
          {/* Recognition Status Indicator */}
          {recognitionStatus && (
            <div className="bg-orange-500/90 backdrop-blur-sm text-white text-[10px] px-3 py-1 rounded-full pointer-events-none animate-in fade-in slide-in-from-bottom-2 max-w-[200px] text-center">
              {recognitionStatus}
            </div>
          )}
        </div>

        {/* Text Input Field for Manual Entry / Keyboard Dictation */}
        <div className="pointer-events-auto flex gap-2 items-center px-4 max-w-md w-full">
          <input
            type="text"
            placeholder="Escribe tu idea o usa el micrófono del teclado 🎤"
            className="flex-1 px-4 py-3 rounded-full bg-white border-2 border-slate-200 focus:border-cyan-500 outline-none shadow-lg text-sm"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                const text = e.currentTarget.value.trim();
                e.currentTarget.value = '';
                processInput(text);
              }
            }}
            disabled={isProcessing}
          />
          <button
            onClick={(e) => {
              const input = (e.currentTarget.previousElementSibling as HTMLInputElement);
              if (input?.value.trim()) {
                const text = input.value.trim();
                input.value = '';
                processInput(text);
              }
            }}
            disabled={isProcessing}
            className="w-12 h-12 bg-cyan-600 rounded-full shadow-lg flex items-center justify-center hover:bg-cyan-700 active:scale-95 transition-all disabled:opacity-50"
          >
            <Send className="w-5 h-5 text-white" />
          </button>
        </div>


        {/* Chat Button Placeholder to balance layout */}
        <div className="w-12 h-12 pointer-events-none opacity-0" />
      </div>

      {/* FLOATING CHAT BUTTON */}
      <button
        onClick={() => setIsChatOpen(true)}
        className={`fixed right-4 sm:right-6 pointer-events-auto w-14 h-14 bg-white text-cyan-600 rounded-full shadow-xl border border-cyan-100 flex items-center justify-center hover:scale-105 active:scale-95 transition-all ${inspectorNodeId ? 'z-[60]' : 'z-[100]'
          }`}
        style={{
          bottom: inspectorNodeId
            ? 'calc(85vh + 1rem)'
            : 'calc(2.5rem + env(safe-area-inset-bottom, 32px))',
          transform: 'translateZ(0)',
        }}
      >
        <MessageCircle className="w-7 h-7" />
      </button>

      {/* CHAT OVERLAY */}
      {isChatOpen && (
        <div className="fixed inset-0 z-[60] bg-black/20 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4">
          <div className="bg-white w-full sm:max-w-md h-[80vh] sm:h-[600px] rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-300">
            {/* Header */}
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-cyan-100 rounded-full flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-cyan-600" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800">Asistente IA</h3>
                  <p className="text-[10px] text-slate-500">Pregunta sobre tu proyecto actual</p>
                </div>
              </div>
              <button onClick={() => setIsChatOpen(false)} className="p-2 hover:bg-slate-200 rounded-full">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50">
              {chatMessages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] p-3 rounded-2xl text-sm ${msg.role === 'user' ? 'bg-cyan-600 text-white rounded-tr-sm' : 'bg-white border border-slate-100 shadow-sm text-slate-700 rounded-tl-sm'}`}>
                    {msg.text}
                  </div>
                </div>
              ))}
              {isChatLoading && (
                <div className="flex justify-start">
                  <div className="bg-white border border-slate-100 p-3 rounded-2xl rounded-tl-sm shadow-sm flex gap-1">
                    <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" />
                    <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce delay-100" />
                    <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce delay-200" />
                  </div>
                </div>
              )}
            </div>

            {/* Input */}
            <div className="p-4 bg-white border-t border-slate-100">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const input = (e.target as HTMLFormElement).elements.namedItem('msg') as HTMLInputElement;
                  if (input.value.trim()) {
                    handleSendChatMessage(input.value);
                    input.value = '';
                  }
                }}
                className="flex gap-2"
              >
                <input
                  name="msg"
                  className="flex-1 bg-slate-100 rounded-full px-4 text-sm outline-none focus:ring-2 ring-cyan-200"
                  placeholder="Escribe tu pregunta..."
                  autoComplete="off"
                />
                <button type="submit" disabled={isChatLoading} className="p-2 bg-cyan-600 text-white rounded-full disabled:opacity-50">
                  <Send className="w-5 h-5" />
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* UI: INSPECTOR */}
      {inspectorNodeId && (
        <Inspector
          node={nodes.find(n => n.id === inspectorNodeId)!}
          onClose={() => setInspectorNodeId(null)}
          onUpdate={(updatedNode) => {
            saveSnapshot();
            setNodes(prev => prev.map(n => n.id === updatedNode.id ? updatedNode : n));
          }}
          onDelete={() => {
            saveSnapshot();
            setNodes(prev => prev.filter(n => n.id !== inspectorNodeId));
            setConnections(prev => prev.filter(c => c.sourceId !== inspectorNodeId && c.targetId !== inspectorNodeId));
            setInspectorNodeId(null);
            setSelectedNodeId(null);
          }}
          onGenerateBrainstorm={async (node) => {
            setIsProcessing(true);
            try {
              const prompt = `Genera 3 ideas breves y creativas relacionadas con: "${node.title}".`;

              const systemInstruction = `Eres un generador de ideas creativas.
Debes devolver EXACTAMENTE un array JSON de 3 strings.
Cada string debe ser una idea breve (máximo 5 palabras).

Formato REQUERIDO (sin texto adicional):
["idea 1", "idea 2", "idea 3"]

Ejemplo correcto:
["Automatizar con scripts", "Integrar con Zapier", "Crear dashboard visual"]

NO devuelvas objetos, solo strings.
NO añadas texto explicativo antes o después del JSON.`;

              const responseText = await callAI({
                prompt: prompt,
                systemInstruction: systemInstruction,
                isJson: true
              });

              let ideas;
              try {
                let parsed = JSON.parse(responseText);

                // Debug logging
                console.log("[Brainstorm] Respuesta parseada:", parsed);
                console.log("[Brainstorm] Tipo:", typeof parsed);
                console.log("[Brainstorm] Es array:", Array.isArray(parsed));

                // Validar estructura
                // Caso 1: Si es un objeto con propiedad 'ideas' o similar
                if (typeof parsed === 'object' && !Array.isArray(parsed)) {
                  const possibleArrays = ['ideas', 'items', 'suggestions', 'list', 'data'];
                  let found = false;

                  for (const key of possibleArrays) {
                    if (Array.isArray(parsed[key])) {
                      console.warn(`[Brainstorm] Extrayendo array de propiedad '${key}'`);
                      parsed = parsed[key];
                      found = true;
                      break;
                    }
                  }

                  if (!found) {
                    throw new Error(`Respuesta es un objeto, no un array. Keys: ${Object.keys(parsed).join(', ')}`);
                  }
                }

                // Caso 2: Si no es array, error
                if (!Array.isArray(parsed)) {
                  throw new Error(`Respuesta no es un array. Tipo: ${typeof parsed}`);
                }

                // Caso 3: Si está vacío
                if (parsed.length === 0) {
                  throw new Error("El array de ideas está vacío");
                }

                // Normalizar: Convertir todo a strings
                ideas = parsed.map((item, i) => {
                  // Si es string, OK
                  if (typeof item === 'string') {
                    return item.trim();
                  }

                  // Si es objeto, intentar extraer texto
                  if (typeof item === 'object' && item !== null) {
                    const text = item.title || item.idea || item.text || item.name || item.description;
                    if (text && typeof text === 'string') {
                      console.warn(`[Brainstorm] Item ${i} es objeto, extrayendo texto de propiedad`);
                      return text.trim();
                    }

                    console.warn(`[Brainstorm] Item ${i} es objeto sin propiedad de texto, usando JSON.stringify`);
                    return JSON.stringify(item);
                  }

                  // Convertir cualquier otra cosa a string
                  return String(item);
                }).filter(text => text.length > 0);

                // Validar que tengamos al menos 1 idea
                if (ideas.length === 0) {
                  throw new Error("No se pudieron extraer ideas válidas del array");
                }

                console.log(`[Brainstorm] ${ideas.length} ideas válidas extraídas:`, ideas);

              } catch (parseError: any) {
                console.error("[Brainstorm] Error completo:", parseError);
                console.error("[Brainstorm] Respuesta recibida:", responseText);

                // Intentar extraer JSON de markdown
                const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/);
                if (jsonMatch) {
                  console.warn("[Brainstorm] Detectado JSON en markdown, reintentando...");
                  try {
                    const extracted = JSON.parse(jsonMatch[1]);
                    if (Array.isArray(extracted)) {
                      ideas = extracted.map(String);
                      console.log("[Brainstorm] ✅ Extraído de markdown exitosamente");
                    }
                  } catch {
                    throw new Error(`Error parseando JSON dentro de markdown: ${parseError.message}`);
                  }
                } else {
                  throw new Error(`Error parseando respuesta como JSON: ${parseError.message}. Respuesta: ${responseText.substring(0, 100)}...`);
                }
              }

              saveSnapshot();
              const newNodes: IdeaNode[] = [];
              const newConns: Connection[] = [];

              ideas.forEach((ideaText: string, i: number) => {
                const angle = (Math.PI * 2 / 3) * i;
                const dist = 180;
                const newNode: IdeaNode = {
                  id: Date.now() + i + '',
                  x: node.x + Math.cos(angle) * dist,
                  y: node.y + Math.sin(angle) * dist,
                  title: ideaText,
                  summary: "Generado por IA",
                  originalContext: "",
                  category: node.category,
                  cost: 0,
                  links: [],
                  checklist: [],
                  images: [],
                  attachments: [],
                  type: 'text',
                  status: 'draft',
                  createdAt: Date.now()
                };
                newNodes.push(newNode);
                newConns.push({ id: `c-${Date.now()}-${i}`, sourceId: node.id, targetId: newNode.id });
              });

              setNodes(prev => [...prev, ...newNodes]);
              setConnections(prev => {
                // Filtrar conexiones duplicadas
                const existingIds = new Set(prev.map(c => `${c.sourceId}-${c.targetId}`));
                const uniqueConns = newConns.filter(c => !existingIds.has(`${c.sourceId}-${c.targetId}`));
                return [...prev, ...uniqueConns];
              });
              wakeSimulation();
            } catch (e: any) {
              console.error("[Brainstorm] Error completo:", e);

              // Construir mensaje de error útil
              let errorMessage = "Error generando ideas";

              if (e.message) {
                if (e.message.includes('parsear') || e.message.includes('JSON')) {
                  errorMessage = "La IA devolvió un formato inválido. Intenta de nuevo.";
                } else if (e.message.includes('array')) {
                  errorMessage = "La IA no devolvió una lista de ideas. Intenta de nuevo.";
                } else if (e.message.includes('API') || e.message.includes('fetch')) {
                  errorMessage = "Error de conexión con el servidor. Verifica tu internet.";
                } else {
                  errorMessage = `Error: ${e.message}`;
                }
              }

              console.error("[Brainstorm] Mensaje para usuario:", errorMessage);
              alert(errorMessage);
            } finally {
              setIsProcessing(false);
            }
          }}
        />
      )}

      {/* MINIMAP - Hidden on mobile by default, visible on larger screens */}
      <div className="absolute bottom-8 left-8 z-40 bg-white/90 backdrop-blur border border-slate-200 rounded-xl shadow-lg p-2 w-48 h-32 overflow-hidden pointer-events-none hidden md:block opacity-80 hover:opacity-100 transition-opacity">
        <div className="relative w-full h-full bg-slate-50/50 rounded-lg">
          {nodes.map(n => {
            // Simple projection: Map -2500..2500 to 0..100%
            const x = Math.max(0, Math.min(100, ((n.x + 2500) / 5000) * 100));
            const y = Math.max(0, Math.min(100, ((n.y + 2500) / 5000) * 100));
            return (
              <div key={n.id}
                className={`absolute rounded-full ${selectedNodeId === n.id ? 'bg-cyan-500 w-1.5 h-1.5 z-10' : 'bg-slate-300 w-1 h-1'}`}
                style={{ left: `${x}%`, top: `${y}%` }}
              />
            );
          })}
          {/* Viewport Indicator */}
          <div className="absolute border-2 border-cyan-500/30 bg-cyan-500/5 rounded-sm transition-all duration-75"
            style={{
              left: `${Math.max(0, Math.min(100, ((-viewport.x / viewport.scale + 2500) / 5000) * 100))}%`,
              top: `${Math.max(0, Math.min(100, ((-viewport.y / viewport.scale + 2500) / 5000) * 100))}%`,
              width: `${Math.min(100, ((window.innerWidth / viewport.scale) / 5000) * 100)}%`,
              height: `${Math.min(100, ((window.innerHeight / viewport.scale) / 5000) * 100)}%`
            }}
          />
        </div>
      </div>

    </div>
  );
};
const container = document.getElementById('root');
if (!container) throw new Error("Failed to find the root element");
const root = createRoot(container);
root.render(<App />);