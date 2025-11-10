import React from 'react';
import { GroundedAnswer } from '../types';
import { SparklesIcon } from './Icons';

interface ChatResponseCardProps {
    answer: GroundedAnswer;
}

const getReadableSourceLabel = (source: GroundedAnswer['sources'][number]) => {
    if (source.title && source.title.trim().length > 0) {
        return source.title.trim();
    }
    if (!source.uri) {
        return 'Fuente sin título';
    }
    try {
        const parsed = new URL(source.uri);
        return parsed.hostname.replace(/^www\./, '');
    } catch {
        return source.uri;
    }
};

const isSafeHttpUrl = (uri?: string) => {
    if (!uri) return false;
    try {
        const parsed = new URL(uri);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
        return false;
    }
};

const ChatResponseCard: React.FC<ChatResponseCardProps> = ({ answer }) => {
    return (
        <div className="bg-gray-800/50 p-4 rounded-xl border border-gray-700/50">
            <div className="flex items-center gap-2 text-gray-300 mb-3">
                <SparklesIcon className="w-5 h-5 text-purple-400" />
                <h3 className="font-semibold">Asistente IA</h3>
            </div>
            <p className="text-gray-200 whitespace-pre-wrap">{answer.text}</p>
            {answer.sources && answer.sources.length > 0 && (
                <div className="mt-4 pt-3 border-t border-gray-700">
                    <h4 className="text-xs font-semibold text-gray-400 mb-2">Fuentes:</h4>
                    <ul className="flex flex-wrap gap-2">
                        {answer.sources.map((source, index) => (
                            <li key={index}>
                                {isSafeHttpUrl(source.uri) ? (
                                    <a
                                        href={source.uri}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-xs bg-gray-700 text-blue-300 px-2 py-1 rounded-md hover:bg-gray-600 transition-colors truncate block"
                                        style={{ maxWidth: '200px' }}
                                    >
                                        {getReadableSourceLabel(source)}
                                    </a>
                                ) : (
                                    <span className="text-xs bg-gray-700 text-gray-200 px-2 py-1 rounded-md truncate block" style={{ maxWidth: '200px' }}>
                                        {getReadableSourceLabel(source)}
                                    </span>
                                )}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
};

export default ChatResponseCard;