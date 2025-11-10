import { Category, Priority } from './types';

export const CATEGORY_COLORS: Record<Category, { bg: string; text: string; border: string }> = {
  [Category.Home]: { bg: 'bg-blue-900/50', text: 'text-blue-300', border: 'border-blue-500/50' },
  [Category.Work]: { bg: 'bg-purple-900/50', text: 'text-purple-300', border: 'border-purple-500/50' },
  [Category.Content]: { bg: 'bg-green-900/50', text: 'text-green-300', border: 'border-green-500/50' },
  [Category.Finance]: { bg: 'bg-yellow-900/50', text: 'text-yellow-300', border: 'border-yellow-500/50' },
  [Category.Personal]: { bg: 'bg-pink-900/50', text: 'text-pink-300', border: 'border-pink-500/50' },
  [Category.Social]: { bg: 'bg-teal-900/50', text: 'text-teal-300', border: 'border-teal-500/50' },
  [Category.Shopping]: { bg: 'bg-cyan-900/50', text: 'text-cyan-300', border: 'border-cyan-500/50' },
  [Category.Other]: { bg: 'bg-gray-700/50', text: 'text-gray-300', border: 'border-gray-500/50' },
};

export const PRIORITY_ORDER: Record<Priority, number> = {
  [Priority.Urgent]: 1,
  [Priority.Schedulable]: 2,
  [Priority.Reminder]: 3,
  [Priority.Idea]: 4,
};

export const PRIORITY_STYLES: Record<Priority, { label: string, color: string }> = {
    [Priority.Urgent]: { label: 'Urgente', color: 'bg-red-500' },
    [Priority.Schedulable]: { label: 'Programable', color: 'bg-orange-500' },
    [Priority.Reminder]: { label: 'Recordatorio', color: 'bg-yellow-500' },
    [Priority.Idea]: { label: 'Idea', color: 'bg-blue-500' }
};