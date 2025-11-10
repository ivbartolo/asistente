import React from 'react';
import { BellIcon, BellSlashIcon } from './Icons';

interface NotificationBellProps {
  permission: string;
  onPermissionChange: (newPermission: string) => void;
}

const NotificationBell: React.FC<NotificationBellProps> = ({ permission, onPermissionChange }) => {
  const requestPermission = async () => {
    if (!('Notification' in window)) {
      alert('Este navegador no soporta notificaciones de escritorio.');
      return;
    }
    const result = await Notification.requestPermission();
    onPermissionChange(result);
  };

  const getStatus = () => {
    switch (permission) {
      case 'granted':
        return {
          text: 'Notificaciones activadas',
          icon: <BellIcon className="w-5 h-5 text-green-400" />,
          disabled: true,
        };
      case 'denied':
        return {
          text: 'Notificaciones bloqueadas. Habilítalas en la configuración del navegador.',
          icon: <BellSlashIcon className="w-5 h-5 text-red-400" />,
          disabled: true,
        };
      default:
        return {
          text: 'Activar recordatorios',
          icon: <BellIcon className="w-5 h-5 text-gray-400" />,
          disabled: false,
        };
    }
  };

  const { text, icon, disabled } = getStatus();

  return (
    <button
      onClick={requestPermission}
      disabled={disabled}
      className="p-2 rounded-lg bg-gray-700 hover:bg-gray-600 disabled:hover:bg-gray-700 disabled:cursor-not-allowed transition-colors"
      title={text}
      aria-label={text}
    >
      {icon}
    </button>
  );
};

export default NotificationBell;