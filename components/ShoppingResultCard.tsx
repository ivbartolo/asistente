import React from 'react';
import { ShoppingItem } from '../types';

interface ShoppingResultCardProps {
  item: ShoppingItem;
  onAddToList: (description: string) => void;
}

const ShoppingResultCard: React.FC<ShoppingResultCardProps> = ({ item, onAddToList }) => {
  return (
    <div className="bg-gray-800/50 p-4 rounded-xl border border-gray-700/50 flex flex-col justify-between h-full">
      <div>
        <div className="flex justify-between items-start">
            <h4 className="font-bold text-lg text-cyan-200">{item.name}</h4>
            <span className="text-lg font-semibold text-white bg-gray-700 px-3 py-1 rounded-md ml-2">{item.price}</span>
        </div>
        <p className="text-gray-300 mt-2 text-sm">{item.summary}</p>
      </div>
      <div className="flex items-center gap-2 mt-4">
        <a 
          href={item.link} 
          target="_blank" 
          rel="noopener noreferrer"
          className="flex-1 text-center bg-cyan-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-cyan-700 transition-colors"
        >
          Ver Producto
        </a>
        <button 
          onClick={() => onAddToList(`Comprar ${item.name}`)}
          className="bg-gray-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-gray-700 transition-colors"
        >
          Añadir a la Lista
        </button>
      </div>
    </div>
  );
};

export default ShoppingResultCard;