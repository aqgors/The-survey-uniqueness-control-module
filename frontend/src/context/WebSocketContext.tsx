import React, { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import toast from 'react-hot-toast';
import { Message } from '../types'; // assuming this exists or define it inline

export interface ChatMessage {
  id: string;
  senderId: string;
  receiverId: string;
  content: string;
  type?: 'TEXT' | 'IMAGE' | 'STICKER' | 'SURVEY_LINK';
  metadata?: any;
  isRead: boolean;
  createdAt: string;
}

interface WebSocketContextType {
  isConnected: boolean;
  sendMessage: (to: string, text: string, msgType?: 'TEXT' | 'IMAGE' | 'STICKER' | 'SURVEY_LINK', metadata?: any) => void;
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  unreadCounts: Record<string, number>;
  markAsRead: (friendId: string) => void;
}

const WebSocketContext = createContext<WebSocketContextType | undefined>(undefined);

export function WebSocketProvider({ children }: { children: ReactNode }) {
  const [isConnected, setIsConnected] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('authToken');
    if (!token) return;

    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
    const wsUrl = apiUrl.replace('http', 'ws') + `/chat/ws?token=${token}`;

    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      setIsConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'chat' || data.type === 'chat_ack') {
          const newMsg = data.message as ChatMessage;
          setMessages((prev) => {
            // Prevent duplicates (especially for ack)
            if (prev.find((m) => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
          
          if (data.type === 'chat') {
            toast.success('Нове повідомлення від друга!');
            // Increment unread count for the sender
            setUnreadCounts(prev => ({
              ...prev,
              [newMsg.senderId]: (prev[newMsg.senderId] || 0) + 1
            }));
          }
        } else if (data.type === 'friend_update') {
          window.dispatchEvent(new Event('friend_update'));
        } else if (['MESSAGE_DELETED', 'MESSAGE_EDITED', 'CHAT_CLEARED'].includes(data.type)) {
          window.dispatchEvent(new CustomEvent('chat_refresh', { detail: data }));
        }
      } catch (err) {
        console.error('Failed to parse WS message', err);
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
    };

    wsRef.current = ws;

    return () => {
      ws.close();
    };
  }, []);

  const sendMessage = (to: string, text: string, msgType = 'TEXT', metadata: any = null) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'chat', to, text, msgType, metadata }));
    } else {
      toast.error('Немає з\'єднання з чатом');
    }
  };

  const markAsRead = (friendId: string) => {
    setUnreadCounts(prev => ({ ...prev, [friendId]: 0 }));
  };

  return (
    <WebSocketContext.Provider value={{ isConnected, sendMessage, messages, setMessages, unreadCounts, markAsRead }}>
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocket() {
  const context = useContext(WebSocketContext);
  if (context === undefined) {
    throw new Error('useWebSocket must be used within a WebSocketProvider');
  }
  return context;
}
