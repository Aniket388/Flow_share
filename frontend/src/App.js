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
    "This file is too heavy for even the Hulk!", "S.H.I.E.L.D. protocols limit transfers to 100MB.",
    "My Pym Particle supply is low. Can't handle files over 100MB.", "Even Mjolnir isn't this heavy. Please keep files under 100MB.",
    "JARVIS reports this file's data signature is too large. Keep it under 100MB."
];
const timeoutErrorMessages = [
  "The Bifrost connection is unstable! Upload timed out.", "Even with super speed, this connection is too slow. Upload cancelled.",
  "Looks like we hit a time-dilation field. Upload timed out."
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
      sender: message.from_character,
      content: message.content, 
      timestamp: message.timestamp,
    };
    setChats(prevChats => ({ ...prevChats, [partnerId]: [...(prevChats[partnerId] || []), newMessage] }));
    if (message.from_user_id !== userId && (!activeChatUser || activeChatUser.user_id !== partnerId)) {
        toast.info(`💬 New message from ${message.from_character}`);
    }
  };
  
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
    const newSelection = new Set(selectedUsers);
    if (newSelection.has(user.user_id)) { newSelection.delete(user.user_id); } 
    else { newSelection.add(user.user_id); }
    setSelectedUsers(newSelection);
  };

  const toggleModalUserSelection = (user) => {
    const newSelection = new Set(modalSelectedUsers);
    if (newSelection.has(user.user_id)) { newSelection.delete(user.user_id); } 
    else { newSelection.add(user.user_id); }
    setModalSelectedUsers(newSelection);
  };
  
  const handleShareNow = () => {
    if (modalSelectedUsers.size === 0) { toast.error('Please select at least one hero to share with.'); return; }
    if (websocketRef.current && websocketRef.current.readyState === WebSocket.OPEN) {
      websocketRef.current.send(JSON.stringify({
        type: 'share_notification',
        to_user_ids: Array.from(modalSelectedUsers),
        share_data: currentShare
      }));
      setShowShareModal(false);
      setModalSelectedUsers(new Set());
      setCurrentShare(null);
    } else {
      toast.error('Connection lost. Please try again.');
    }
  };

  const handleCopyText = async () => {
    if (!receivedShare?.share_data?.content) return;
    try {
      await navigator.clipboard.writeText(receivedShare.share_data.content);
      toast.success('Text copied to clipboard!');
    } catch (error) { toast.error('Could not copy text.'); }
  };

  const handleDownloadFile = async () => {
    if (!receivedShare?.share_data?.file_id) return;
    setIsDownloading(true);
    toast.info('Starting download...');
    try {
      const response = await axios.get(`${backendUrl}/api/download/${receivedShare.share_data.file_id}`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', receivedShare.share_data.filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success('File downloaded successfully!');
    } catch (error) {
      console.error('Download error:', error);
      toast.error('Failed to download file. Please try again.');
    } finally {
      setIsDownloading(false);
    }
  };

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

  const handleDrag = (e) => { e.preventDefault(); e.stopPropagation(); if (e.type === 'dragenter' || e.type === 'dragover') { setDragActive(true); } else if (e.type === 'dragleave') { setDragActive(false); } };
  const handleDrop = (e) => { e.preventDefault(); e.stopPropagation(); setDragActive(false); if (e.dataTransfer.files && e.dataTransfer.files[0]) { handleFileUpload(e.dataTransfer.files[0]); } };
  const closeReceiveModal = () => { setShowReceiveModal(false); setReceivedShare(null); };
  const getFileIcon = (filename) => { const ext = filename?.split('.').pop()?.toLowerCase(); switch (ext) { case 'pdf': return '📄'; case 'doc': case 'docx': return '📝'; case 'jpg': case 'jpeg': case 'png': case 'gif': return '🖼️'; case 'mp4': case 'mov': return '🎥'; case 'mp3': case 'wav': return '🎵'; default: return '📁'; } };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white font-sans">
      <Toaster richColors position="top-right" theme="dark" />
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="text-center mb-12">
            <h1 className="text-6xl font-bold bg-gradient-to-r from-red-400 via-yellow-400 to-blue-400 bg-clip-text text-transparent mb-4">FlowShare</h1>
            <p className="text-gray-300 text-xl">Marvel Share Network</p>
            {myCharacter && <div className="mt-6 p-4 bg-gradient-to-r from-blue-600/20 to-purple-600/20 rounded-lg border border-blue-500/30"><h2 className="text-3xl font-bold text-white mb-2">You are: <span className="text-blue-400">{myCharacter}</span></h2><p className="text-gray-300">Your Marvel identity on the network</p></div>}
            <div className="flex items-center justify-center gap-2 mt-4"><Wifi className={`w-5 h-5 ${connectionStatus === 'connected' ? 'text-green-400' : 'text-red-400'}`} /><span className={`text-sm ${connectionStatus === 'connected' ? 'text-green-400' : 'text-red-400'}`}>{connectionStatus === 'connected' ? `Connected to network` : 'Connecting...'}</span></div>
        </div>
        <div className="grid md:grid-cols-2 gap-8">
            <Card className="bg-slate-800/50 border-slate-700 backdrop-blur-sm"><CardHeader><CardTitle className="text-white flex items-center gap-2"><Upload className="w-5 h-5" /> Share a File</CardTitle></CardHeader><CardContent><div className={`border-2 border-dashed rounded-lg p-8 text-center transition-all duration-300 cursor-pointer ${dragActive ? 'border-blue-400 bg-blue-400/10' : 'border-slate-600 hover:border-slate-500'}`} onDragEnter={handleDrag} onDragLeave={handleDrag} onDragOver={handleDrag} onDrop={handleDrop} onClick={() => fileInputRef.current?.click()}>{isUploading ? (<div className="space-y-4"><Loader2 className="w-12 h-12 animate-spin text-blue-400 mx-auto" /><Progress value={uploadProgress} className="w-full" /><p className="text-gray-300">Uploading... {uploadProgress}%</p></div>) : (<><Upload className="w-16 h-16 text-slate-400 mx-auto mb-4" /><p className="text-white text-lg mb-2">Drop files here or click to browse</p><p className="text-gray-400">Any file type supported</p></>)}</div><input ref={fileInputRef} type="file" className="hidden" onChange={(e) => e.target.files && handleFileUpload(e.target.files[0])} /></CardContent></Card>
            <Card className="bg-slate-800/50 border-slate-700 backdrop-blur-sm"><CardHeader><CardTitle className="text-white flex items-center gap-2"><FileText className="w-5 h-5" /> Share a Note</CardTitle></CardHeader><CardContent className="space-y-4"><Textarea placeholder="Type your message or paste text here..." value={textContent} onChange={(e) => setTextContent(e.target.value)} className="min-h-[120px] bg-slate-700/50 border-slate-600 text-white placeholder-gray-400" /><Button onClick={handleTextShare} disabled={!textContent.trim()} className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"><FileText className="w-4 h-4 mr-2" /> Share Note</Button></CardContent></Card>
        </div>
        <Card className="mt-8 bg-slate-800/50 border-slate-700 backdrop-blur-sm">
          <CardHeader><CardTitle className="text-white flex items-center gap-2"><Users className="w-5 h-5" /> Available Marvel Heroes ({connectedUsers.length})</CardTitle></CardHeader>
          <CardContent>{connectedUsers.length === 0 ? (<p className="text-gray-400 text-center py-8">No other heroes online.</p>) : (<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">{connectedUsers.map((user) => (<div key={user.user_id} className={`p-3 rounded-lg border cursor-pointer transition-all duration-200 ${selectedUsers.has(user.user_id) ? 'border-blue-400 bg-blue-400/20' : 'border-slate-600 hover:border-slate-500 bg-slate-700/50'}`} onClick={() => toggleUserSelection(user)}><Badge variant="secondary" className="w-full justify-center flex gap-2 items-center"><button onClick={(e) => { e.stopPropagation(); sendChatRequest(user); }} className="hover:text-blue-400 p-1 -m-1" title={`Chat with ${user.character}`}><MessageSquare className="w-4 h-4"/></button><span>{user.character}</span></Badge></div>))}</div>)}</CardContent>
        </Card>
        
        {showShareModal && currentShare && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50"><Card className="bg-slate-800 border-slate-700 w-full max-w-lg"><CardHeader><div className="flex justify-between items-center"><CardTitle className="text-white">Share Your {currentShare.type === 'file' ? 'File' : 'Note'}</CardTitle><Button onClick={() => setShowShareModal(false)} variant="ghost" size="sm" className="text-gray-400 hover:text-white"><X className="w-4 h-4" /></Button></div></CardHeader><CardContent className="space-y-4"><div className="p-4 bg-slate-700/50 rounded-lg"><p className="text-white font-medium truncate">{currentShare.type === 'file' ? currentShare.filename : currentShare.title}</p></div><div className="space-y-2"><h3 className="text-white font-semibold flex items-center gap-2"><Users className="w-5 h-5" />Confirm or Change Recipients</h3>{connectedUsers.length === 0 ? (<p className="text-gray-400 text-center py-4">No other heroes are online.</p>) : (<div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-48 overflow-y-auto p-1">{connectedUsers.map((user) => (<div key={user.user_id} className={`p-2 rounded-lg border text-center cursor-pointer transition-all duration-200 ${modalSelectedUsers.has(user.user_id) ? 'border-blue-400 bg-blue-400/20 text-white' : 'border-slate-600 hover:border-slate-500 bg-slate-700/50 text-gray-300'}`} onClick={() => toggleModalUserSelection(user)}>{user.character}</div>))}</div>)}</div><p className="text-gray-300 text-sm pt-2">Final selection: {modalSelectedUsers.size} hero{modalSelectedUsers.size !== 1 ? 's' : ''}</p><div className="flex gap-2"><Button onClick={handleShareNow} disabled={modalSelectedUsers.size === 0} className="flex-1 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700"><Send className="w-4 h-4 mr-2" /> Share Now</Button><Button onClick={() => setShowShareModal(false)} variant="outline" className="border-slate-600 text-gray-300 hover:bg-slate-700">Cancel</Button></div></CardContent></Card></div>
        )}
        {showReceiveModal && receivedShare && (
           <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50"><Card className="bg-slate-800 border-slate-700 w-full max-w-md"><CardHeader><div className="flex items-center justify-between"><CardTitle className="text-white flex items-center gap-2"><CheckCircle className="w-5 h-5 text-green-400" />{receivedShare.from_character} sent you something!</CardTitle><Button onClick={closeReceiveModal} variant="ghost" size="sm" className="text-gray-400 hover:text-white"><X className="w-4 h-4" /></Button></div></CardHeader><CardContent className="space-y-4"><div className="p-4 bg-slate-700/50 rounded-lg">{receivedShare.share_data.type === 'file' ? (<div className="flex items-center gap-3"><span className="text-2xl">{getFileIcon(receivedShare.share_data.filename)}</span><div><p className="text-white font-medium">{receivedShare.share_data.filename}</p><p className="text-gray-400 text-sm">{receivedShare.share_data.size ? `${Math.round(receivedShare.share_data.size / 1024)} KB` : ''}</p></div></div>) : (<div><p className="text-white font-medium mb-2">{receivedShare.share_data.title}</p><p className="text-gray-300 text-sm max-h-32 overflow-y-auto">{receivedShare.share_data.content}</p></div>)}</div><div className="flex gap-2">{receivedShare.share_data.type === 'file' ? (<Button onClick={handleDownloadFile} disabled={isDownloading} className="flex-1 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700">{isDownloading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />} Download File</Button>) : (<Button onClick={handleCopyText} className="flex-1 bg-gradient-to-r from-green-600 to-teal-600 hover:from-green-700 hover:to-teal-700"><Copy className="w-4 h-4 mr-2" /> Copy Text</Button>)}<Button onClick={closeReceiveModal} variant="outline" className="border-slate-600 text-gray-300 hover:bg-slate-700">Close</Button></div></CardContent></Card></div>
        )}
        {activeChatUser && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                <Card className="bg-slate-800 border-slate-700 w-full max-w-lg h-[70vh] flex flex-col">
                    <CardHeader><div className="flex justify-between items-center"><CardTitle className="text-white flex items-center gap-2"><MessageSquare className="w-5 h-5 text-blue-400" />Chat with {activeChatUser.character}</CardTitle><Button onClick={() => setActiveChatUser(null)} variant="ghost" size="sm" className="text-gray-400 hover:text-white"><X className="w-4 h-4" /></Button></div></CardHeader>
                    <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
                        {(chats[activeChatUser.user_id] || []).map((msg, index) => {
                            const isMyMessage = msg.sender === myCharacter;
                            if (isMyMessage) {
                                // My message (right aligned)
                                return (
                                    <div key={index} className="flex w-full justify-end">
                                        <div className="flex items-start gap-2.5">
                                            <div className="bg-blue-600 text-white p-3 rounded-lg max-w-xs md:max-w-md rounded-br-none">
                                                <p className="text-sm" style={{ wordBreak: 'break-word' }}>{msg.content}</p>
                                            </div>
                                            <Badge variant="secondary" className="bg-blue-600 text-white w-8 h-8 flex items-center justify-center flex-shrink-0">{myCharacter.charAt(0)}</Badge>
                                        </div>
                                    </div>
                                );
                            } else {
                                // Their message (left aligned)
                                return (
                                    <div key={index} className="flex w-full justify-start">
                                        <div className="flex items-start gap-2.5">
                                            <Badge variant="secondary" className="bg-slate-600 text-gray-200 w-8 h-8 flex items-center justify-center flex-shrink-0">{msg.sender.charAt(0)}</Badge>
                                            <div className="bg-slate-700 text-gray-200 p-3 rounded-lg max-w-xs md:max-w-md rounded-bl-none">
                                                <p className="text-sm" style={{ wordBreak: 'break-word' }}>{msg.content}</p>
                                            </div>
                                        </div>
                                    </div>
                                );
                            }
                        })}
                        <div ref={chatMessagesEndRef} />
                    </CardContent>
                    <div className="p-4 border-t border-slate-700">
                        <form onSubmit={(e) => { e.preventDefault(); sendPrivateMessage(); }} className="flex gap-2">
                            <Input type="text" placeholder="Type a message..." value={currentMessage} onChange={(e) => setCurrentMessage(e.target.value)} className="flex-1 bg-slate-700/50 border-slate-600 text-white placeholder-gray-400" />
                            <Button type="submit" disabled={!currentMessage.trim()} className="bg-blue-600 hover:bg-blue-700"><Send className="w-4 h-4" /></Button>
                        </form>
                    </div>
                </Card>
            </div>
        )}
      </div>
    </div>
  );
};

export default App;
