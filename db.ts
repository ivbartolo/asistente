import Dexie, { Table } from 'dexie';
import { IdeaNode, Connection, Viewport } from './types';

class IdeaverseDatabase extends Dexie {
    nodes!: Table<IdeaNode>;
    connections!: Table<Connection>;
    metadata!: Table<{ key: string; value: any }>;

    constructor() {
        super('IdeaverseDB');
        this.version(1).stores({
            nodes: 'id, title, category, status, createdAt',
            connections: 'id, sourceId, targetId',
            metadata: 'key' // Para guardar viewport, selectedNodeId, etc.
        });
    }
}

export const db = new IdeaverseDatabase();

export const saveViewport = async (viewport: Viewport) => {
    await db.metadata.put({ key: 'viewport', value: viewport });
};

export const saveSelectedNode = async (nodeId: string | null) => {
    await db.metadata.put({ key: 'selectedNodeId', value: nodeId });
};

export const getMetadata = async () => {
    const v = await db.metadata.get('viewport');
    const s = await db.metadata.get('selectedNodeId');
    return {
        viewport: v?.value as Viewport | undefined,
        selectedNodeId: s?.value as string | null | undefined
    };
};
