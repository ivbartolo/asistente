import { GoogleGenAI, Type, Modality, FunctionDeclaration, GenerateContentResponse } from "@google/genai";
import { Task, Category, Priority, GroundedAnswer, ShoppingItem, ProactiveSuggestion } from '../types';

const STORAGE_KEY = 'vitalCommandCenter_geminiApiKey';

let currentApiKey: string | null = null;
let client: GoogleGenAI | null = null;

const createClient = (apiKey: string) => new GoogleGenAI({ apiKey });

const persistApiKey = (apiKey: string | null) => {
    if (typeof window === 'undefined') return;
    try {
        if (apiKey) {
            window.localStorage.setItem(STORAGE_KEY, apiKey);
        } else {
            window.localStorage.removeItem(STORAGE_KEY);
        }
    } catch (error) {
        console.error("No se pudo actualizar la clave de la API en localStorage", error);
    }
};

const assertClient = (): GoogleGenAI => {
    if (!client) {
        throw new Error("GEMINI_CLIENT_UNINITIALIZED");
    }
    return client;
};

export const initializeClient = (apiKey: string) => {
    const normalizedKey = apiKey.trim();
    if (!normalizedKey) {
        throw new Error("La clave de la API no puede estar vacía.");
    }
    currentApiKey = normalizedKey;
    client = createClient(normalizedKey);
    persistApiKey(normalizedKey);
};

export const clearClient = () => {
    currentApiKey = null;
    client = null;
    persistApiKey(null);
};

export const getStoredApiKey = (): string | null => {
    if (typeof window === 'undefined') return null;
    try {
        return window.localStorage.getItem(STORAGE_KEY);
    } catch (error) {
        console.error("No se pudo leer la clave de la API almacenada", error);
        return null;
    }
};

export const getCurrentApiKey = () => currentApiKey;

export const isClientReady = () => client !== null;

export const getClient = (): GoogleGenAI => assertClient();

const openGoogleMapsNavigation: FunctionDeclaration = {
  name: 'openGoogleMapsNavigation',
  description: 'Abre Google Maps en una nueva pestaña del navegador para calcular y mostrar una ruta a una dirección específica. Utilízalo cuando el usuario exprese la intención de ir, viajar o navegar a un lugar.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      address: {
        type: Type.STRING,
        description: 'La dirección completa de destino. Debe incluir la calle, el número, la ciudad y, si es posible, el país. Por ejemplo: "Calle Federico Mayo 15, Madrid, España".',
      },
    },
    required: ['address'],
  },
};

export const findFunctionCall = async (prompt: string): Promise<GenerateContentResponse['functionCalls'] | null> => {
    try {
        const gemini = assertClient();
        const response = await gemini.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
                tools: [{ functionDeclarations: [openGoogleMapsNavigation] }],
            },
        });

        if (response.functionCalls && response.functionCalls.length > 0) {
            return response.functionCalls;
        }
        return null;

    } catch (error) {
        console.error("Error finding function call:", error);
        return null;
    }
};

const taskSchema = {
    type: Type.OBJECT,
    properties: {
        description: {
            type: Type.STRING,
            description: "La tarea principal, reescrita para ser clara y accionable."
        },
        category: {
            type: Type.STRING,
            enum: Object.values(Category),
            description: "La categoría más relevante para la tarea."
        },
        priority: {
            type: Type.STRING,
            enum: Object.values(Priority),
            description: "El nivel de prioridad de la tarea."
        },
        dueDate: {
            type: Type.STRING,
            description: "Si se menciona una fecha específica en la tarea (ej. 'mañana', 'próximo martes', '12 de noviembre'), extráela y formatéala como YYYY-MM-DD. Usa el año actual si no se especifica uno. Si no hay fecha, omite este campo."
        }
    },
    required: ['description', 'category', 'priority']
};


const taskClassificationSchema = {
    type: Type.OBJECT,
    properties: {
        queryType: {
            type: Type.STRING,
            enum: ['task', 'shopping', 'question'],
            description: "Clasifica la solicitud del usuario como una tarea directa, una solicitud de compra o una pregunta general."
        },
        isVague: {
            type: Type.BOOLEAN,
            description: "Establecer en true si la solicitud de tarea es demasiado general y necesita más detalles (ej. 'comprar un regalo', 'planificar vacaciones')."
        },
        clarificationQuestion: {
            type: Type.STRING,
            description: "Si isVague es true, formula una pregunta amigable y específica para obtener los detalles necesarios del usuario."
        },
        ...taskSchema.properties,
    },
    required: ['queryType', 'isVague']
};

export type ClassifiedQuery = 
    | { queryType: 'task'; task: Omit<Task, 'id' | 'isDone'>; isVague: false; }
    | { queryType: 'task'; isVague: true; clarificationQuestion: string; }
    | { queryType: 'shopping' }
    | { queryType: 'question' };

// Helper function to get local date in YYYY-MM-DD format, preventing timezone bugs.
const getLocalDateString = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

export const classifyQuery = async (prompt: string): Promise<ClassifiedQuery | null> => {
    try {
        const today = getLocalDateString(new Date());
        const gemini = assertClient();
        const response = await gemini.models.generateContent({
            model: "gemini-2.5-flash",
            contents: `Analiza y clasifica la siguiente solicitud del usuario. La fecha de hoy es ${today}.
1.  Identifica si es una 'task', 'shopping', o 'question'.
2.  Si es una 'task', determina si es lo suficientemente específica. Si es vaga (ej. "organizar garaje", "comprar un mueble"), establece isVague en true y formula una 'clarificationQuestion' para obtener más detalles.
3.  Si la tarea es específica, extrae su 'description', 'category', 'priority' y, si se menciona una fecha (ej. 'mañana', 'próximo martes', '12 de noviembre'), su 'dueDate' (formateada como YYYY-MM-DD).

Solicitud: "${prompt}"`,
            config: {
                responseMimeType: "application/json",
                responseSchema: taskClassificationSchema,
            },
        });

        const jsonString = response.text.trim();
        const parsed = JSON.parse(jsonString);

        if (parsed.queryType === 'task') {
            if (parsed.isVague) {
                return {
                    queryType: 'task',
                    isVague: true,
                    clarificationQuestion: parsed.clarificationQuestion
                };
            }
            return {
                queryType: 'task',
                isVague: false,
                task: {
                    description: parsed.description,
                    category: parsed.category as Category,
                    priority: parsed.priority as Priority,
                    dueDate: parsed.dueDate,
                }
            };
        }
        return { queryType: parsed.queryType };
    } catch (error) {
        console.error("Error classifying query:", error);
        return null;
    }
};

export const refineTask = async (originalPrompt: string, userClarification: string): Promise<Omit<Task, 'id' | 'isDone'> | null> => {
    try {
        const today = getLocalDateString(new Date());
         const gemini = assertClient();
         const response = await gemini.models.generateContent({
            model: "gemini-2.5-flash",
            contents: `La solicitud original del usuario era vaga: "${originalPrompt}".
El usuario ha proporcionado esta aclaración: "${userClarification}".
La fecha de hoy es ${today}.

Basado en esta nueva información, crea una descripción de tarea clara y concisa, asigna la categoría y prioridad correctas, y extrae una 'dueDate' (formato YYYY-MM-DD) si se menciona una fecha.`,
            config: {
                responseMimeType: "application/json",
                responseSchema: taskSchema,
            },
        });
        const jsonString = response.text.trim();
        return JSON.parse(jsonString) as Omit<Task, 'id' | 'isDone'>;
    } catch (error) {
        console.error("Error refining task:", error);
        return null;
    }
};

export const generateSubtasks = async (taskDescription: string): Promise<string[]> => {
    try {
        const gemini = assertClient();
        const response = await gemini.models.generateContent({
            model: "gemini-2.5-flash",
            contents: `Para la siguiente tarea, genera una lista de 2 a 4 subtareas accionables que ayuden a completarla. Devuelve solo un array de strings en formato JSON.

Tarea: "${taskDescription}"`,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING }
                },
            },
        });
        const jsonString = response.text.trim();
        return JSON.parse(jsonString);
    } catch (error) {
        console.error("Error generating subtasks:", error);
        return [];
    }
};


export const getShoppingSuggestions = async (prompt: string): Promise<ShoppingItem[]> => {
    try {
        const gemini = assertClient();
        const response = await gemini.models.generateContent({
            model: "gemini-2.5-flash",
            // FIX: Updated prompt to be more explicit about JSON output format, as responseSchema is not allowed with the googleSearch tool.
            contents: `Eres un asistente de compras. Encuentra y compara 3-4 opciones relevantes para la solicitud del usuario. Proporciona un resumen para cada una, un precio estimado y un enlace para comprarlo. Formatea tu respuesta como un array JSON de objetos con las claves "name", "summary", "price", y "link". No incluyas nada más en tu respuesta, solo el array JSON.\n\nSolicitud: "${prompt}"`,
            config: {
                // FIX: Per Gemini API guidelines, responseMimeType and responseSchema cannot be used with the googleSearch tool.
                tools: [{googleSearch: {}}],
            },
        });
        const jsonString = response.text.trim();
        // The model can sometimes wrap the JSON in markdown backticks.
        const cleanedJsonString = jsonString.replace(/^```json\n?/, '').replace(/```$/, '');
        return JSON.parse(cleanedJsonString);
    } catch (error) {
        console.error("Error getting shopping suggestions:", error);
        return [];
    }
};

const proactiveSuggestionsSchema = {
    type: Type.ARRAY,
    items: {
        type: Type.OBJECT,
        properties: {
            title: { type: Type.STRING, description: "Un título corto y atractivo para la tarea sugerida (ej. 'Planificar compras semanales')." },
            description: { type: Type.STRING, description: "La descripción completa de la tarea sugerida." }
        },
        required: ['title', 'description']
    }
};

export const getProactiveSuggestions = async (tasks: Task[]): Promise<ProactiveSuggestion[]> => {
    if (tasks.length < 3) return []; // Don't run for very few tasks
    if (!isClientReady()) return [];
    try {
        const taskHistory = tasks.map(t => `- ${t.description} (Categoría: ${t.category}, Prioridad: ${t.priority}, Hecho: ${t.isDone})`).join('\n');
        
        const gemini = assertClient();
        const response = await gemini.models.generateContent({
            model: "gemini-2.5-pro",
            contents: `Basado en la siguiente lista de tareas recientes de un usuario, identifica patrones y sugiere proactivamente 2 nuevas tareas relevantes que podría necesitar hacer a continuación. Por ejemplo, si planifica eventos, sugiere enviar seguimientos. Si hace compras de supermercado, sugiere planificar comidas.\n\nHistorial de Tareas:\n${taskHistory}`,
            config: {
                responseMimeType: "application/json",
                responseSchema: proactiveSuggestionsSchema
            }
        });

        const jsonString = response.text.trim();
        return JSON.parse(jsonString);
    } catch (error) {
        console.error("Error getting proactive suggestions:", error);
        return [];
    }
}


export const getGroundedAnswerStream = (prompt: string, location?: {latitude: number, longitude: number}) => {
    if (!isClientReady()) {
        throw new Error("GEMINI_CLIENT_UNINITIALIZED");
    }
    const gemini = assertClient();
    const tools: ({ googleSearch: {} } | { googleMaps: {} })[] = [{googleSearch: {}}];
    const toolConfig: any = {};
    if(location) {
        tools.push({googleMaps: {}});
        toolConfig.retrievalConfig = {
            latLng: {
                latitude: location.latitude,
                longitude: location.longitude
            }
        }
    }

    return gemini.models.generateContentStream({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
            tools,
        },
        toolConfig
    });
};

export const getDeepPlanStream = (prompt: string) => {
    if (!isClientReady()) {
        throw new Error("GEMINI_CLIENT_UNINITIALIZED");
    }
    const gemini = assertClient();
    return gemini.models.generateContentStream({
        model: "gemini-2.5-pro",
        contents: `Crea un plan detallado, paso a paso, para la siguiente tarea compleja. Desglósala en fases y subtareas accionables. Proporciona sugerencias y consideraciones. Formatea la salida como markdown.\n\nTarea: "${prompt}"`,
        config: {
            thinkingConfig: { thinkingBudget: 32768 }
        }
    });
};

export const getDailyFocusSuggestion = async (tasksForToday: Task[], upcomingTasks: Task[]): Promise<string> => {
    if (tasksForToday.length === 0 && upcomingTasks.length === 0) {
        return "Parece que tienes todo bajo control. ¡Excelente trabajo! Quizás sea un buen día para pensar en nuevas ideas.";
    }
    if (!isClientReady()) {
        return "Configura tu clave de Gemini para recibir sugerencias personalizadas.";
    }

    const todayList = tasksForToday.map(t => `- ${t.description}`).join('\n');
    const upcomingList = upcomingTasks.map(t => `- ${t.description} (vence ${t.dueDate})`).join('\n');

    const prompt = `
        Analiza las tareas de hoy y las próximas de un usuario y ofrécele una única sugerencia motivadora y accionable. Sé conciso y amigable. No uses markdown.

        Tareas de Hoy:
        ${todayList.length > 0 ? todayList : "Ninguna"}

        Tareas Próximas:
        ${upcomingList.length > 0 ? upcomingList : "Ninguna"}

        Ejemplo de sugerencia: "Veo que hoy tienes 'Terminar reporte'. ¡Concéntrate en eso! Podrías empezar por la sección de datos para coger impulso."
    `;

    try {
        const gemini = assertClient();
        const response = await gemini.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
        });
        return response.text.trim();
    } catch (error) {
        console.error("Error getting daily suggestion:", error);
        return "No pude generar una sugerencia en este momento, ¡pero sé que lo harás genial!";
    }
};

export const generateSpeech = async (text: string): Promise<string | null> => {
    try {
        const gemini = assertClient();
        const response = await gemini.models.generateContent({
            model: "gemini-2.5-flash-preview-tts",
            contents: [{ parts: [{ text }] }],
            config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: { voiceName: 'Kore' }, // A standard, clear voice
                    },
                },
            },
        });
        const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (base64Audio) {
            return base64Audio;
        }
        return null;
    } catch (error) {
        console.error("Error generating speech:", error);
        return null;
    }
};

export const planWeek = async (tasks: Task[]): Promise<{ taskId: string; newDueDate: string; }[]> => {
    // Helper to get local date string
    const getLocalDateString = (date: Date): string => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };
    const today = getLocalDateString(new Date());

    const pendingTasksPayload = tasks
        .filter(t => !t.isDone)
        .map(t => ({
            id: t.id,
            description: t.description,
            priority: t.priority,
            hasDueDate: !!t.dueDate
        }));

    if (pendingTasksPayload.filter(t => !t.hasDueDate).length === 0) {
        return []; // Nothing to plan
    }
    if (!isClientReady()) return [];

    const weeklyPlanSchema = {
        type: Type.ARRAY,
        items: {
            type: Type.OBJECT,
            properties: {
                taskId: { type: Type.STRING, description: "El ID de la tarea a programar." },
                newDueDate: { type: Type.STRING, description: "La nueva fecha de vencimiento asignada en formato YYYY-MM-DD." }
            },
            required: ['taskId', 'newDueDate']
        }
    };

    try {
        const gemini = assertClient();
        const response = await gemini.models.generateContent({
            model: "gemini-2.5-pro",
            contents: `Eres un asistente de productividad. La fecha de hoy es ${today}. Te proporcionaré una lista de tareas pendientes. Tu objetivo es crear un plan equilibrado para los próximos 7 días asignando una fecha de vencimiento ('newDueDate') a las tareas que no tienen una ('hasDueDate: false').

- Prioriza las tareas 'programable' sobre las 'idea'.
- No reprogrames tareas que ya tienen una fecha ('hasDueDate: true').
- Distribuye las tareas de manera uniforme para no sobrecargar ningún día.
- Devuelve un array JSON con los objetos {taskId, newDueDate} SOLO para las tareas a las que les asignaste una nueva fecha.

Lista de Tareas:
${JSON.stringify(pendingTasksPayload, null, 2)}`,
            config: {
                responseMimeType: "application/json",
                responseSchema: weeklyPlanSchema,
                temperature: 0.2,
            },
        });

        const jsonString = response.text.trim();
        return JSON.parse(jsonString);
    } catch (error) {
        console.error("Error planning week with Gemini:", error);
        return [];
    }
};

export const generateDraft = async (taskDescription: string): Promise<string> => {
    try {
        const gemini = assertClient();
        const response = await gemini.models.generateContent({
            model: "gemini-2.5-flash",
            contents: `Eres un asistente profesional. Basado en la siguiente tarea, redacta un borrador conciso y apropiado. Si la tarea es enviar un correo, escribe el cuerpo del correo. Si es un mensaje, escribe el mensaje. Sé directo y profesional.

Tarea: "${taskDescription}"`,
            config: {
                temperature: 0.5,
            },
        });
        return response.text.trim();
    } catch (error) {
        console.error("Error generating draft:", error);
        return "No se pudo generar el borrador en este momento.";
    }
};

export const generateSummary = async (textToSummarize: string): Promise<string> => {
    if (!textToSummarize.trim()) return "Por favor, proporciona un texto para resumir.";
    try {
        const gemini = assertClient();
        const response = await gemini.models.generateContent({
            model: "gemini-2.5-flash",
            contents: `Resume el siguiente texto en una lista de puntos clave (bullet points). Sé conciso y extrae solo la información más importante.

Texto a resumir:
"""
${textToSummarize}
"""`,
        });
        return response.text.trim();
    } catch (error) {
        console.error("Error generating summary:", error);
        return "No se pudo generar el resumen en este momento.";
    }
};

export const generateNotesForTask = async (taskDescription: string, currentNotes: string): Promise<string> => {
    try {
        const prompt = currentNotes
            ? `Basado en la tarea "${taskDescription}", expande o mejora las siguientes notas. Mantén el tono conciso y enfocado en la acción. Notas actuales:\n\n${currentNotes}`
            : `Basado en la tarea "${taskDescription}", genera unas notas iniciales o puntos clave a tener en cuenta.`;

        const gemini = assertClient();
        const response = await gemini.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
                temperature: 0.7,
            },
        });
        const newContent = response.text.trim();
        // If there were previous notes, append. Otherwise, replace.
        return currentNotes ? `${currentNotes}\n\n${newContent}` : newContent;
    } catch (error) {
        console.error("Error generating notes:", error);
        return "No se pudieron generar las notas en este momento.";
    }
};