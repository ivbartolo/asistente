export type NodeType = 'text' | 'voice' | 'image';
export type NodeStatus = 'draft' | 'scheduled' | 'done';

export interface CheckListItem {
    id: string;
    text: string;
    done: boolean;
}

export interface IdeaNode {
    id: string;
    x: number;
    y: number;
    title: string;
    summary: string;
    originalContext: string;
    category: string;
    cost: number;
    links: string[];
    images: string[];
    checklist: CheckListItem[];
    type: NodeType;
    status: NodeStatus;
    createdAt: number;
    isDimmed?: boolean; // Visual state, not necessarily persisted but useful to have in type
}

export interface Connection {
    id: string;
    sourceId: string;
    targetId: string;
}

export interface Viewport {
    x: number;
    y: number;
    scale: number;
}

export interface ChatMessage {
    role: 'user' | 'model';
    text: string;
}
