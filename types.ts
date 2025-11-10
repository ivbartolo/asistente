export enum Category {
  Home = 'Hogar',
  Work = 'Trabajo',
  Content = 'Contenido',
  Finance = 'Finanzas',
  Personal = 'Personal',
  Social = 'Social',
  Shopping = 'Compras',
  Other = 'Otro',
}

export enum Priority {
  Urgent = 'urgente',
  Schedulable = 'programable',
  Reminder = 'recordatorio',
  Idea = 'idea',
}

export interface Subtask {
  id: string;
  description: string;
  isDone: boolean;
  subtasks?: Subtask[];
}

export interface Attachment {
  id: string;
  name: string;
  type: string; // MIME type
  data: string; // base64 data URL
}

export interface Task {
  id: string;
  description: string;
  category: Category;
  priority: Priority;
  isDone: boolean;
  subtasks?: Subtask[];
  dueDate?: string; // YYYY-MM-DD format
  notes?: string;
  attachments?: Attachment[];
}

export interface GroundedAnswer {
  text: string;
  sources: { title: string; uri: string }[];
}

export interface ShoppingItem {
  name: string;
  summary: string;
  price: string;
  link: string;
}

export interface ProactiveSuggestion {
    title: string;
    description: string;
}

export type ChatHistoryItem = 
  | { type: 'task'; data: Task }
  | { type: 'groundedAnswer'; data: GroundedAnswer }
  | { type: 'shopping'; data: ShoppingItem[]; originalQuery: string }
  | { type: 'deepPlan'; data: string; originalQuery: string }
  | { type: 'aiQuestion'; text: string }
  | { type: 'userResponse'; text: string }
  | { type: 'subtaskSuggestion'; suggestions: string[]; parentTaskDescription: string; parentTaskId: string; };