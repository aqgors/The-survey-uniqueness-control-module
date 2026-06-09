import React, { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { UserPlus, MessageCircle, FileText, Trash2, Send, Check, X, Search, Image as ImageIcon, Smile, Link as LinkIcon, Edit2, AlertCircle, ChevronRight, ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { friendsApi, chatApi } from '../../api/axios';
import { surveyApi } from '../../api/surveyApi';
import { useWebSocket, ChatMessage } from '../../context/WebSocketContext';
import { useAuth } from '../../context/AuthContext';

const API = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:3001';

export default function FriendsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'list' | 'chat' | 'surveys'>('list');
  const [friends, setFriends] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [friendIdInput, setFriendIdInput] = useState('');
  
  const { sendMessage, messages, setMessages, isConnected, unreadCounts, markAsRead } = useWebSocket();
  const [selectedFriend, setSelectedFriend] = useState<any | null>(null);
  const [chatInput, setChatInput] = useState('');
  const [chatSearch, setChatSearch] = useState('');
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showSurveyPicker, setShowSurveyPicker] = useState(false);
  const [mySurveys, setMySurveys] = useState<any[]>([]);
  const [editingMessage, setEditingMessage] = useState<ChatMessage | null>(null);
  
  // Surveys state
  const [surveys, setSurveys] = useState<any[]>([]);
  const [surveyFilterFriend, setSurveyFilterFriend] = useState<string>('all');

  const filteredSurveys = surveyFilterFriend === 'all'
    ? surveys
    : surveys.filter(s => s.authorId === surveyFilterFriend || s.createdById === surveyFilterFriend);

  useEffect(() => {
    fetchFriends();
    
    const handleFriendUpdate = () => {
      fetchFriends();
    };

    window.addEventListener('friend_update', handleFriendUpdate);
    return () => {
      window.removeEventListener('friend_update', handleFriendUpdate);
    };
  }, []);

  const fetchFriends = async () => {
    try {
      const res = await friendsApi.getFriends();
      setFriends(res.data.friends || []);
      setRequests(res.data.requests || []);
    } catch (err: any) {
      toast.error(err.response?.data?.error || t('friends.loadError'));
    }
  };

  const handleAddFriend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!friendIdInput.trim()) return;
    try {
      await friendsApi.addFriend(friendIdInput.trim());
      toast.success(t('friends.addedSuccess'));
      setFriendIdInput('');
      fetchFriends();
    } catch (err: any) {
      toast.error(err.response?.data?.error || t('friends.addError'));
    }
  };

  const handleRemoveFriend = async (id: string) => {
    if (!window.confirm(t('friends.removeConfirm'))) return;
    try {
      await friendsApi.removeFriend(id);
      toast.success(t('friends.removedSuccess'));
      if (selectedFriend?.id === id) setSelectedFriend(null);
      fetchFriends();
    } catch (err: any) {
      toast.error(t('friends.removeError'));
    }
  };

  const handleAcceptRequest = async (id: string) => {
    try {
      await friendsApi.acceptFriendRequest(id);
      toast.success('Запит прийнято!');
      fetchFriends();
    } catch (err) {
      toast.error('Помилка прийняття запиту');
    }
  };

  const handleRejectRequest = async (id: string) => {
    try {
      await friendsApi.rejectFriendRequest(id);
      toast.success('Запит відхилено');
      fetchFriends();
    } catch (err) {
      toast.error('Помилка відхилення запиту');
    }
  };

  const loadSurveys = async () => {
    try {
      const res = await friendsApi.getFriendsSurveys();
      setSurveys(res.data.surveys || []);
    } catch (err) {
      toast.error(t('friends.surveysLoadError'));
    }
  };

  const loadChatHistory = async (friendId: string) => {
    try {
      const res = await chatApi.getHistory(friendId);
      setChatHistory(res.data.messages || []);
    } catch (err) {
      toast.error(t('friends.chatLoadError'));
    }
  };

  useEffect(() => {
    if (activeTab === 'surveys') {
      loadSurveys();
    }
  }, [activeTab]);

  useEffect(() => {
    if (selectedFriend) {
      loadChatHistory(selectedFriend.id);
      markAsRead(selectedFriend.id);
    }
  }, [selectedFriend]);

  useEffect(() => {
    const handleChatRefresh = (e: any) => {
      const { type, data } = e.detail;
      if (type === 'MESSAGE_DELETED') {
        setChatHistory(prev => prev.filter(m => m.id !== data.messageId));
        setMessages(prev => prev.filter(m => m.id !== data.messageId));
      } else if (type === 'MESSAGE_EDITED') {
        setChatHistory(prev => prev.map(m => m.id === data.id ? data : m));
        setMessages(prev => prev.map(m => m.id === data.id ? data : m));
      } else if (type === 'CHAT_CLEARED') {
        if (selectedFriend?.id === data.fromUserId) {
          setChatHistory([]);
          setMessages([]);
        }
      }
    };
    window.addEventListener('chat_refresh', handleChatRefresh);
    return () => window.removeEventListener('chat_refresh', handleChatRefresh);
  }, [selectedFriend, setMessages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || !selectedFriend) return;

    if (editingMessage) {
      try {
        const res = await chatApi.editMessage(editingMessage.id, chatInput.trim());
        setChatInput('');
        setEditingMessage(null);
        toast.success('Повідомлення відредаговано');
        setChatHistory(prev => prev.map(m => m.id === editingMessage.id ? res.data : m));
        setMessages(prev => prev.map(m => m.id === editingMessage.id ? res.data : m));
      } catch (err) {
        toast.error('Помилка редагування повідомлення');
      }
      return;
    }

    sendMessage(selectedFriend.id, chatInput.trim());
    setChatInput('');
  };

  const handleClearChat = async () => {
    if (!selectedFriend || !window.confirm('Ви впевнені, що хочете очистити історію чату з цим другом?')) return;
    try {
      await chatApi.deleteHistory(selectedFriend.id);
      setChatHistory([]);
      setMessages(prev => prev.filter(m =>
        !(m.senderId === selectedFriend.id || m.receiverId === selectedFriend.id)
      ));
      toast.success('Історію чату очищено');
    } catch (err) {
      toast.error('Помилка очищення чату');
    }
  };

  const handleDeleteMessage = async (msgId: string) => {
    if (!window.confirm('Видалити повідомлення?')) return;
    try {
      await chatApi.deleteMessage(msgId);
      setChatHistory(prev => prev.filter(m => m.id !== msgId));
      setMessages(prev => prev.filter(m => m.id !== msgId));
      toast.success('Повідомлення видалено');
    } catch (err) {
      toast.error('Помилка видалення повідомлення');
    }
  };

  // Combine history + live messages for the selected friend
  const displayMessages = [...chatHistory, ...messages.filter(m => 
    (m.senderId === selectedFriend?.id && m.receiverId === user?.id) ||
    (m.senderId === user?.id && m.receiverId === selectedFriend?.id)
  )];
  
  // Deduplicate by ID just in case
  const uniqueMessages = Array.from(new Map(displayMessages.map(item => [item.id, item])).values());
  uniqueMessages.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  // Auto-scroll
  useEffect(() => {
    if (activeTab === 'chat' && selectedFriend) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [uniqueMessages, activeTab, selectedFriend]);

  // Filter messages by search term
  const filteredMessages = uniqueMessages.filter(msg => 
    !chatSearch.trim() || msg.content.toLowerCase().includes(chatSearch.toLowerCase())
  );

  const renderTextWithLinks = (text: string, isMe: boolean) => {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const parts = text.split(urlRegex);
    return parts.map((part, i) => {
      if (part.match(urlRegex)) {
        return (
          <a key={i} href={part} target="_blank" rel="noopener noreferrer" className={`underline ${isMe ? 'text-blue-200 hover:text-blue-100' : 'text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300'}`}>
            {part}
          </a>
        );
      }
      return part;
    });
  };

  const emojis = ['👍', '❤️', '😂', '🔥', '🎉', '😢', '👏', '🤔', '👀', '✨'];
  
  const handleEmojiClick = (emoji: string) => {
    if (selectedFriend) {
      sendMessage(selectedFriend.id, emoji, 'STICKER', { sticker: emoji });
      setShowEmojiPicker(false);
    }
  };

  const handleSurveyPickerOpen = async () => {
    try {
      const allSurvs = await surveyApi.getAll();
      const mySurvs = allSurvs.filter(s => s.createdById === user?.id);
      setMySurveys(mySurvs || []);
      setShowSurveyPicker(true);
    } catch (err) {
      toast.error('Не вдалося завантажити опитування');
    }
  };

  const handleSendSurveyLink = (surveyId: string, title: string) => {
    if (selectedFriend) {
      sendMessage(selectedFriend.id, `Запрошую пройти опитування: ${title}`, 'SURVEY_LINK', { surveyId });
      setShowSurveyPicker(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-4 animate-in fade-in">
      <div className="flex flex-col lg:flex-row items-center justify-between mb-8 gap-4">
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-800 dark:text-slate-100 tracking-tight flex items-center gap-3 w-full lg:w-auto">
          <UserPlus className="w-6 h-6 sm:w-8 sm:h-8 text-blue-500 shrink-0" />
          {t('friends.pageTitle')}
        </h1>
        <div className="w-full lg:w-auto p-1 bg-slate-100 dark:bg-slate-800 rounded-xl flex shadow-sm overflow-x-auto scrollbar-none snap-x snap-mandatory">
          <button
            onClick={() => setActiveTab('list')}
            className={`whitespace-nowrap flex-1 snap-start px-3 sm:px-6 py-2.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'list' ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            {t('friends.tabMyFriends')}
          </button>
          <button
            onClick={() => {
              setActiveTab('chat');
              if (selectedFriend) markAsRead(selectedFriend.id);
            }}
            className={`whitespace-nowrap flex-1 snap-start px-3 sm:px-6 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${
              activeTab === 'chat' ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            {t('friends.tabChat')}
            <span className={`shrink-0 w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></span>
            {Object.values(unreadCounts).some(c => c > 0) && (
               <span className="shrink-0 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center font-bold">
                 {Object.values(unreadCounts).reduce((a, b) => a + b, 0)}
               </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('surveys')}
            className={`whitespace-nowrap flex-1 snap-start px-3 sm:px-6 py-2.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'surveys' ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            {t('friends.tabSurveys')}
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800/60 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden min-h-[600px] flex">
        {/* LIST TAB */}
        {activeTab === 'list' && (
          <div className="p-4 sm:p-8 w-full">
            <div className="max-w-md mb-8">
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">{t('friends.addByIdLabel')}</label>
              <form onSubmit={handleAddFriend} className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={friendIdInput}
                  onChange={e => setFriendIdInput(e.target.value)}
                  placeholder={t('friends.addByIdPlaceholder')}
                  className="flex-1 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-4 py-2.5 focus:border-blue-500 focus:ring-blue-500"
                />
                <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-medium transition-colors w-full sm:w-auto">
                  {t('friends.addBtn')}
                </button>
              </form>
            </div>

            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-4">{t('friends.friendsListTitle', { count: friends.length })}</h2>
            {friends.length === 0 && requests.length === 0 ? (
              <div className="text-slate-500 dark:text-slate-400 py-12 text-center border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl">
                {t('friends.noFriends')}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {requests.map(req => (
                  <div key={req.id} className="flex items-center justify-between p-4 border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-900/30 rounded-xl hover:shadow-sm transition-shadow">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-blue-200 dark:bg-blue-800 text-blue-700 dark:text-blue-300 flex items-center justify-center font-bold text-lg">
                        {req.name?.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="font-semibold text-slate-800 dark:text-slate-100">{req.name}</div>
                        <div className="text-xs text-blue-600 dark:text-blue-400">Хоче додати вас у друзі</div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => handleAcceptRequest(req.id)} className="p-2 text-green-600 bg-green-100 hover:bg-green-200 dark:bg-green-900/40 dark:hover:bg-green-800/60 rounded-lg transition-colors">
                        <Check className="w-5 h-5" />
                      </button>
                      <button onClick={() => handleRejectRequest(req.id)} className="p-2 text-red-600 bg-red-100 hover:bg-red-200 dark:bg-red-900/40 dark:hover:bg-red-800/60 rounded-lg transition-colors">
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                ))}

                {friends.map(friend => (
                  <div key={friend.id} className="flex items-center justify-between p-4 border border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 rounded-xl hover:shadow-sm transition-shadow">
                    <div className="flex items-center gap-4">
                      {friend.avatarUrl ? (
                        <img src={`${API}${friend.avatarUrl}`} alt="avatar" className="w-12 h-12 rounded-full object-cover shadow-sm border border-slate-200 dark:border-slate-700" />
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold text-lg">
                          {friend.name?.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <div className="font-semibold text-slate-800 dark:text-slate-100">{friend.name}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 font-mono">{friend.id}</div>
                      </div>
                    </div>
                    <button
                      onClick={() => handleRemoveFriend(friend.id)}
                      className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                      title={t('friends.removeBtn')}
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* CHAT TAB */}
        {activeTab === 'chat' && (
          <div className="flex w-full h-[600px] sm:h-[600px] md:h-[700px] relative">
            <div className={`w-full md:w-1/3 border-r border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 overflow-y-auto scrollbar-none ${selectedFriend ? 'hidden md:block' : 'block'}`}>
              <div className="p-4 border-b border-slate-200 dark:border-slate-700 font-semibold text-slate-800 dark:text-slate-200">
                {t('friends.chatContacts')}
              </div>
              {friends.length === 0 && <div className="p-4 text-sm text-slate-500 dark:text-slate-400">{t('friends.noFriendsChat')}</div>}
              {friends.map(friend => {
                const unread = unreadCounts[friend.id] || 0;
                return (
                  <button
                    key={friend.id}
                    onClick={() => {
                      setSelectedFriend(friend);
                      markAsRead(friend.id);
                    }}
                    className={`w-full flex items-center gap-3 p-4 text-left transition-colors ${
                      selectedFriend?.id === friend.id ? 'bg-blue-50 dark:bg-slate-700 border-r-4 border-blue-500' : 'hover:bg-slate-100 dark:hover:bg-slate-700 border-r-4 border-transparent'
                    }`}
                  >
                    {friend.avatarUrl ? (
                      <img src={`${API}${friend.avatarUrl}`} alt="avatar" className="w-10 h-10 rounded-full object-cover shadow-sm border border-slate-200 dark:border-slate-700" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold">
                        {friend.name?.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="flex-1 font-medium text-slate-800 dark:text-slate-200 truncate">{friend.name}</div>
                    {unread > 0 && selectedFriend?.id !== friend.id && (
                       <div className="w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center text-xs font-bold">
                         {unread}
                       </div>
                    )}
                  </button>
                );
              })}
            </div>
            
            <div className={`w-full md:w-2/3 flex flex-col bg-white dark:bg-slate-800/40 ${!selectedFriend ? 'hidden md:flex' : 'flex'}`}>
              {selectedFriend ? (
                <>
                  <div className="p-3 sm:p-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                    <div className="flex items-center gap-2 sm:gap-3 font-semibold text-slate-800 dark:text-slate-200 truncate">
                      <button className="md:hidden p-1 mr-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg shrink-0" onClick={() => setSelectedFriend(null)}>
                        <ArrowLeft className="w-5 h-5" />
                      </button>
                      {selectedFriend.avatarUrl ? (
                        <img src={`${API}${selectedFriend.avatarUrl}`} alt="avatar" className="w-8 h-8 rounded-full object-cover shadow-sm border border-slate-200 dark:border-slate-700 shrink-0" />
                      ) : (
                        <MessageCircle className="w-5 h-5 text-blue-500 shrink-0" />
                      )}
                      <span className="truncate">{selectedFriend.name}</span>
                    </div>
                    <div className="flex items-center gap-1 sm:gap-3 shrink-0">
                      <div className="relative hidden sm:block">
                        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          placeholder="Пошук..."
                          value={chatSearch}
                          onChange={e => setChatSearch(e.target.value)}
                          className="pl-9 pr-4 py-1.5 w-32 sm:w-auto bg-slate-100 dark:bg-slate-700 border-none rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none text-slate-800 dark:text-slate-200"
                        />
                      </div>
                      <button onClick={handleClearChat} className="p-2 sm:p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors shrink-0" title="Очистити історію чату">
                        <Trash2 className="w-5 h-5 sm:w-4 sm:h-4" />
                      </button>
                    </div>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3 scrollbar-none">
                    {filteredMessages.length === 0 && (
                      <div className="text-center text-slate-400 mt-10 text-sm">
                        {chatSearch ? 'Нічого не знайдено' : t('friends.chatEmpty')}
                      </div>
                    )}
                    {filteredMessages.map((msg, i) => {
                      const isMe = msg.senderId === user?.id;
                      return (
                        <div key={msg.id || i} className={`flex ${isMe ? 'justify-end' : 'justify-start'} group`}>
                          {isMe && msg.type === 'TEXT' && (
                            <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 pr-2 transition-opacity shrink-0">
                              <button onClick={() => { setEditingMessage(msg); setChatInput(msg.content); }} className="p-1.5 text-slate-400 hover:text-blue-500 rounded-lg hover:bg-blue-50 dark:hover:bg-slate-700 transition-colors" title="Редагувати">
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => handleDeleteMessage(msg.id)} className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors" title="Видалити">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                          <div className={`max-w-[85%] sm:max-w-[70%] rounded-2xl px-3 sm:px-4 py-2 ${
                            msg.type === 'STICKER' ? 'bg-transparent text-5xl sm:text-6xl' :
                            isMe ? 'bg-blue-600 text-white rounded-br-sm' : 'bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-bl-sm'
                          }`}>
                            {msg.type === 'TEXT' && <div className="text-sm break-words whitespace-pre-wrap">{renderTextWithLinks(msg.content, isMe)}</div>}
                            {msg.type === 'STICKER' && <div>{msg.metadata?.sticker}</div>}
                            {msg.type === 'SURVEY_LINK' && (
                              <div className="flex flex-col gap-2 bg-blue-700/20 dark:bg-blue-900/40 p-3 rounded-xl border border-blue-300 dark:border-blue-700">
                                <FileText className="w-6 h-6 text-blue-200 dark:text-blue-300" />
                                <span className="text-sm font-semibold">{msg.content}</span>
                                <a href={`/survey/${msg.metadata?.surveyId}`} className="text-xs underline text-blue-100 dark:text-blue-200">Перейти до опитування</a>
                              </div>
                            )}
                            
                            <div className={`text-[10px] mt-1 flex items-center gap-1 justify-end ${isMe && msg.type !== 'STICKER' ? 'text-blue-200' : 'text-slate-400 dark:text-slate-300'}`}>
                              {new Date(msg.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={messagesEndRef} />
                  </div>

                  <div className="relative p-3 sm:p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80">
                    {/* Editing banner */}
                    {editingMessage && (
                      <div className="flex items-center justify-between mb-2 px-2 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700">
                        <span className="text-xs text-amber-700 dark:text-amber-300 font-medium">✏️ Редагування повідомлення</span>
                        <button type="button" onClick={() => { setEditingMessage(null); setChatInput(''); }} className="text-amber-500 hover:text-amber-700 p-0.5">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    )}

                    {/* Emoji Picker Popover */}
                    {showEmojiPicker && (
                      <div className="absolute bottom-[70px] left-3 sm:left-4 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 shadow-xl rounded-2xl p-3 grid grid-cols-5 gap-2 z-20">
                        {emojis.map(e => (
                          <button key={e} type="button" onClick={() => handleEmojiClick(e)} className="text-2xl hover:bg-slate-100 dark:hover:bg-slate-600 rounded-lg p-1.5 transition-colors">
                            {e}
                          </button>
                        ))}
                      </div>
                    )}
                    
                    {/* Survey Picker Popover */}
                    {showSurveyPicker && (
                      <div className="absolute bottom-[70px] left-3 sm:left-4 w-[calc(100%-1.5rem)] sm:w-72 max-h-60 overflow-y-auto bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 shadow-xl rounded-2xl p-2 z-20 scrollbar-none">
                        <div className="font-semibold text-sm mb-2 px-2 pb-2 border-b border-slate-100 dark:border-slate-600 text-slate-800 dark:text-slate-200">
                          Мої опитування
                        </div>
                        {mySurveys.length === 0 && <div className="text-xs px-2 text-slate-500">Немає опитувань</div>}
                        {mySurveys.map(s => (
                          <button key={s.id} type="button" onClick={() => handleSendSurveyLink(s.id, s.title)} className="w-full text-left text-sm px-3 py-2.5 hover:bg-slate-100 dark:hover:bg-slate-600 rounded-xl transition-colors truncate text-slate-700 dark:text-slate-200">
                            {s.title}
                          </button>
                        ))}
                      </div>
                    )}

                    <form onSubmit={handleSendMessage} className="flex gap-1.5 sm:gap-2 items-center">
                      <div className="flex gap-0.5 sm:gap-1 shrink-0">
                        <button type="button" onClick={() => {setShowEmojiPicker(!showEmojiPicker); setShowSurveyPicker(false)}} className={`p-2 text-slate-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-slate-700 rounded-full transition-colors ${showEmojiPicker ? 'text-blue-500 bg-blue-50 dark:bg-slate-700' : ''}`} title="Надіслати стікер">
                          <Smile className="w-5 h-5" />
                        </button>
                        <button type="button" onClick={() => {
                          if (!showSurveyPicker) handleSurveyPickerOpen();
                          else setShowSurveyPicker(false);
                          setShowEmojiPicker(false);
                        }} className={`p-2 text-slate-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-slate-700 rounded-full transition-colors ${showSurveyPicker ? 'text-blue-500 bg-blue-50 dark:bg-slate-700' : ''}`} title="Поділитися опитуванням">
                          <LinkIcon className="w-5 h-5" />
                        </button>
                      </div>
                      <input
                        type="text"
                        value={chatInput}
                        onChange={e => setChatInput(e.target.value)}
                        onFocus={() => { setShowEmojiPicker(false); setShowSurveyPicker(false); }}
                        placeholder={editingMessage ? 'Редагувати...' : t('friends.chatPlaceholder')}
                        className={`flex-1 min-w-0 rounded-full border bg-white dark:bg-slate-700 px-3 sm:px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-slate-100 ${
                          editingMessage ? 'border-amber-400 dark:border-amber-500' : 'border-slate-300 dark:border-slate-600'
                        }`}
                      />
                      <button 
                        type="submit" 
                        disabled={!chatInput.trim()}
                        className={`shrink-0 ${editingMessage ? 'bg-amber-500 hover:bg-amber-600' : 'bg-blue-600 hover:bg-blue-700'} disabled:bg-slate-300 dark:disabled:bg-slate-700 disabled:cursor-not-allowed text-white p-2 w-10 h-10 rounded-full flex items-center justify-center transition-colors shadow-sm`}
                      >
                        <Send className="w-4 h-4 ml-0.5" />
                      </button>
                    </form>
                  </div>
                </>
              ) : (
                <div className="hidden md:flex flex-1 flex-col items-center justify-center text-slate-400 dark:text-slate-500">
                  <MessageCircle className="w-16 h-16 mb-4 opacity-20" />
                  <p className="text-sm">{t('friends.selectFriend')}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* SURVEYS TAB */}
        {activeTab === 'surveys' && (
          <div className="p-4 sm:p-8 w-full flex flex-col h-[600px]">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
              <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <FileText className="w-6 h-6 text-blue-500 shrink-0" />
                {t('friends.surveysTitle')}
              </h2>
              {friends.length > 0 && (
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <span className="text-sm text-slate-600 dark:text-slate-400 whitespace-nowrap">Від кого:</span>
                  <select
                    value={surveyFilterFriend}
                    onChange={e => setSurveyFilterFriend(e.target.value)}
                    className="bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-800 dark:text-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 flex-1 sm:flex-none"
                  >
                    <option value="all">Усі друзі</option>
                    {friends.map((friend: any) => (
                      <option key={friend.id} value={friend.id}>{friend.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            {filteredSurveys.length === 0 ? (
              <div className="text-slate-500 dark:text-slate-400 py-12 text-center border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl">
                {t('friends.noSurveys')}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 overflow-y-auto pb-4 pr-2 scrollbar-none">
                 {filteredSurveys.map(s => {
                   const closed = s.isActive === false || (s.deadline && new Date(s.deadline) < new Date());
                   const statusLabel = closed
                     ? t('home.surveyDone')
                     : s.deadline
                       ? `${t('home.activeTill')} ${new Date(s.deadline).toLocaleString()}`
                       : t('home.active');

                   return (
                     <Link
                       key={s.id}
                       to={closed ? `/results/${s.id}` : `/survey/${s.id}`}
                       className={`card group flex flex-col h-full hover:-translate-y-1 ${closed ? 'opacity-75 grayscale-[0.5]' : ''}`}
                     >
                       {s.imageUrl ? (
                         <div className="aspect-video w-full relative overflow-hidden bg-slate-100 dark:bg-slate-800 border-b border-borderLight rounded-t-xl">
                           <img src={s.imageUrl} alt={s.title} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                           <div className="absolute top-2 right-2 flex flex-col gap-1 items-end">
                             <span className={`px-2 py-1 text-xs font-bold uppercase rounded-md shadow-sm ${closed ? 'bg-slate-800 text-white' : 'bg-green-500 text-white'}`}>
                               {statusLabel}
                             </span>
                           </div>
                         </div>
                       ) : (
                         <div className="h-2 w-full relative bg-gradient-to-r from-blue-500 to-blue-400 rounded-t-xl">
                           <div className="absolute top-4 right-4 z-10 flex flex-col gap-1 items-end">
                             <span className={`px-2 py-1 text-xs font-bold uppercase rounded-md shadow-sm ${closed ? 'bg-slate-800 text-white' : 'bg-green-500 text-white'}`}>
                               {statusLabel}
                             </span>
                           </div>
                         </div>
                       )}

                       <div className={`p-5 flex flex-col flex-1 border border-t-0 border-slate-200 dark:border-slate-700 rounded-b-xl bg-white dark:bg-slate-800/80 ${!s.imageUrl ? 'pt-10' : ''}`}>
                         <h3 className="font-semibold text-lg text-blue-600 line-clamp-2 mb-2 group-hover:text-blue-500 transition-colors break-words">
                           {s.title}
                         </h3>
                         {s.description && (
                           <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-3 mb-4 flex-1 break-words">{s.description}</p>
                         )}
                         
                         <div className="mt-auto pt-4 flex flex-col gap-3 border-t border-slate-200/50 dark:border-slate-700/50">
                           {s.authorName && (
                             <div className="flex items-center gap-2">
                               {s.authorAvatar ? (
                                 <img src={`${API}${s.authorAvatar}`} alt={s.authorName} className="w-6 h-6 rounded-full object-cover shadow-sm border border-slate-200 dark:border-slate-700" />
                               ) : (
                                 <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold shadow-sm border border-blue-200">
                                   {s.authorName.charAt(0).toUpperCase()}
                                 </div>
                               )}
                               <span className="text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded-full">{s.authorName}</span>
                             </div>
                           )}
                           <div className="flex items-center justify-between text-sm text-slate-500">
                             <div className="flex gap-3">
                               <span>{s._count?.questions || 0} {t('home.questions')}</span>
                               <span>&bull;</span>
                               <span>{s._count?.votes || 0} {t('home.votes')}</span>
                             </div>
                             <ChevronRight size={16} className="text-blue-500 opacity-0 -translate-x-2 transition-all duration-300 group-hover:opacity-100 group-hover:translate-x-0" />
                           </div>
                         </div>
                       </div>
                     </Link>
                   );
                 })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
