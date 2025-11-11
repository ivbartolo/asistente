import { supabase } from './supabaseClient';
import { Task, Subtask, Attachment, Priority, Category } from '../types';

type TaskRow = {
  id: string;
  description: string;
  category: string;
  priority: string;
  is_done: boolean;
  due_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type SubtaskRow = {
  id: string;
  task_id: string;
  parent_subtask_id: string | null;
  description: string;
  is_done: boolean;
  order_index: number | null;
  created_at: string;
  updated_at: string;
};

type AttachmentRow = {
  id: string;
  task_id: string;
  file_name: string;
  mime_type: string;
  data_base64: string;
  created_at: string;
};

const toTask = (
  row: TaskRow,
  subtasks: Subtask[] | undefined,
  attachments: Attachment[] | undefined
): Task => ({
  id: row.id,
  description: row.description,
  category: row.category as Category,
  priority: row.priority as Priority,
  isDone: row.is_done,
  dueDate: row.due_date ?? undefined,
  notes: row.notes ?? undefined,
  subtasks,
  attachments,
});

const toAttachment = (row: AttachmentRow): Attachment => ({
  id: row.id,
  name: row.file_name,
  type: row.mime_type,
  data: row.data_base64,
});

const buildSubtaskTree = (rows: SubtaskRow[]): Map<string, Subtask[]> => {
  const nodes = new Map<string, Subtask & { subtasks?: Subtask[] }>();
  const rootsByTask = new Map<string, Subtask[]>();

  rows.forEach(row => {
    nodes.set(row.id, {
      id: row.id,
      description: row.description,
      isDone: row.is_done,
    });
  });

  rows.forEach(row => {
    const node = nodes.get(row.id)!;
    if (row.parent_subtask_id) {
      const parent = nodes.get(row.parent_subtask_id);
      if (!parent) return;
      if (!parent.subtasks) parent.subtasks = [];
      parent.subtasks.push(node);
    } else {
      const list = rootsByTask.get(row.task_id) ?? [];
      list.push(node);
      rootsByTask.set(row.task_id, list);
    }
  });

  const prune = (subtask?: Subtask & { subtasks?: Subtask[] }) => {
    if (!subtask || !subtask.subtasks) return;
    subtask.subtasks.forEach(child => prune(child as Subtask & { subtasks?: Subtask[] }));
    if (subtask.subtasks.length === 0) {
      delete subtask.subtasks;
    }
  };

  rootsByTask.forEach(list => {
    list.forEach(subtask => prune(subtask as Subtask & { subtasks?: Subtask[] }));
  });

  return rootsByTask;
};

const replaceAttachments = async (taskId: string, attachments?: Attachment[]) => {
  const { error: deleteError } = await supabase.from<AttachmentRow>('attachments').delete().eq('task_id', taskId);
  if (deleteError) throw deleteError;

  if (!attachments || attachments.length === 0) return;

  const payload = attachments.map(att => ({
    task_id: taskId,
    file_name: att.name,
    mime_type: att.type,
    data_base64: att.data,
  }));

  const { error } = await supabase.from('attachments').insert(payload);
  if (error) throw error;
};

const insertSubtaskTree = async (
  taskId: string,
  subtasks: Subtask[],
  parentSubtaskId: string | null = null
) => {
  for (const subtask of subtasks) {
    const { data, error } = await supabase
      .from('subtasks')
      .insert({
        task_id: taskId,
        parent_subtask_id: parentSubtaskId,
        description: subtask.description,
        is_done: subtask.isDone,
      })
      .select('id')
      .single();

    if (error) throw error;

    if (subtask.subtasks && subtask.subtasks.length > 0) {
      await insertSubtaskTree(taskId, subtask.subtasks, data.id);
    }
  }
};

const syncTaskDoneStatus = async (taskId: string) => {
  const { data, error } = await supabase
    .from<Pick<SubtaskRow, 'is_done'>>('subtasks')
    .select('is_done')
    .eq('task_id', taskId);

  if (error) throw error;

  if (!data || data.length === 0) {
    return;
  }

  const allDone = data.every(row => row.is_done);
  const { error: updateError } = await supabase
    .from('tasks')
    .update({ is_done: allDone })
    .eq('id', taskId);

  if (updateError) throw updateError;
};

export const taskRepository = {
  async fetchTasks(): Promise<Task[]> {
    const { data: taskRows, error: taskError } = await supabase
      .from<TaskRow>('tasks')
      .select('*')
      .order('created_at', { ascending: true });

    if (taskError) throw taskError;

    const { data: subtaskRows, error: subtaskError } = await supabase
      .from<SubtaskRow>('subtasks')
      .select('*')
      .order('order_index', { ascending: true, nullsFirst: true })
      .order('created_at', { ascending: true });

    if (subtaskError) throw subtaskError;

    const { data: attachmentRows, error: attachmentError } = await supabase
      .from<AttachmentRow>('attachments')
      .select('*');

    if (attachmentError) throw attachmentError;

    const subtasksByTask = buildSubtaskTree(subtaskRows ?? []);
    const attachmentsByTask = new Map<string, Attachment[]>();

    (attachmentRows ?? []).forEach(row => {
      const list = attachmentsByTask.get(row.task_id) ?? [];
      list.push(toAttachment(row));
      attachmentsByTask.set(row.task_id, list);
    });

    return (taskRows ?? []).map(row =>
      toTask(row, subtasksByTask.get(row.id), attachmentsByTask.get(row.id))
    );
  },

  async seedInitialTasks(tasks: Task[]) {
    for (const task of tasks) {
      const { data, error } = await supabase
        .from<TaskRow>('tasks')
        .insert({
          description: task.description,
          category: task.category,
          priority: task.priority,
          is_done: task.isDone,
          due_date: task.dueDate ?? null,
          notes: task.notes ?? null,
        })
        .select('id')
        .single();

      if (error || !data) throw error ?? new Error('No se pudo insertar la tarea inicial.');

      if (task.subtasks && task.subtasks.length > 0) {
        await insertSubtaskTree(data.id, task.subtasks);
      }

      if (task.attachments && task.attachments.length > 0) {
        await replaceAttachments(data.id, task.attachments);
      }
    }
  },

  async createTask(task: Omit<Task, 'id' | 'isDone'>): Promise<Task> {
    const { data, error } = await supabase
      .from<TaskRow>('tasks')
      .insert({
        description: task.description,
        category: task.category,
        priority: task.priority,
        due_date: task.dueDate ?? null,
        is_done: false,
        notes: task.notes ?? null,
      })
      .select('*')
      .single();

    if (error || !data) throw error ?? new Error('No se pudo crear la tarea.');

    if (task.attachments && task.attachments.length > 0) {
      await replaceAttachments(data.id, task.attachments);
    }

    if (task.subtasks && task.subtasks.length > 0) {
      await insertSubtaskTree(data.id, task.subtasks);
    }

    return toTask(data, task.subtasks, task.attachments);
  },

  async updateTask(task: Task) {
    const { error } = await supabase
      .from('tasks')
      .update({
        description: task.description,
        category: task.category,
        priority: task.priority,
        due_date: task.dueDate ?? null,
        is_done: task.isDone,
        notes: task.notes ?? null,
      })
      .eq('id', task.id);

    if (error) throw error;

    await replaceAttachments(task.id, task.attachments);
  },

  async deleteTask(taskId: string) {
    const { error } = await supabase.from('tasks').delete().eq('id', taskId);
    if (error) throw error;
  },

  async addSubtask(taskId: string, parentSubtaskId: string | null, description: string) {
    const { error } = await supabase
      .from('subtasks')
      .insert({
        task_id: taskId,
        parent_subtask_id: parentSubtaskId,
        description,
        is_done: false,
      });

    if (error) throw error;

    const { error: updateError } = await supabase
      .from('tasks')
      .update({ is_done: false })
      .eq('id', taskId);

    if (updateError) throw updateError;
  },

  async addSubtasks(taskId: string, parentSubtaskId: string | null, descriptions: string[]) {
    for (const description of descriptions) {
      await this.addSubtask(taskId, parentSubtaskId, description);
    }
  },

  async updateSubtask(subtaskId: string, description: string) {
    const { error } = await supabase
      .from('subtasks')
      .update({ description })
      .eq('id', subtaskId);

    if (error) throw error;
  },

  async toggleSubtask(taskId: string, subtaskId: string, isDone: boolean) {
    const { error } = await supabase
      .from('subtasks')
      .update({ is_done: isDone })
      .eq('id', subtaskId);

    if (error) throw error;

    await syncTaskDoneStatus(taskId);
  },

  async deleteSubtask(taskId: string, subtaskId: string) {
    const { error } = await supabase.from('subtasks').delete().eq('id', subtaskId);
    if (error) throw error;

    await syncTaskDoneStatus(taskId);
  },

  async setTaskDone(taskId: string, isDone: boolean) {
    const { error } = await supabase
      .from('tasks')
      .update({ is_done: isDone })
      .eq('id', taskId);

    if (error) throw error;
  },

  async setAllSubtasksDone(taskId: string, isDone: boolean) {
    const { error } = await supabase
      .from('subtasks')
      .update({ is_done: isDone })
      .eq('task_id', taskId);

    if (error) throw error;
  },

  async setTaskDueDate(taskId: string, dueDate: string | null) {
    const { error } = await supabase
      .from('tasks')
      .update({ due_date: dueDate })
      .eq('id', taskId);

    if (error) throw error;
  },
};


