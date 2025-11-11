import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Task, Category, Priority, ChatHistoryItem, ProactiveSuggestion, GroundedAnswer, Subtask, Attachment } from './types';
import { PRIORITY_ORDER } from './constants';
import * as geminiService from './services/geminiService';
import { taskRepository } from './services/taskRepository';

import TaskCard from './components/TaskCard';
import CalendarView from './components/CalendarView';
import ChatResponseCard from './components/ChatResponseCard';
import ShoppingResultCard from './components/ShoppingResultCard';
import SuggestionCard from './components/SuggestionCard';
import SubtaskSuggestionCard from './components/SubtaskSuggestionCard';
import Modal from './components/Modal';
import EditTaskForm from './components/EditTaskForm';
import SetDateModal from './components/SetDateModal';
import LoadingSpinner from './components/LoadingSpinner';
import Dashboard from './components/Dashboard';
import TaskFilters from './components/TaskFilters';
import NotificationBell from './components/NotificationBell';
import SmartActionModal from './components/SmartActionModal';
import ApiKeyForm from './components/ApiKeyForm';
import { SendIcon, BrainIcon, XIcon, GridViewIcon, CalendarViewIcon, MicrophoneIcon, FilterIcon, VoiceWaveIcon, WandIcon } from './components/Icons';

// FIX: Define the SpeechRecognition interface to provide types for the Web Speech API, which are not standard in TypeScript.
interface SpeechRecognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: (event: any) => void;
  onstart: () => void;
  onend: () => void;
  onerror: (event: any) => void;
  start: () => void;
  stop: () => void;
}

// Extend the Window interface to include webkitSpeechRecognition
declare global {
  interface Window {
    // FIX: Correctly type SpeechRecognition and webkitSpeechRecognition as constructors that return a SpeechRecognition instance.
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
    // FIX: Add `webkitAudioContext` to the global `Window` interface to support older Safari browsers and resolve the TypeScript error on line 562.
    webkitAudioContext: typeof AudioContext;
  }
}

// Helper functions for audio decoding (as per Gemini documentation)
function decode(base64: string) {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
}

async function decodeAudioData(
    data: Uint8Array,
    ctx: AudioContext,
    sampleRate: number,
    numChannels: number,
): Promise<AudioBuffer> {
    const dataInt16 = new Int16Array(data.buffer);
    const frameCount = dataInt16.length / numChannels;
    const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

    for (let channel = 0; channel < numChannels; channel++) {
        const channelData = buffer.getChannelData(channel);
        for (let i = 0; i < frameCount; i++) {
            channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
        }
    }
    return buffer;
}


// Helper function to get local date in YYYY-MM-DD format, preventing timezone bugs.
const getLocalDateString = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

// Helper to get user location
const getUserLocation = (): Promise<{ latitude: number; longitude: number }> => {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("La geolocalización no es soportada por tu navegador."));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      },
      (error) => {
        switch (error.code) {
          case error.PERMISSION_DENIED:
            reject(new Error("Has denegado el permiso de geolocalización."));
            break;
          case error.POSITION_UNAVAILABLE:
            reject(new Error("La información de ubicación no está disponible."));
            break;
          case error.TIMEOUT:
            reject(new Error("La solicitud para obtener la ubicación del usuario ha caducado."));
            break;
          default:
            reject(new Error("Ha ocurrido un error desconocido al obtener la ubicación."));
            break;
        }
      }
    );
  });
};


// Initial mock data
const initialTasks: Task[] = [
  { id: '1', description: 'Terminar el reporte de ventas trimestral', category: Category.Work, priority: Priority.Urgent, isDone: false, subtasks: [{id: 'sub1', description: 'Recolectar datos de Q3', isDone: true, subtasks: [{id: 'sub1.1', description: 'Contactar a finanzas', isDone: true}]}, {id: 'sub2', description: 'Crear borradores de gráficos', isDone: false}], dueDate: getLocalDateString(new Date()) },
  { id: '2', description: 'Comprar boletos de avión para las vacaciones', category: Category.Personal, priority: Priority.Schedulable, isDone: false, dueDate: getLocalDateString(new Date(Date.now() + 5 * 24 * 60 * 60 * 1000)) },
  { id: '3', description: 'Hacer la compra de la semana', category: Category.Home, priority: Priority.Reminder, isDone: true },
];

type ViewMode = 'grid' | 'calendar';
type FilterStatus = 'all' | 'pending' | 'completed';

const App: React.FC = () => {
  const hasEnvApiKey = geminiService.hasEnvApiKey();
  const [apiKey, setApiKey] = useState<string>(() => (hasEnvApiKey ? '' : geminiService.getStoredApiKey() ?? ''));
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState<boolean>(() => !hasEnvApiKey && !geminiService.getStoredApiKey());

  const [tasks, setTasks] = useState<Task[]>([]);
  const [areTasksLoading, setAreTasksLoading] = useState<boolean>(true);
  const [tasksError, setTasksError] = useState<string | null>(null);
  const hasSeededRef = useRef(false);
  
  const [chatHistory, setChatHistory] = useState<ChatHistoryItem[]>(() => {
    try {
      const savedHistory = localStorage.getItem('vitalCommandCenter_chatHistory');
      if (savedHistory) {
        return JSON.parse(savedHistory);
      }
    } catch (error) {
      console.error('Could not load chat history from localStorage', error);
    }
    return [];
  });
  
  const [isManuallySorted, setIsManuallySorted] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('vitalCommandCenter_isManuallySorted');
      return saved ? JSON.parse(saved) : false;
    } catch (error) {
      return false;
    }
  });

  const [suggestions, setSuggestions] = useState<ProactiveSuggestion[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [conversationContext, setConversationContext] = useState<{ originalPrompt: string } | null>(null);
  const [generatingSubtasksFor, setGeneratingSubtasksFor] = useState<string | null>(null);
  const [maximizedTaskId, setMaximizedTaskId] = useState<string | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState<{ taskId: string; subtaskId?: string } | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [datePickerTask, setDatePickerTask] = useState<Task | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState('default');
  const [isFiltersVisible, setIsFiltersVisible] = useState(false);
  const [filters, setFilters] = useState({
    searchTerm: '',
    category: 'all',
    priority: 'all',
    status: 'pending' as FilterStatus,
  });

  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [dragOverTaskId, setDragOverTaskId] = useState<string | null>(null);

  const [isConversationModeActive, setIsConversationModeActive] = useState(false);
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [isPlanningWeek, setIsPlanningWeek] = useState(false);
  const [smartActionTask, setSmartActionTask] = useState<Task | null>(null);
  const [currentCalendarDate, setCurrentCalendarDate] = useState(new Date());

  const feedEndRef = useRef<HTMLDivElement>(null);
  const speechRecognition = useRef<SpeechRecognition | null>(null);
  const audioContext = useRef<AudioContext | null>(null);
  const conversationStopRequested = useRef(false);

  const showApiKeyPrompt = (message?: string) => {
    if (hasEnvApiKey) return;
    if (message) {
      setChatHistory(prev => [...prev, { type: 'groundedAnswer', data: { text: message, sources: [] } }]);
    }
    setIsApiKeyModalOpen(true);
  };

  const ensureGeminiReady = (options?: { notify?: boolean; message?: string }) => {
    if (geminiService.isClientReady()) {
      return true;
    }
    if (hasEnvApiKey) {
      console.error("El cliente de Gemini no está listo a pesar de existir una clave de entorno.");
      return false;
    }
    if (options?.notify) {
      const fallbackMessage = options.message ?? 'Configura tu clave API de Gemini para usar las funciones de IA.';
      showApiKeyPrompt(fallbackMessage);
    } else {
      setIsApiKeyModalOpen(true);
    }
    return false;
  };

  const handleSaveApiKey = (key: string) => {
    if (hasEnvApiKey) return;
    setApiKey(key);
    setIsApiKeyModalOpen(false);
  };

  const handleClearApiKey = () => {
    if (hasEnvApiKey) return;
    setApiKey('');
    geminiService.clearClient();
    setIsApiKeyModalOpen(true);
  };

  const handleCancelApiKeyModal = () => {
    setIsApiKeyModalOpen(false);
  };

  const isMountedRef = useRef(true);
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const loadTasks = useCallback(
    async ({ showSpinner = true }: { showSpinner?: boolean } = {}) => {
      if (showSpinner) setAreTasksLoading(true);
      setTasksError(null);

      try {
        let fetchedTasks = await taskRepository.fetchTasks();

        if (!hasSeededRef.current && fetchedTasks.length === 0) {
          hasSeededRef.current = true;
          await taskRepository.seedInitialTasks(initialTasks);
          fetchedTasks = await taskRepository.fetchTasks();
        } else {
          hasSeededRef.current = true;
        }

        if (isMountedRef.current) {
          setTasks(fetchedTasks);
        }
      } catch (error) {
        console.error('Error loading tasks from Supabase', error);
        if (isMountedRef.current) {
          setTasksError('No se pudieron cargar las tareas. Intenta recargar.');
        }
      } finally {
        if (isMountedRef.current) {
          setAreTasksLoading(false);
        }
      }
    },
    []
  );

  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  useEffect(() => {
    if (hasEnvApiKey) {
      return;
    }
    if (apiKey) {
      try {
        if (!geminiService.isClientReady() || geminiService.getCurrentApiKey() !== apiKey) {
          geminiService.initializeClient(apiKey, { shouldPersist: true });
        }
      } catch (error) {
        console.error('No se pudo inicializar el cliente de Gemini', error);
        setIsApiKeyModalOpen(true);
      }
    } else {
      geminiService.clearClient();
    }
  }, [apiKey]);

  useEffect(() => {
    if ('Notification' in window) {
      setNotificationPermission(Notification.permission);
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition: SpeechRecognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'es-ES';

      recognition.onresult = (event) => {
        if (isConversationModeActive) return; // Handled by separate logic
        let finalTranscript = '';
        let interimTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }
        setInput(finalTranscript + interimTranscript);
      };

      recognition.onstart = () => setIsListening(true);
      recognition.onend = () => setIsListening(false);
      recognition.onerror = (event) => {
        console.error('Speech recognition error', event.error);
        setIsListening(false);
      };
      
      speechRecognition.current = recognition;
    }
  }, []); // Run only once to set up

  const setupConversationRecognition = () => {
    const recognition = speechRecognition.current;
    if (!recognition) return;

    recognition.continuous = false;
    recognition.interimResults = false;
    
    recognition.onresult = (event) => {
      const transcript = event.results[event.results.length - 1][0].transcript.trim();
      if (transcript) {
        processVoiceCommand(transcript);
      }
    };
    recognition.onerror = (event) => {
        console.error('Speech recognition error during conversation', event.error);
        setIsListening(false);
        if (isConversationModeActive) {
            setIsConversationModeActive(false);
        }
      };
  };

  const setupDictationRecognition = () => {
    const recognition = speechRecognition.current;
    if (!recognition) return;

    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      let finalTranscript = '';
      let interimTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }
      setInput(finalTranscript + interimTranscript);
    };
  };


  useEffect(() => {
    if (!geminiService.isClientReady()) {
      setSuggestions([]);
      return;
    }
    const fetchSuggestions = async () => {
      if (tasks.length > 2) {
        const newSuggestions = await geminiService.getProactiveSuggestions(tasks);
        setSuggestions(newSuggestions);
      } else {
        setSuggestions([]);
      }
    };
    const timer = setTimeout(fetchSuggestions, 2000); // Debounce suggestion fetching
    return () => clearTimeout(timer);
  }, [tasks, apiKey]);

  useEffect(() => {
    feedEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, tasks, isLoading]);

  // Persist chat history to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('vitalCommandCenter_chatHistory', JSON.stringify(chatHistory));
    } catch (error) {
      console.error('Could not save chat history to localStorage', error);
    }
  }, [chatHistory]);
  
  // Persist manual sort state to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('vitalCommandCenter_isManuallySorted', JSON.stringify(isManuallySorted));
    } catch (error) {
      console.error('Could not save manual sort state to localStorage', error);
    }
  }, [isManuallySorted]);

  // Handle Notifications
  useEffect(() => {
    const checkNotifications = () => {
      if (!('Notification' in window) || notificationPermission !== 'granted') {
        return;
      }

      const todayStr = getLocalDateString(new Date());
      const storageKey = `notifiedTasks_${todayStr}`;
      
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith('notifiedTasks_') && key !== storageKey) {
          localStorage.removeItem(key);
        }
      });

      const notifiedToday: string[] = JSON.parse(localStorage.getItem(storageKey) || '[]');
      
      const dueTasks = tasks.filter(task => 
        task.dueDate === todayStr && 
        !task.isDone && 
        !notifiedToday.includes(task.id)
      );

      dueTasks.forEach(task => {
        new Notification('¡Recordatorio de Tarea!', {
          body: `Hoy vence: "${task.description}"`,
          icon: '/vite.svg',
        });
        notifiedToday.push(task.id);
      });

      localStorage.setItem(storageKey, JSON.stringify(notifiedToday));
    };
    
    checkNotifications();
    const intervalId = setInterval(checkNotifications, 60000);

    return () => clearInterval(intervalId);
  }, [tasks, notificationPermission]);

  const handleOpenGoogleMapsNavigation = (address: string) => {
      const encodedAddress = encodeURIComponent(address);
      const url = `https://www.google.com/maps/dir/?api=1&destination=${encodedAddress}`;
      window.open(url, '_blank');
      
      const confirmationText = `Abriendo Google Maps para ir a ${address}.`;
      setChatHistory(prev => [...prev, { type: 'groundedAnswer', data: { text: confirmationText, sources: [] } }]);
      return confirmationText;
  };

  const handleAddTask = useCallback(
    async (taskData: Omit<Task, 'id' | 'isDone'>) => {
      try {
        const createdTask = await taskRepository.createTask(taskData);
        await loadTasks({ showSpinner: false });

        if (viewMode === 'calendar' && createdTask.dueDate) {
          const [year, month, day] = createdTask.dueDate.split('-').map(Number);
          setCurrentCalendarDate(new Date(year, month - 1, day));
        }

        return createdTask;
      } catch (error) {
        console.error('No se pudo crear la tarea', error);
        setTasksError('No se pudo crear la tarea.');
        throw error;
      }
    },
    [loadTasks, viewMode]
  );

  const handleAddShoppingResultAsTask = (description: string) => {
    void handleAddTask({
      description,
      category: Category.Shopping,
      priority: Priority.Reminder,
    }).catch(error => {
      console.error('No se pudo añadir la sugerencia de compra como tarea', error);
    });
  };
  
  const handleListen = () => {
    if (isListening) {
      speechRecognition.current?.stop();
    } else {
      setupDictationRecognition();
      speechRecognition.current?.start();
    }
  };

  const handleAddManualSubtask = (taskId: string, parentSubtaskId: string | null, description: string) => {
    void (async () => {
      try {
        await taskRepository.addSubtask(taskId, parentSubtaskId, description);
        await loadTasks({ showSpinner: false });
      } catch (error) {
        console.error('No se pudo añadir la subtarea', error);
        setTasksError('No se pudo añadir la subtarea.');
      }
    })();
  };

  const handleAddSuggestionAsSubtask = (chatItemIndex: number, suggestionText: string, parentTaskId: string) => {
    void (async () => {
      try {
        await taskRepository.addSubtask(parentTaskId, null, suggestionText);
        await loadTasks({ showSpinner: false });

        setChatHistory(prev => {
          const newHistory = [...prev];
          const chatItem = newHistory[chatItemIndex];
          if (chatItem?.type === 'subtaskSuggestion') {
            const updatedSuggestions = chatItem.suggestions.filter(s => s !== suggestionText);

            if (updatedSuggestions.length === 0) {
              newHistory.splice(chatItemIndex, 1);
            } else {
              newHistory[chatItemIndex] = { ...chatItem, suggestions: updatedSuggestions };
            }
          }
          return newHistory;
        });
      } catch (error) {
        console.error('No se pudo añadir la subtarea sugerida', error);
        setTasksError('No se pudo añadir la subtarea sugerida.');
      }
    })();
  };

  const handleDismissSubtaskSuggestion = (chatItemIndex: number) => {
    setChatHistory(prev => prev.filter((_, index) => index !== chatItemIndex));
  };

  const handleDismissChatItem = (chatItemIndex: number) => {
    setChatHistory(prev => prev.filter((_, index) => index !== chatItemIndex));
  };

  // FIX: Modify handleSubmit to accept an optional `directInput` argument. This allows the function to be called programmatically with a specific prompt, bypassing the component's `input` state, which resolves the error on line 445.
  const handleSubmit = async (e: React.FormEvent, directInput?: string) => {
    e.preventDefault();
    if (!ensureGeminiReady({ notify: true, message: 'Configura tu clave API de Gemini para enviar esta solicitud.' })) {
      return;
    }
    const currentInput = directInput ?? input;
    if (!currentInput.trim() || isLoading) return;

    if(isListening) {
      speechRecognition.current?.stop();
    }

    setInput('');
    setIsLoading(true);

    try {
        const functionCalls = await geminiService.findFunctionCall(currentInput);
        if (functionCalls && functionCalls.length > 0) {
            for (const fc of functionCalls) {
                if (fc.name === 'openGoogleMapsNavigation' && fc.args.address) {
                    handleOpenGoogleMapsNavigation(fc.args.address as string);
                    setIsLoading(false);
                    return;
                }
            }
        }

        if (conversationContext) {
            setChatHistory(prev => [...prev, { type: 'userResponse', text: currentInput }]);
            const refinedTaskData = await geminiService.refineTask(conversationContext.originalPrompt, currentInput);
            
            if (refinedTaskData) {
                const newTask = await handleAddTask(refinedTaskData);
                setChatHistory(prev => [...prev, { type: 'task', data: newTask }]);

                const subtasks = await geminiService.generateSubtasks(newTask.description);
                if (subtasks.length > 0) {
                    setChatHistory(prev => [...prev, { type: 'subtaskSuggestion', suggestions: subtasks, parentTaskDescription: newTask.description, parentTaskId: newTask.id }]);
                }
            } else {
                 const fallbackAnswer: GroundedAnswer = { text: "Lo siento, no pude procesar esa información. ¿Intentamos de nuevo?", sources: [] };
                 setChatHistory(prev => [...prev, { type: 'groundedAnswer', data: fallbackAnswer }]);
            }
            setConversationContext(null);
        } else {
            const classification = await geminiService.classifyQuery(currentInput);

            if (classification?.queryType === 'task') {
                if ('task' in classification) {
                    const newTask = await handleAddTask(classification.task);
                    setChatHistory(prev => [...prev, { type: 'task', data: newTask }]);
                    const subtasks = await geminiService.generateSubtasks(newTask.description);
                    if (subtasks.length > 0) {
                        setChatHistory(prev => [...prev, { type: 'subtaskSuggestion', suggestions: subtasks, parentTaskDescription: newTask.description, parentTaskId: newTask.id }]);
                    }
                } else {
                    setConversationContext({ originalPrompt: currentInput });
                    setChatHistory(prev => [...prev, { type: 'aiQuestion', text: classification.clarificationQuestion }]);
                }
            } else if (classification?.queryType === 'shopping') {
                const shoppingResults = await geminiService.getShoppingSuggestions(currentInput);
                if (shoppingResults.length > 0) {
                    setChatHistory(prev => [...prev, { type: 'shopping', data: shoppingResults, originalQuery: currentInput }]);
                } else {
                     const fallbackAnswer: GroundedAnswer = { text: `No encontré sugerencias de compra para "${currentInput}".`, sources: [] };
                     setChatHistory(prev => [...prev, { type: 'groundedAnswer', data: fallbackAnswer }]);
                }
            } else if (classification?.queryType === 'question') {
                const locationKeywords = ['cerca', 'cercano', 'cercana', 'en la zona', 'por aquí', 'cerca de mí', 'cercanas'];
                const isLocationQuery = locationKeywords.some(kw => currentInput.toLowerCase().includes(kw));
                
                let userLocation: { latitude: number; longitude: number } | null = null;
                if (isLocationQuery) {
                    try {
                        userLocation = await getUserLocation();
                    } catch (error) {
                         const errorMessage = (error as Error).message;
                         const fallbackAnswer: GroundedAnswer = { text: `No pude realizar la búsqueda local: ${errorMessage}`, sources: [] };
                         setChatHistory(prev => [...prev, { type: 'groundedAnswer', data: fallbackAnswer }]);
                         setIsLoading(false);
                         return;
                    }
                }

                if (currentInput.toLowerCase().includes('plan para') || currentInput.toLowerCase().includes('cómo puedo')) {
                    setChatHistory(prev => [...prev, { type: 'deepPlan', data: '', originalQuery: currentInput }]);
                    const streamResponse = await geminiService.getDeepPlanStream(currentInput);
                    for await (const chunk of streamResponse) {
                        setChatHistory(prev => {
                            const lastItem = prev[prev.length - 1];
                            if (lastItem?.type === 'deepPlan') {
                                const updatedItem = { ...lastItem, data: lastItem.data + chunk.text };
                                return [...prev.slice(0, -1), updatedItem];
                            }
                            return prev;
                        });
                    }
                } else {
                    const initialAnswer: GroundedAnswer = { text: '', sources: [] };
                    setChatHistory(prev => [...prev, { type: 'groundedAnswer', data: initialAnswer }]);
                    
                    const streamResponse = await geminiService.getGroundedAnswerStream(currentInput, userLocation ?? undefined);
                    
                    for await (const chunk of streamResponse) {
                         setChatHistory(prev => {
                            const lastItem = prev[prev.length - 1];
                            if (lastItem?.type === 'groundedAnswer') {
                                const updatedItem = {
                                    ...lastItem,
                                    data: { ...lastItem.data, text: lastItem.data.text + chunk.text }
                                };
                                return [...prev.slice(0, -1), updatedItem];
                            }
                            return prev;
                        });
                    }
                    
                    const finalTools: ({ googleSearch: {} } | { googleMaps: {} })[] = [{googleSearch: {}}];
                    const finalToolConfig: any = {};
                    if (userLocation) {
                        finalTools.push({googleMaps: {}});
                        finalToolConfig.retrievalConfig = { latLng: userLocation };
                    }
                    
                    const geminiClient = geminiService.getClient();
                    const finalResponse = await geminiClient.models.generateContent({ 
                        model: "gemini-2.5-flash", 
                        contents: currentInput, 
                        config: { tools: finalTools },
                        toolConfig: finalToolConfig
                    } as any);
                    const sources: { title: string, uri: string }[] = [];
                    const groundingChunks = finalResponse.candidates?.[0]?.groundingMetadata?.groundingChunks;
                    if (groundingChunks) {
                        for (const chunk of groundingChunks) {
                            if (chunk.web) sources.push({ title: chunk.web.title, uri: chunk.web.uri });
                            else if (chunk.maps) sources.push({ title: chunk.maps.title, uri: chunk.maps.uri });
                        }
                    }

                     setChatHistory(prev => {
                        const lastItem = prev[prev.length - 1];
                        if (lastItem?.type === 'groundedAnswer') {
                            const updatedItem = {
                                ...lastItem,
                                data: { ...lastItem.data, sources }
                            };
                            return [...prev.slice(0, -1), updatedItem];
                        }
                        return prev;
                    });
                }
            } else {
                 const fallbackAnswer: GroundedAnswer = { text: "No estoy seguro de cómo ayudar con eso. ¿Puedes intentar reformularlo?", sources: [] };
                 setChatHistory(prev => [...prev, { type: 'groundedAnswer', data: fallbackAnswer }]);
            }
        }
    } catch (error) {
        console.error("Error processing query:", error);
        const fallbackAnswer: GroundedAnswer = { text: "Lo siento, ocurrió un error al procesar tu solicitud.", sources: [] };
        setChatHistory(prev => [...prev, { type: 'groundedAnswer', data: fallbackAnswer }]);
        setConversationContext(null);
    } finally {
        setIsLoading(false);
    }
  };

    const playAudio = async (base64Audio: string) => {
        if (!audioContext.current) {
            audioContext.current = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
        }
        const ctx = audioContext.current;
        setIsAiSpeaking(true);
        try {
            const decodedBytes = decode(base64Audio);
            const audioBuffer = await decodeAudioData(decodedBytes, ctx, 24000, 1);
            return new Promise<void>((resolve) => {
                const source = ctx.createBufferSource();
                source.buffer = audioBuffer;
                source.connect(ctx.destination);
                source.onended = () => {
                    setIsAiSpeaking(false);
                    resolve();
                };
                source.start();
            });
        } catch (error) {
            console.error("Failed to play audio:", error);
            setIsAiSpeaking(false);
            return Promise.resolve();
        }
    };

    const processTextCommand = async (prompt: string): Promise<string> => {
        if (!ensureGeminiReady({ notify: true })) {
            return "Configura tu clave API de Gemini para continuar.";
        }
        try {
            const functionCalls = await geminiService.findFunctionCall(prompt);
            if (functionCalls && functionCalls.length > 0) {
                for (const fc of functionCalls) {
                    if (fc.name === 'openGoogleMapsNavigation' && fc.args.address) {
                        return handleOpenGoogleMapsNavigation(fc.args.address as string);
                    }
                }
            }

            if (conversationContext) {
                setChatHistory(prev => [...prev, { type: 'userResponse', text: prompt }]);
                const refinedTaskData = await geminiService.refineTask(conversationContext.originalPrompt, prompt);
                setConversationContext(null);
                if (refinedTaskData) {
                    const newTask = await handleAddTask(refinedTaskData);
                    setChatHistory(prev => [...prev, { type: 'task', data: newTask }]);
                    return `Claro, he añadido la tarea: ${newTask.description}.`;
                } else {
                    const fallbackAnswer: GroundedAnswer = { text: "Lo siento, no pude procesar esa información.", sources: [] };
                    setChatHistory(prev => [...prev, { type: 'groundedAnswer', data: fallbackAnswer }]);
                    return fallbackAnswer.text;
                }
            }

            const classification = await geminiService.classifyQuery(prompt);

            if (classification?.queryType === 'task') {
                if ('task' in classification) {
                    const newTask = await handleAddTask(classification.task);
                    setChatHistory(prev => [...prev, { type: 'task', data: newTask }]);
                    return `Tarea añadida: ${newTask.description}.`;
                } else {
                    setConversationContext({ originalPrompt: prompt });
                    setChatHistory(prev => [...prev, { type: 'aiQuestion', text: classification.clarificationQuestion }]);
                    return classification.clarificationQuestion;
                }
            } else if (classification?.queryType === 'question') {
                const locationKeywords = ['cerca', 'cercano', 'cercana', 'en la zona', 'por aquí', 'cerca de mí', 'cercanas'];
                const isLocationQuery = locationKeywords.some(kw => prompt.toLowerCase().includes(kw));

                let userLocation: { latitude: number; longitude: number } | null = null;
                if (isLocationQuery) {
                    try {
                        userLocation = await getUserLocation();
                    } catch (error) {
                        const errorMessage = (error as Error).message;
                        const responseText = `No pude realizar la búsqueda local: ${errorMessage}`;
                        setChatHistory(prev => [...prev, { type: 'groundedAnswer', data: { text: responseText, sources: [] } }]);
                        return responseText;
                    }
                }

                const tools: ({ googleSearch: {} } | { googleMaps: {} })[] = [{googleSearch: {}}];
                const toolConfig: any = {};
                if (userLocation) {
                    tools.push({googleMaps: {}});
                    toolConfig.retrievalConfig = { latLng: userLocation };
                }

                const geminiClient = geminiService.getClient();
                const response = await geminiClient.models.generateContent({
                    model: "gemini-2.5-flash",
                    contents: prompt,
                    config: { tools },
                    toolConfig
                } as any);
                
                const aiResponseText = response.text.trim();
                const sources: { title: string, uri: string }[] = [];
                const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
                if (groundingChunks) {
                    for (const chunk of groundingChunks) {
                        if (chunk.web) sources.push({ title: chunk.web.title, uri: chunk.web.uri });
                        else if (chunk.maps) sources.push({ title: chunk.maps.title, uri: chunk.maps.uri });
                    }
                }
                setChatHistory(prev => [...prev, { type: 'groundedAnswer', data: { text: aiResponseText, sources } }]);
                return aiResponseText;

            } else if (classification?.queryType === 'shopping') {
                 const shoppingResults = await geminiService.getShoppingSuggestions(prompt);
                if (shoppingResults.length > 0) {
                    setChatHistory(prev => [...prev, { type: 'shopping', data: shoppingResults, originalQuery: prompt }]);
                    return `He encontrado algunas opciones de compra para ${prompt}. Puedes verlas en la pantalla.`;
                } else {
                    return `No encontré sugerencias de compra para "${prompt}".`;
                }
            } else {
                const fallbackText = "No estoy seguro de cómo ayudar con eso.";
                setChatHistory(prev => [...prev, { type: 'groundedAnswer', data: { text: fallbackText, sources: [] } }]);
                return fallbackText;
            }
        } catch (error) {
            console.error("Error processing text command:", error);
            const errorText = "Lo siento, ocurrió un error al procesar tu solicitud.";
            setConversationContext(null);
            return errorText;
        }
    };
    
    const processVoiceCommand = async (transcript: string) => {
        setIsLoading(true);
        setChatHistory(prev => [...prev, { type: 'userResponse', text: transcript }]);
    
        if (transcript.toLowerCase().includes("detener conversación") || transcript.toLowerCase().includes("modo texto")) {
            toggleConversationMode();
            const goodbyeText = "Entendido, cambiando a modo de texto.";
            const audioData = await geminiService.generateSpeech(goodbyeText);
            if (audioData) await playAudio(audioData);
            setIsLoading(false);
            return;
        }
    
        const aiResponseText = await processTextCommand(transcript);
        setIsLoading(false);
        if (!geminiService.isClientReady()) {
            return;
        }
    
        if (aiResponseText) {
          const audioData = await geminiService.generateSpeech(aiResponseText);
          if (audioData) {
            await playAudio(audioData);
          }
        }
        
        if (isConversationModeActive && speechRecognition.current) {
            speechRecognition.current.start();
        }
    };

    const toggleConversationMode = () => {
        const sr = speechRecognition.current;
        if (!sr) return;

        if (isConversationModeActive) {
            conversationStopRequested.current = true;
            sr.stop();
            setIsConversationModeActive(false);
        } else {
        if (!ensureGeminiReady({ notify: true, message: 'Configura tu clave API de Gemini para iniciar el modo conversación.' })) {
            return;
        }
            setupConversationRecognition();
            conversationStopRequested.current = false;
            sr.start();
            setIsConversationModeActive(true);
        }
    };

  const handleToggleDone = (id: string) => {
    const targetTask = tasks.find(t => t.id === id);
    if (!targetTask) return;

    const newIsDone = !targetTask.isDone;

    void (async () => {
      try {
        await taskRepository.setTaskDone(id, newIsDone);
        await taskRepository.setAllSubtasksDone(id, newIsDone);
        await loadTasks({ showSpinner: false });
      } catch (error) {
        console.error('No se pudo actualizar el estado de la tarea', error);
        setTasksError('No se pudo actualizar el estado de la tarea.');
      }
    })();
  };
  
  const handleAddSuggestion = (description: string) => {
    void handleAddTask({ description, category: Category.Other, priority: Priority.Idea })
      .then(() => setSuggestions([]))
      .catch(error => {
        console.error('No se pudo añadir la sugerencia como tarea', error);
        setTasksError('No se pudo añadir la sugerencia.');
      });
  };

  const handleOpenEditModal = (task: Task) => {
    setEditingTask(task);
    setIsEditModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsEditModalOpen(false);
    setEditingTask(null);
  };
  
  const handleOpenDatePickerModal = (taskId: string) => {
    const taskToSetDate = tasks.find(t => t.id === taskId);
    if (taskToSetDate) {
        setDatePickerTask(taskToSetDate);
    }
  };

  const handleSetTaskDate = (taskId: string, date: string) => {
    setDatePickerTask(null);
    void (async () => {
      try {
        await taskRepository.setTaskDueDate(taskId, date);
        await loadTasks({ showSpinner: false });
      } catch (error) {
        console.error('No se pudo actualizar la fecha de la tarea', error);
        setTasksError('No se pudo actualizar la fecha de la tarea.');
      }
    })();
  };

  const handleUpdateTask = (updatedTask: Task) => {
    void (async () => {
      try {
        await taskRepository.updateTask(updatedTask);
        await loadTasks({ showSpinner: false });
        handleCloseModal();
      } catch (error) {
        console.error('No se pudo guardar la tarea', error);
        setTasksError('No se pudo guardar la tarea.');
      }
    })();
  };

  const handleGenerateAndAddSubtasks = async (taskId: string, parentSubtaskId: string | null, taskDescription: string) => {
    if (!ensureGeminiReady({ notify: true, message: 'Configura tu clave API de Gemini para generar subtareas automáticamente.' })) {
      return;
    }
    const loadingId = parentSubtaskId ?? taskId;
    setGeneratingSubtasksFor(loadingId);
    try {
        const subtaskDescriptions = await geminiService.generateSubtasks(taskDescription);
        if (subtaskDescriptions.length > 0) {
          await taskRepository.addSubtasks(taskId, parentSubtaskId, subtaskDescriptions);
          await loadTasks({ showSpinner: false });
        }
    } catch (error) {
        console.error("Error generating subtasks:", error);
    } finally {
        setGeneratingSubtasksFor(null);
    }
  };

  const findSubtaskById = (subtasks: Subtask[] | undefined, targetId: string): Subtask | null => {
    if (!subtasks) return null;
    for (const subtask of subtasks) {
      if (subtask.id === targetId) return subtask;
      const found = findSubtaskById(subtask.subtasks, targetId);
      if (found) return found;
    }
    return null;
  };

  const handleToggleSubtask = (taskId: string, subtaskId: string) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    const subtask = findSubtaskById(task.subtasks, subtaskId);
    if (!subtask) return;

    const newIsDone = !subtask.isDone;

    void (async () => {
      try {
        await taskRepository.toggleSubtask(taskId, subtaskId, newIsDone);
        await loadTasks({ showSpinner: false });
      } catch (error) {
        console.error('No se pudo actualizar la subtarea', error);
        setTasksError('No se pudo actualizar la subtarea.');
      }
    })();
  };

  const handleEditSubtask = (taskId: string, subtaskId: string, newDescription: string) => {
    void (async () => {
      try {
        await taskRepository.updateSubtask(subtaskId, newDescription);
        await loadTasks({ showSpinner: false });
      } catch (error) {
        console.error('No se pudo editar la subtarea', error);
        setTasksError('No se pudo editar la subtarea.');
      }
    })();
  };
  
  const handleRequestDelete = (details: { taskId: string; subtaskId?: string }) => {
    setDeleteConfirmation(details);
  };
  
  const handleConfirmDelete = () => {
    if (!deleteConfirmation) return;

    const { taskId, subtaskId } = deleteConfirmation;

    void (async () => {
      try {
        if (subtaskId) {
          await taskRepository.deleteSubtask(taskId, subtaskId);
        } else {
          await taskRepository.deleteTask(taskId);
        }
        await loadTasks({ showSpinner: false });
      } catch (error) {
        console.error('No se pudo eliminar la tarea o subtarea', error);
        setTasksError('No se pudo eliminar la tarea o subtarea.');
      } finally {
        setDeleteConfirmation(null);
      }
    })();
  };

  const handleSearchForInfo = async (prompt: string) => {
    if (isLoading) return;
    if (!geminiService.isClientReady()) {
      showApiKeyPrompt('Configura tu clave API de Gemini para buscar información.');
      return;
    }
    setInput(`Buscando información sobre: "${prompt}"`);
    // Trigger submit for the search
    const fakeEvent = { preventDefault: () => {} } as React.FormEvent;
    // We need to set the input and then submit.
    // However, since setState is async, we'll pass the prompt directly.
    await handleSubmit(fakeEvent, `¿Qué es ${prompt}?`);
  };

  const handleFilterChange = (name: keyof typeof filters, value: string) => {
    setFilters(prevFilters => ({
      ...prevFilters,
      [name]: value,
    }));
  };
  
  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, taskId: string) => {
    setDraggingTaskId(taskId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>, taskId: string) => {
    e.preventDefault();
    if (draggingTaskId !== taskId) {
      setDragOverTaskId(taskId);
    }
  };

  const handleDragEnd = () => {
    setDraggingTaskId(null);
    setDragOverTaskId(null);
  };
  
  const handleDrop = (e: React.DragEvent<HTMLDivElement>, targetTaskId: string) => {
    e.preventDefault();
    if (!draggingTaskId || draggingTaskId === targetTaskId) return;

    setTasks(currentTasks => {
      const dragIndex = currentTasks.findIndex(t => t.id === draggingTaskId);
      const targetIndex = currentTasks.findIndex(t => t.id === targetTaskId);
      if (dragIndex === -1 || targetIndex === -1) return currentTasks;

      const newTasks = [...currentTasks];
      const [removed] = newTasks.splice(dragIndex, 1);
      newTasks.splice(targetIndex, 0, removed);
      return newTasks;
    });
    
    setIsManuallySorted(true);
    handleDragEnd();
  };

  const handleNotificationPermissionChange = (newPermission: string) => {
    setNotificationPermission(newPermission);
    if (newPermission === 'granted') {
      new Notification('¡Notificaciones Activadas!', {
        body: 'Ahora recibirás recordatorios para tus tareas.',
        icon: '/vite.svg',
      });
    }
  };

  const handlePlanWeek = async () => {
    if (!ensureGeminiReady({ notify: true, message: 'Configura tu clave API de Gemini para planificar la semana con IA.' })) {
      return;
    }
    setIsPlanningWeek(true);
    try {
        const pendingTasks = tasks.filter(t => !t.isDone);
        const scheduledUpdates = await geminiService.planWeek(pendingTasks);

        if (scheduledUpdates && scheduledUpdates.length > 0) {
            for (const update of scheduledUpdates) {
              await taskRepository.setTaskDueDate(update.taskId, update.newDueDate);
            }
            await loadTasks({ showSpinner: false });
            setViewMode('calendar');
        }
    } catch (error) {
        console.error("Error planning week:", error);
        setTasksError('No se pudo planificar la semana.');
    } finally {
        setIsPlanningWeek(false);
    }
  };
  
  const handleOpenSmartActionModal = (task: Task) => {
    if (!ensureGeminiReady({ notify: true, message: 'Configura tu clave API de Gemini para usar las acciones inteligentes.' })) {
      return;
    }
    setSmartActionTask(task);
  };

  const handleOpenSmartActionModalForSubtask = (description: string) => {
    if (!ensureGeminiReady({ notify: true, message: 'Configura tu clave API de Gemini para usar las acciones inteligentes.' })) {
      return;
    }
    const tempTask: Task = {
      id: `subtask_${crypto.randomUUID()}`,
      description,
      category: Category.Other,
      priority: Priority.Idea,
      isDone: false,
    };
    setSmartActionTask(tempTask);
  };

  const handleCloseSmartActionModal = () => {
    setSmartActionTask(null);
  };

  const filteredAndSortedTasks = useMemo(() => {
    const filtered = tasks.filter(task => {
      const searchTermMatch = task.description.toLowerCase().includes(filters.searchTerm.toLowerCase());
      const categoryMatch = filters.category === 'all' || task.category === filters.category;
      const priorityMatch = filters.priority === 'all' || task.priority === filters.priority;
      const statusMatch = filters.status === 'all' ||
                          (filters.status === 'completed' && task.isDone) ||
                          (filters.status === 'pending' && !task.isDone);
      
      return searchTermMatch && categoryMatch && priorityMatch && statusMatch;
    });

    if (isManuallySorted) {
        return filtered;
    }

    return filtered.sort((a, b) => {
      if (a.isDone !== b.isDone) return a.isDone ? 1 : -1;
      return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
    });
  }, [tasks, filters, isManuallySorted]);
  
  const hasApiKey = geminiService.isClientReady();
  const maximizedTask = maximizedTaskId ? tasks.find(t => t.id === maximizedTaskId) : null;

  return (
    <div className="bg-gray-900 text-white min-h-screen font-sans flex flex-col">
      <header className="p-4 border-b border-gray-700/50 sticky top-0 bg-gray-900/80 backdrop-blur-sm z-10">
        <div className="max-w-6xl mx-auto flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-2xl font-bold text-center sm:text-left">Asistente IA</h1>
          {!hasEnvApiKey && (
            <button
              onClick={() => setIsApiKeyModalOpen(true)}
              className="inline-flex items-center justify-center gap-2 px-3 py-2 text-sm font-semibold rounded-lg border border-purple-500/60 text-purple-200 hover:bg-purple-500/10 transition-colors self-center sm:self-auto"
              title={hasApiKey ? 'Actualizar la clave de Gemini' : 'Configurar la clave de Gemini'}
            >
              <span className={`h-2 w-2 rounded-full ${hasApiKey ? 'bg-emerald-400' : 'bg-red-400'}`} aria-hidden="true" />
              <span>{hasApiKey ? 'Actualizar clave API' : 'Configurar clave API'}</span>
            </button>
          )}
        </div>
      </header>
      
      <main className="flex-1 overflow-y-auto p-4 pb-32 space-y-6">
        <Dashboard tasks={tasks} onTaskClick={setMaximizedTaskId} />

        {tasksError && (
          <div className="p-3 bg-red-900/40 border border-red-700/60 text-red-200 rounded-lg">
            {tasksError}
          </div>
        )}

        {suggestions.length > 0 && (
          <div className="p-3 bg-gray-800 rounded-xl border border-gray-700">
            <h2 className="text-sm font-semibold text-indigo-300 mb-2 flex items-center gap-2"><BrainIcon className="w-4 h-4" /> Sugerencias para ti</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {suggestions.map((s, i) => (
                    <SuggestionCard 
                        key={i} 
                        suggestion={s}
                        onAdd={handleAddSuggestion}
                        onDismiss={() => setSuggestions(sugs => sugs.filter((_, idx) => idx !== i))}
                    />
                ))}
            </div>
          </div>
        )}
        
        {areTasksLoading ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-300 gap-3">
            <LoadingSpinner />
            <span className="text-sm">Cargando tareas...</span>
          </div>
        ) : (
          <>
            <div className="flex justify-between items-center">
                <h2 className="text-xl font-semibold text-gray-300">Mis Tareas</h2>
                <div className="flex items-center gap-2">
                    <button
                        onClick={handlePlanWeek}
                        disabled={isPlanningWeek}
                        className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 disabled:bg-purple-900 disabled:cursor-not-allowed transition-colors"
                        title="Planificar Semana con IA"
                    >
                        {isPlanningWeek ? <LoadingSpinner /> : <WandIcon className="w-5 h-5" />}
                        <span className="hidden sm:inline">Planificar Semana</span>
                    </button>
                    <div className="h-6 w-px bg-white/20"></div>
                    <button
                        onClick={() => setIsFiltersVisible(prev => !prev)}
                        className={`p-2 rounded-lg ${isFiltersVisible ? 'bg-purple-600' : 'bg-gray-700 hover:bg-gray-600'}`}
                        aria-label="Mostrar/Ocultar filtros"
                        title="Mostrar/Ocultar filtros"
                    >
                        <FilterIcon className="w-5 h-5" />
                    </button>
                    <NotificationBell
                      permission={notificationPermission}
                      onPermissionChange={handleNotificationPermissionChange}
                    />
                    <button
                        onClick={() => setViewMode('grid')}
                        className={`p-2 rounded-lg ${viewMode === 'grid' ? 'bg-purple-600' : 'bg-gray-700 hover:bg-gray-600'}`}
                        aria-label="Vista de cuadrícula"
                    >
                        <GridViewIcon className="w-5 h-5" />
                    </button>
                     <button
                        onClick={() => setViewMode('calendar')}
                        className={`p-2 rounded-lg ${viewMode === 'calendar' ? 'bg-purple-600' : 'bg-gray-700 hover:bg-gray-600'}`}
                        aria-label="Vista de calendario"
                    >
                        <CalendarViewIcon className="w-5 h-5" />
                    </button>
                </div>
            </div>

            {isFiltersVisible && <TaskFilters filters={filters} onFilterChange={handleFilterChange} />}

            {viewMode === 'grid' ? (
               <>
                {filteredAndSortedTasks.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" onDragOver={(e) => e.preventDefault()}>
                    {filteredAndSortedTasks.map(task => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        generatingSubtasksFor={generatingSubtasksFor}
                        onToggleDone={handleToggleDone}
                        onEdit={handleOpenEditModal}
                        onDeleteTask={handleRequestDelete}
                        onAddDate={handleOpenDatePickerModal}
                        onGenerateSubtasks={handleGenerateAndAddSubtasks}
                        onAddManualSubtask={handleAddManualSubtask}
                        onToggleSubtask={handleToggleSubtask}
                        onRequestDeleteSubtask={handleRequestDelete}
                        onSearchForInfo={handleSearchForInfo}
                        onMaximize={setMaximizedTaskId}
                        onEditSubtask={handleEditSubtask}
                        onDragStart={handleDragStart}
                        onDragEnter={handleDragEnter}
                        onDragEnd={handleDragEnd}
                        onDrop={handleDrop}
                        isDragging={draggingTaskId === task.id}
                        isDraggingOver={dragOverTaskId === task.id}
                        onSmartAction={handleOpenSmartActionModal}
                        onSmartActionForSubtask={handleOpenSmartActionModalForSubtask}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-10 text-gray-400 bg-gray-800/50 rounded-lg">
                    <p className="text-lg font-semibold">No se encontraron tareas</p>
                    <p className="text-sm mt-1">Intenta ajustar la búsqueda o los filtros aplicados.</p>
                  </div>
                )}
              </>
            ) : (
                <CalendarView 
                    tasks={filteredAndSortedTasks} 
                    onTaskClick={setMaximizedTaskId} 
                    onSetTaskDate={handleSetTaskDate}
                    currentDate={currentCalendarDate}
                    setCurrentDate={setCurrentCalendarDate}
                />
            )}
          </>
        )}

        {chatHistory.length > 0 && <hr className="border-gray-700" />}

        {chatHistory.map((item, index) => (
          <div key={index} className="relative animate-fade-in">
            <button
              onClick={() => handleDismissChatItem(index)}
              className="absolute -right-2 -top-2 bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white p-1 rounded-full shadow-lg transition-colors"
              aria-label="Cerrar conversación"
            >
              <XIcon className="w-4 h-4" />
            </button>
            {item.type === 'task' && <p className="text-green-400 italic text-center my-4">✓ Tarea añadida: "{item.data.description}"</p>}
            {item.type === 'groundedAnswer' && <ChatResponseCard answer={item.data} />}
            {item.type === 'aiQuestion' && <ChatResponseCard answer={{text: item.text, sources: []}} />}
            {item.type === 'userResponse' && <p className="text-right text-gray-400 italic my-2">Tu respuesta: "{item.text}"</p>}
            {item.type === 'subtaskSuggestion' && <SubtaskSuggestionCard 
                suggestions={item.suggestions} 
                parentTaskDescription={item.parentTaskDescription} 
                parentTaskId={item.parentTaskId}
                chatItemIndex={index}
                onAddSuggestionAsSubtask={handleAddSuggestionAsSubtask}
                onDismiss={handleDismissSubtaskSuggestion}
            />}
            {item.type === 'shopping' && (
                <div className="bg-gray-800/50 p-4 rounded-xl border border-gray-700/50">
                    <h3 className="font-semibold text-gray-300 mb-4">Sugerencias de compra para: <span className="text-cyan-300">"{item.originalQuery}"</span></h3>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {item.data.map((shopItem, i) => (
                            <ShoppingResultCard key={i} item={shopItem} onAddToList={handleAddShoppingResultAsTask} />
                        ))}
                    </div>
                </div>
            )}
            {item.type === 'deepPlan' && (
                 <div className="bg-gray-800/50 p-4 rounded-xl border border-gray-700/50">
                    <h3 className="font-semibold text-gray-300 mb-4">Plan detallado para: <span className="text-purple-300">"{item.originalQuery}"</span></h3>
                    <div className="whitespace-pre-wrap font-sans text-gray-200" dangerouslySetInnerHTML={{ __html: item.data }}></div>
                 </div>
            )}
          </div>
        ))}
        <div ref={feedEndRef} />
      </main>

      <footer className="fixed bottom-0 left-0 right-0 bg-gray-900/80 backdrop-blur-sm p-4 border-t border-gray-700/50 z-20">
        <form onSubmit={handleSubmit} className="max-w-3xl mx-auto flex items-center gap-3">
          <button
              type="button"
              onClick={toggleConversationMode}
              className={`p-2.5 rounded-full transition-colors flex-shrink-0 ${
                isConversationModeActive
                ? 'bg-purple-600 text-white animate-pulse' 
                : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
              }`}
              disabled={!speechRecognition.current || (isListening && !isConversationModeActive)}
              aria-label={isConversationModeActive ? 'Detener conversación' : 'Iniciar conversación por voz'}
          >
              <VoiceWaveIcon className="w-5 h-5" />
          </button>
          <button
              type="button"
              onClick={handleListen}
              className={`p-2.5 rounded-full transition-colors flex-shrink-0 ${
                isListening && !isConversationModeActive
                ? 'bg-red-600 text-white animate-pulse' 
                : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
              }`}
              disabled={!speechRecognition.current || isConversationModeActive}
              aria-label={isListening ? 'Detener dictado' : 'Dictar por voz'}
          >
              <MicrophoneIcon className="w-5 h-5" />
          </button>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
                isConversationModeActive ? "Habla ahora..." :
                isListening ? "Escuchando..." : 
                conversationContext ? "Escribe tu respuesta..." : "Añadir tarea, hacer una pregunta..."
            }
            className="w-full bg-gray-800 border border-gray-700 rounded-lg py-2 px-4 focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all"
            disabled={isLoading || isConversationModeActive}
          />
          <button 
            type="submit"
            className="bg-purple-600 p-2.5 rounded-full hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors flex-shrink-0"
            disabled={isLoading || !input.trim() || isConversationModeActive}
            aria-label="Enviar"
          >
            {isLoading && !isConversationModeActive ? <LoadingSpinner /> : <SendIcon className="w-5 h-5" />}
          </button>
        </form>
      </footer>

      {!hasEnvApiKey && (
        <Modal isOpen={isApiKeyModalOpen} onClose={handleCancelApiKeyModal}>
          <ApiKeyForm
            initialValue={apiKey}
            onSave={handleSaveApiKey}
            onCancel={handleCancelApiKeyModal}
            onClear={handleClearApiKey}
          />
        </Modal>
      )}

      <Modal isOpen={isEditModalOpen} onClose={handleCloseModal}>
        {editingTask && (
            <EditTaskForm 
                task={editingTask}
                onSave={handleUpdateTask}
                onCancel={handleCloseModal}
            />
        )}
      </Modal>

      <Modal isOpen={!!datePickerTask} onClose={() => setDatePickerTask(null)}>
        {datePickerTask && (
            <SetDateModal
                task={datePickerTask}
                onSave={handleSetTaskDate}
                onCancel={() => setDatePickerTask(null)}
            />
        )}
      </Modal>

      <Modal isOpen={!!smartActionTask} onClose={handleCloseSmartActionModal}>
        {smartActionTask && (
            <SmartActionModal 
                task={smartActionTask}
                onClose={handleCloseSmartActionModal}
            />
        )}
      </Modal>

      <Modal isOpen={!!deleteConfirmation} onClose={() => setDeleteConfirmation(null)}>
        {deleteConfirmation && (
            <div className="text-center">
                <h2 className="text-xl font-bold text-white mb-4">Confirmar Eliminación</h2>
                <p className="text-gray-300 mb-6">
                    {deleteConfirmation.subtaskId
                        ? '¿Estás seguro de que quieres eliminar esta subtarea?'
                        : '¿Estás seguro de que quieres eliminar esta tarea y todas sus subtareas?'}
                    <br/>
                    <span className="font-semibold text-yellow-400">Esta acción no se puede deshacer.</span>
                </p>
                <div className="flex justify-center gap-4">
                    <button
                        onClick={() => setDeleteConfirmation(null)}
                        className="bg-gray-600 text-white font-semibold py-2 px-6 rounded-lg hover:bg-gray-700 transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleConfirmDelete}
                        className="bg-red-600 text-white font-semibold py-2 px-6 rounded-lg hover:bg-red-700 transition-colors"
                    >
                        Eliminar
                    </button>
                </div>
            </div>
        )}
      </Modal>

      {maximizedTask && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
            <div className="relative w-full max-w-3xl animate-scale-in">
                <TaskCard
                    key={maximizedTask.id}
                    task={maximizedTask}
                    onToggleDone={handleToggleDone}
                    onEdit={handleOpenEditModal}
                    onDeleteTask={handleRequestDelete}
                    onAddDate={handleOpenDatePickerModal}
                    generatingSubtasksFor={generatingSubtasksFor}
                    onGenerateSubtasks={handleGenerateAndAddSubtasks}
                    onAddManualSubtask={handleAddManualSubtask}
                    onToggleSubtask={handleToggleSubtask}
                    onRequestDeleteSubtask={handleRequestDelete}
                    onSearchForInfo={handleSearchForInfo}
                    onMaximize={setMaximizedTaskId}
                    onEditSubtask={handleEditSubtask}
                    onDragStart={() => {}}
                    onDragEnter={() => {}}
                    onDragEnd={() => {}}
                    onDrop={() => {}}
                    isDragging={false}
                    isDraggingOver={false}
                    onSmartAction={handleOpenSmartActionModal}
                    onSmartActionForSubtask={handleOpenSmartActionModalForSubtask}
                    isMaximized={true}
                />
                <button
                    onClick={() => setMaximizedTaskId(null)}
                    className="absolute top-0 right-0 mt-2 mr-2 md:-top-2 md:-right-2 bg-gray-700 rounded-full p-1.5 text-white hover:bg-gray-600 z-10"
                    aria-label="Cerrar vista maximizada"
                >
                    <XIcon className="w-5 h-5" />
                </button>
            </div>
        </div>
      )}
    </div>
  );
};

export default App;