import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Upload, Users, Send, FileText, Wifi, Loader2, Download, Copy, X, CheckCircle, ShieldAlert, WifiOff, MessageSquare } from 'lucide-react'; 
import { Toaster, toast } from 'sonner';
import { Button } from './components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card';
import { Textarea } from './components/ui/textarea';
import { Badge } from './components/ui/badge';
import { Progress } from './components/ui/progress';
import { Input } from './components/ui/input';
import './App.css';

const sizeErrorMessages = [
    "This file is too heavy for even the Hulk!",
    "S.H.I.E.L.D. protocols limit transfers to 100MB.",
    "My Pym Particle supply is low. Can't handle files over 100MB.",
    "Even Mjolnir isn't this heavy. Please keep files under 100MB.",
    "JARVIS reports this file's data signature is too large. Keep it under 100MB.",
    "Perfectly balanced... this file is not. Must be under 100MB to maintain cosmic order.",
    "Language! That's a big file. The limit here is 100MB, soldier.",
    "Are you trying to send a whole moon? This system can't handle more than 100MB!",
    "With great file size comes great server responsibility. The 100MB limit must be respected.",
    "Even Vibranium servers have their limits. Files over 100MB cannot be processed.",
    "This file has been classified as a Level 7 threat. All transmissions must be under 100MB.",
    "Looks like you'll need some PYM particles for that file! Must be under 100MB.",
    "The bifrost can't sustain a transfer of this magnitude! Keep it under 100MB.",
    "This file's energy signature is too large for the Tesseract. Keep transfers under 100MB.",
    "This file is too heavy for a cosmic flight. It's over the 100MB weight limit.",
    "SMASH! This file is too big! Keep it under 100MB before things get... angry.",
    "This file is a Nexus event. Prune it to under 100MB to protect the Sacred Timeline.",
    "I can do this all day. But I can't upload a file over 100MB.",
    "On your left... is a smaller file, I hope. This one exceeds the 100MB limit.",
    "This file is too big. I don't feel so good... Try something under 100MB.",
    "I went forward in time to view 14,000,605 futures. In none of them does this upload succeed.",
    "That's my secret, Cap. I'm always angry... at files over 100MB.",
    "I love you 3000, but I don't love files over 100MB.",
    "This file is too big to fit in the Quantum Realm. Please shrink it to under 100MB.",
    "Cerebro has detected a file with a power signature that is off the charts. Max capacity is 100MB."
];

const timeoutErrorMessages = [
  "The Bifrost connection is unstable! Upload timed out.",
  "Strange can't keep the portal open this long. Upload timed out.",
  "Thanos snapped... and so did your upload. Timed out!",
  "Loki's mischief is messing with our servers. Upload timed out.",
  "SHIELD's satellites lost the signal. Upload timed out.",
  "Ultron hijacked the network again. Upload timed out.",
  "Even with super speed, this connection is too slow. Upload timed out.",
  "Looks like we hit a time-dilation field. Upload timed out.",
  "Our communications with the Wakandan network are experiencing lag. Too slow to upload.",
  "The cosmic data stream is congested. Upload timed out.",
  "Fury says the connection is compromised! Too slow to upload.",
  "This upload is taking longer than a Pym Particle re-calibration. Timed out!",
  "Even with a power stone, we can't speed up this connection. Upload timed out.",
  "The timelines are not aligning for this upload. Timed out!",
  "JARVIS reports a network anomaly. Upload timed out."
];


const App = () => {
  const [dragActive, setDragActive] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [textContent, setTextContent] = useState('');
  const [connectedUsers, setConnectedUsers] = useState([]);
  const [selectedUsers, setSelectedUsers] = useState(new Set()); 
  const [modalSelectedUsers, setModalSelectedUsers] = useState(new Set());
  const [myCharacter, setMyCharacter] = useState('');
  const [userId] = useState(() => `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [currentShare, setCurrentShare] = useState(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [receivedShare, setReceivedShare] = useState(null);
  const [isDownloading, setIsDownloading] = useState(false);
  
  const [chats, setChats] = useState({});
  const [activeChatUser, setActiveChatUser] = useState(null);
  const [currentMessage, setCurrentMessage] = useState('');
  const chatMessagesEndRef = useRef(null);

  const websocketRef = useRef(null);
  const fileInputRef = useRef(null);

  const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';

  useEffect(() => {
    chatMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chats, activeChatUser]);

  useEffect(() => {
    connectWebSocket();
    return () => {
      if (websocketRef.current) {
        websocketRef.current.close();
      }
    };
  }, []);

  const connectWebSocket = () => {
    const wsUrl = backendUrl.replace(/http/g, 'ws') + `/api/ws/${userId}`;
    const ws = new WebSocket(wsUrl);
    
    ws.onopen = () => { setConnectionStatus('connected'); toast.success('Connected to FlowShare network!'); };
    ws.onmessage = (event) => { handleWebSocketMessage(JSON.parse(event.data)); };
    ws.onclose = () => { setConnectionStatus('disconnected'); toast.error('Connection lost. Reconnecting...'); setTimeout(connectWebSocket, 3000); };
    ws.onerror = (error) => { console.error('WebSocket error:', error); setConnectionStatus('error'); toast.error('Connection error. Retrying...'); };
    
    websocketRef.current = ws;
  };

  const handleWebSocketMessage = (message) => {
    switch (message.type) {
      case 'character_assigned': setMyCharacter(message.character); toast.success(`You are now ${message.character}!`); break;
      case 'user_list_update': setConnectedUsers(message.users.filter(user => user.user_id !== userId)); break;
      case 'incoming_share': handleIncomingShare(message); break;
      case 'share_success': toast.success(message.message); break;
      case 'share_failed': toast.error(message.message); break;
      case 'private_message': handlePrivateMessage(message); break;
      // NEW: Handle the full chat request workflow
      case 'chat_request': handleIncomingChatRequest(message); break;
      case 'chat_accept': handleChatAccept(message); break;
      case 'chat_decline': handleChatDecline(message); break;
      default: console.log('Unknown message type:', message.type);
    }
  };

  const handleIncomingShare = (message) => {
    toast.info(`🦸‍♂️ ${message.from_character} is sharing something with you!`);
    setReceivedShare({ ...message });
    setShowReceiveModal(true);
  };
  
  const handlePrivateMessage = (message) => {
    const partnerId = message.from_user_id === userId ? message.to_user_id : message.from_user_id;
    const newMessage = {
      sender: message.from_user_id === userId ? myCharacter : message.from_character,
      content: message.content, timestamp: message.timestamp,
    };
    setChats(prevChats => ({ ...prevChats, [partnerId]: [...(prevChats[partnerId] || []), newMessage] }));
    if (message.from_user_id !== userId && (!activeChatUser || activeChatUser.user_id !== partnerId)) {
        toast.info(`💬 New message from ${message.from_character}`);
    }
  };

  // NEW: Handlers for the chat request/response flow
  const handleIncomingChatRequest = ({ from_user_id, from_character }) => {
    toast.message(`Chat request from ${from_character}`, {
        action: {
            label: "Accept",
            onClick: () => {
                websocketRef.current.send(JSON.stringify({ type: 'chat_accept', to_user_id: from_user_id }));
                setActiveChatUser({ user_id: from_user_id, character: from_character });
            }
        },
        cancel: {
            label: "Decline",
            onClick: () => {
                websocketRef.current.send(JSON.stringify({ type: 'chat_decline', to_user_id: from_user_id }));
            }
        }
    });
  };

  const handleChatAccept = ({ from_user_id, from_character }) => {
    toast.success(`${from_character} accepted your chat request!`);
    setActiveChatUser({ user_id: from_user_id, character: from_character });
  };
  
  const handleChatDecline = ({ from_character }) => {
    toast.error(`${from_character} declined your chat request.`);
  };
  
  const handleFileUpload = async (file) => {
    // ... (This function remains the same as the last version)
    if (!file) return;
    const MAX_FILE_SIZE = 100 * 1024 * 1024;
    if (file.size > MAX_FILE_SIZE) {
      const randomMessage = sizeErrorMessages[Math.floor(Math.random() * sizeErrorMessages.length)];
      toast.error(randomMessage, { icon: <ShieldAlert className="w-5 h-5" />, description: `Your file is ${Math.round(file.size / (1024*1024))}MB. Please keep it under 100MB.`});
      if (fileInputRef.current) { fileInputRef.current.value = null; }
      return;
    }
    setIsUploading(true);
    setUploadProgress(0);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await axios.post(`${backendUrl}/api/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (e) => setUploadProgress(Math.round((e.loaded * 100) / e.total)),
        timeout: 35000, 
      });
      setCurrentShare(response.data);
      setModalSelectedUsers(new Set(selectedUsers)); 
      setShowShareModal(true);
      toast.success('File uploaded! Now choose who to send it to.');
    } catch (error) {
      if (error.code === 'ECONNABORTED') {
        const randomMessage = timeoutErrorMessages[Math.floor(Math.random() * timeoutErrorMessages.length)];
        toast.error(randomMessage, { description: "The upload took too long. Please try again with a faster network.", icon: <WifiOff className="w-5 h-5" /> });
      } else {
        const errorMessage = error.response?.data?.detail || 'Failed to upload file. Please try again.';
        toast.error(errorMessage, { icon: <ShieldAlert className="w-5 h-5" /> });
      }
      console.error('Upload error:', error);
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
      if (fileInputRef.current) { fileInputRef.current.value = null; }
    }
  };

  const handleTextShare = async () => {
    // ... (This function remains the same as the last version)
    if (!textContent.trim()) { toast.error('Please enter some text to share.'); return; }
    try {
      const response = await axios.post(`${backendUrl}/api/create-text-share`, { content: textContent, title: 'Shared Note' });
      setCurrentShare(response.data);
      setModalSelectedUsers(new Set(selectedUsers));
      setShowShareModal(true);
      setTextContent('');
      toast.success('Note ready! Now choose who to send it to.');
    } catch (error) {
      toast.error('Failed to create text share. Please try again.');
      console.error('Text share error:', error);
    }
  };

  const toggleUserSelection = (user) => {
    // ... (This function remains the same)
  };

  const toggleModalUserSelection = (user) => {
    // ... (This function remains the same)
  };
  
  const handleShareNow = () => {
    // ... (This function remains the same)
  };

  const handleCopyText = async () => {
    // ... (This function remains the same)
  };

  const handleDownloadFile = async () => {
    // ... (This function remains the same)
  };

  // NEW: Function to initiate a chat request instead of opening the modal directly
  const sendChatRequest = (user) => {
    if (websocketRef.current && websocketRef.current.readyState === WebSocket.OPEN) {
        websocketRef.current.send(JSON.stringify({ type: 'chat_request', to_user_id: user.user_id }));
        toast.info(`✉️ Chat request sent to ${user.character}`);
    } else {
        toast.error("Connection error. Cannot send chat request.");
    }
  };

  const sendPrivateMessage = () => {
    if (!currentMessage.trim() || !activeChatUser) return;
    if (websocketRef.current && websocketRef.current.readyState === WebSocket.OPEN) {
        websocketRef.current.send(JSON.stringify({
            type: 'private_message', to_user_id: activeChatUser.user_id, content: currentMessage
        }));
    }
    setCurrentMessage('');
  };

  // ... (Helper functions like getFileIcon, closeReceiveModal, handleDrag, handleDrop remain the same)
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white font-sans">
      <Toaster richColors position="top-right" theme="dark" />
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* ... (Header, Main Content, Share Modal, Receive Modal JSX remains the same) */}

        {/* MODIFIED: The onClick for the chat icon button is changed in the user list */}
        <Card className="mt-8 bg-slate-800/50 border-slate-700 backdrop-blur-sm">
          <CardHeader><CardTitle className="text-white flex items-center gap-2"><Users className="w-5 h-5" /> Available Marvel Heroes ({connectedUsers.length})</CardTitle></CardHeader>
          <CardContent>
            {connectedUsers.length === 0 ? (<p className="text-gray-400 text-center py-8">No other heroes online.</p>) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {connectedUsers.map((user) => (
                  <div key={user.user_id} className={`p-3 rounded-lg border cursor-pointer transition-all duration-200 ${selectedUsers.has(user.user_id) ? 'border-blue-400 bg-blue-400/20' : 'border-slate-600 hover:border-slate-500 bg-slate-700/50'}`} onClick={() => toggleUserSelection(user)}>
                    <Badge variant="secondary" className="w-full justify-center flex gap-2 items-center">
                      <button 
                        onClick={(e) => { e.stopPropagation(); sendChatRequest(user); }} 
                        className="hover:text-blue-400 p-1 -m-1" 
                        title={`Chat with ${user.character}`}
                      >
                        <MessageSquare className="w-4 h-4"/>
                      </button>
                      <span>{user.character}</span>
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* NEW: Chat Modal */}
        {activeChatUser && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                <Card className="bg-slate-800 border-slate-700 w-full max-w-lg h-[70vh] flex flex-col">
                    <CardHeader>
                        <div className="flex justify-between items-center">
                            <CardTitle className="text-white flex items-center gap-2">
                                <MessageSquare className="w-5 h-5 text-blue-400" />
                                Chat with {activeChatUser.character}
                            </CardTitle>
                            <Button onClick={() => setActiveChatUser(null)} variant="ghost" size="sm" className="text-gray-400 hover:text-white">
                                <X className="w-4 h-4" />
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
                        {(chats[activeChatUser.user_id] || []).map((msg, index) => (
                            <div key={index} className={`flex items-end gap-2 ${msg.sender === myCharacter ? 'justify-end' : 'justify-start'}`}>
                                {msg.sender !== myCharacter && <Badge variant="secondary" className="bg-slate-600 text-gray-200 w-8 h-8 flex items-center justify-center">{msg.sender.charAt(0)}</Badge>}
                                <div className={`max-w-xs md:max-w-md p-3 rounded-lg ${msg.sender === myCharacter ? 'bg-blue-600 text-white' : 'bg-slate-700 text-gray-200'}`}>
                                    <p className="text-sm">{msg.content}</p>
                                </div>
                                {msg.sender === myCharacter && <Badge variant="secondary" className="bg-blue-600 text-white w-8 h-8 flex items-center justify-center">{myCharacter.charAt(0)}</Badge>}
                            </div>
                        ))}
                        <div ref={chatMessagesEndRef} />
                    </CardContent>
                    <div className="p-4 border-t border-slate-700">
                        <form onSubmit={(e) => { e.preventDefault(); sendPrivateMessage(); }} className="flex gap-2">
                            <Input
                                type="text"
                                placeholder="Type a message..."
                                value={currentMessage}
                                onChange={(e) => setCurrentMessage(e.target.value)}
                                className="flex-1 bg-slate-700/50 border-slate-600 text-white placeholder-gray-400"
                            />
                            <Button type="submit" disabled={!currentMessage.trim()} className="bg-blue-600 hover:bg-blue-700">
                                <Send className="w-4 h-4" />
                            </Button>
                        </form>
                    </div>
                </Card>
            </div>
        )}

         {/* All other JSX Modals like Share and Receive remain the same */}
         
      </div>
    </div>
  );
};

export default App;
