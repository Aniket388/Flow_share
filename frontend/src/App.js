import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Upload, Users, Send, FileText, Wifi, Loader2, Download, Copy, X, CheckCircle, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from './components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card';
import { Textarea } from './components/ui/textarea';
import { Badge } from './components/ui/badge';
import { Progress } from './components/ui/progress';
import './App.css';

// NEW: Expanded list of random error messages
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
  
  const websocketRef = useRef(null);
  const fileInputRef = useRef(null);

  const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';

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
    
    ws.onopen = () => {
      setConnectionStatus('connected');
      toast.success('Connected to FlowShare network!');
    };
    
    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      handleWebSocketMessage(message);
    };
    
    ws.onclose = () => {
      setConnectionStatus('disconnected');
      toast.error('Connection lost. Reconnecting...');
      setTimeout(connectWebSocket, 3000);
    };
    
    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      setConnectionStatus('error');
      toast.error('Connection error. Retrying...');
    };
    
    websocketRef.current = ws;
  };

  const handleWebSocketMessage = (message) => {
    switch (message.type) {
      case 'character_assigned':
        setMyCharacter(message.character);
        toast.success(`You are now ${message.character}!`);
        break;
      
      case 'user_list_update':
        const otherUsers = message.users.filter(user => user.user_id !== userId);
        setConnectedUsers(otherUsers);
        break;
      
      case 'incoming_share':
        handleIncomingShare(message);
        break;
      
      case 'share_success':
        toast.success(message.message);
        break;
      
      case 'share_failed':
        toast.error(message.message);
        break;
      
      default:
        console.log('Unknown message type:', message.type);
    }
  };

  const handleIncomingShare = (message) => {
    const shareData = message.share_data;
    const fromCharacter = message.from_character;

    const tempReceivedShare = {
        from_character: fromCharacter,
        share_data: shareData
    };

    toast.message(`Incoming Share from ${fromCharacter}`, {
      description: shareData.type === 'file' 
        ? `File: ${shareData.filename}`
        : `Note: ${shareData.content.substring(0, 30)}...`,
      duration: 15000,
      action: {
        label: shareData.type === 'file' ? 'Download' : 'Copy',
        onClick: () => {
          if (shareData.type === 'file') {
            handleDownloadFile(tempReceivedShare);
          } else {
            handleCopyText(tempReceivedShare);
          }
        },
      },
      cancel: {
        label: 'Dismiss',
        onClick: () => {},
      },
    });
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  const handleFileUpload = async (file) => {
    if (!file) return;

    const MAX_FILE_SIZE = 100 * 1024 * 1024;
    if (file.size > MAX_FILE_SIZE) {
      const randomIndex = Math.floor(Math.random() * sizeErrorMessages.length);
      const randomMessage = sizeErrorMessages[randomIndex];
      
      toast.error(randomMessage, {
        icon: <ShieldAlert className="w-5 h-5" />,
        description: `Your file is ${Math.round(file.size / (1024*1024))}MB. Please keep it under 100MB.`,
      });

      if (fileInputRef.current) {
        fileInputRef.current.value = null;
      }
      return;
    }
    
    setIsUploading(true);
    setUploadProgress(0);
    
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await axios.post(`${backendUrl}/api/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (progressEvent) => {
          const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setUploadProgress(progress);
        },
      });
      
      setCurrentShare(response.data);
      setModalSelectedUsers(new Set(selectedUsers)); 
      setShowShareModal(true);
      toast.success('File uploaded! Now choose who to send it to.');
      
    } catch (error) {
      const errorMessage = error.response?.data?.detail || 'Failed to upload file. Please try again.';
      toast.error(errorMessage, { icon: <ShieldAlert className="w-5 h-5" /> });
      console.error('Upload error:', error);
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const handleTextShare = async () => {
    if (!textContent.trim()) {
      toast.error('Please enter some text to share.');
      return;
    }
    
    try {
      const response = await axios.post(`${backendUrl}/api/create-text-share`, {
        content: textContent,
        title: 'Shared Note'
      });
      
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
    if (newSelection.has(user.user_id)) {
      newSelection.delete(user.user_id);
    } else {
      newSelection.add(user.user_id);
    }
    setSelectedUsers(newSelection);
  };

  const toggleModalUserSelection = (user) => {
    const newSelection = new Set(modalSelectedUsers);
    if (newSelection.has(user.user_id)) {
      newSelection.delete(user.user_id);
    } else {
      newSelection.add(user.user_id);
    }
    setModalSelectedUsers(newSelection);
  };

  const handleShareNow = () => {
    if (modalSelectedUsers.size === 0) {
      toast.error('Please select at least one hero to share with.');
      return;
    }
    
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
  
  const handleCopyText = async (shareToCopy) => {
    if (!shareToCopy?.share_data?.content) return;
    try {
      await navigator.clipboard.writeText(shareToCopy.share_data.content);
      toast.success('Text copied to clipboard!');
    } catch (error) {
      toast.error('Could not copy text.');
    }
  };

  const handleDownloadFile = async (shareToDownload) => {
    if (!shareToDownload?.share_data?.file_id) return;
    setIsDownloading(true);
    toast.info('Starting download...');
    try {
      const response = await axios.get(`${backendUrl}/api/download/${shareToDownload.share_data.file_id}`, {
        responseType: 'blob'
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', shareToDownload.share_data.filename);
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

  const getFileIcon = (filename) => {
    const extension = filename?.split('.').pop()?.toLowerCase();
    switch (extension) {
      case 'pdf': return '📄';
      case 'doc': case 'docx': return '📝';
      case 'jpg': case 'jpeg': case 'png': case 'gif': return '🖼️';
      case 'mp4': case 'avi': case 'mov': return '🎥';
      case 'mp3': case 'wav': return '🎵';
      default: return '📁';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white font-sans">
      {/* REMOVED: Toaster component deleted from here to fix the duplicate notification issue. */}
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-6xl font-bold bg-gradient-to-r from-red-400 via-yellow-400 to-blue-400 bg-clip-text text-transparent mb-4">
            FlowShare
          </h1>
          <p className="text-gray-300 text-xl">Marvel Share Network</p>
          
          {myCharacter && (
            <div className="mt-6 p-4 bg-gradient-to-r from-blue-600/20 to-purple-600/20 rounded-lg border border-blue-500/30">
              <h2 className="text-3xl font-bold text-white mb-2">
                You are: <span className="text-blue-400">{myCharacter}</span>
              </h2>
              <p className="text-gray-300">Your Marvel identity on the network</p>
            </div>
          )}
          
          <div className="flex items-center justify-center gap-2 mt-4">
            <Wifi className={`w-5 h-5 ${connectionStatus === 'connected' ? 'text-green-400' : 'text-red-400'}`} />
            <span className={`text-sm ${connectionStatus === 'connected' ? 'text-green-400' : 'text-red-400'}`}>
              {connectionStatus === 'connected' ? `Connected to network` : 'Connecting...'}
            </span>
          </div>
        </div>

        {/* Main Content */}
        <div className="grid md:grid-cols-2 gap-8">
          <Card className="bg-slate-800/50 border-slate-700 backdrop-blur-sm">
            <CardHeader><CardTitle className="text-white flex items-center gap-2"><Upload className="w-5 h-5" /> Share a File</CardTitle></CardHeader>
            <CardContent>
              <div
                className={`border-2 border-dashed rounded-lg p-8 text-center transition-all duration-300 cursor-pointer ${dragActive ? 'border-blue-400 bg-blue-400/10' : 'border-slate-600 hover:border-slate-500'}`}
                onDragEnter={handleDrag} onDragLeave={handleDrag} onDragOver={handleDrag} onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                {isUploading ? (
                  <div className="space-y-4">
                    <Loader2 className="w-12 h-12 animate-spin text-blue-400 mx-auto" />
                    <Progress value={uploadProgress} className="w-full" />
                    <p className="text-gray-300">Uploading... {uploadProgress}%</p>
                  </div>
                ) : (
                  <>
                    <Upload className="w-16 h-16 text-slate-400 mx-auto mb-4" />
                    <p className="text-white text-lg mb-2">Drop files here or click to browse</p>
                    <p className="text-gray-400">Any file type supported</p>
                  </>
                )}
              </div>
              <input ref={fileInputRef} type="file" className="hidden" onChange={(e) => e.target.files && handleFileUpload(e.target.files[0])} />
            </CardContent>
          </Card>
          <Card className="bg-slate-800/50 border-slate-700 backdrop-blur-sm">
            <CardHeader><CardTitle className="text-white flex items-center gap-2"><FileText className="w-5 h-5" /> Share a Note</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                placeholder="Type your message or paste text here..."
                value={textContent}
                onChange={(e) => setTextContent(e.target.value)}
                className="min-h-[120px] bg-slate-700/50 border-slate-600 text-white placeholder-gray-400"
              />
              <Button onClick={handleTextShare} disabled={!textContent.trim()} className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700">
                <FileText className="w-4 h-4 mr-2" /> Share Note
              </Button>
            </CardContent>
          </Card>
        </div>

        <Card className="mt-8 bg-slate-800/50 border-slate-700 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Users className="w-5 h-5" />
              Pre-select Heroes ({selectedUsers.size} selected)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {connectedUsers.length === 0 ? (
              <p className="text-gray-400 text-center py-8">No other heroes online to select.</p>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {connectedUsers.map((user) => (
                  <div key={user.user_id} className={`p-3 rounded-lg border cursor-pointer transition-all duration-200 ${selectedUsers.has(user.user_id) ? 'border-blue-400 bg-blue-400/20' : 'border-slate-600 hover:border-slate-500 bg-slate-700/50'}`} onClick={() => toggleUserSelection(user)}>
                    <Badge variant="secondary" className={`w-full justify-center ${selectedUsers.has(user.user_id) ? 'bg-blue-600 text-white' : 'bg-slate-600 text-gray-200'}`}>
                      {user.character}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {showShareModal && currentShare && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <Card className="bg-slate-800 border-slate-700 w-full max-w-lg">
              <CardHeader>
                <div className="flex justify-between items-center">
                    <CardTitle className="text-white">Share Your {currentShare.type === 'file' ? 'File' : 'Note'}</CardTitle>
                    <Button onClick={() => setShowShareModal(false)} variant="ghost" size="sm" className="text-gray-400 hover:text-white"><X className="w-4 h-4" /></Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 bg-slate-700/50 rounded-lg"><p className="text-white font-medium truncate">{currentShare.type === 'file' ? currentShare.filename : currentShare.title}</p></div>
                <div className="space-y-2">
                    <h3 className="text-white font-semibold flex items-center gap-2"><Users className="w-5 h-5" />Confirm or Change Recipients</h3>
                    {connectedUsers.length === 0 ? (
                        <p className="text-gray-400 text-center py-4">No other heroes are online to share with.</p>
                    ) : (
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-48 overflow-y-auto p-1">
                            {connectedUsers.map((user) => (
                            <div key={user.user_id} className={`p-2 rounded-lg border text-center cursor-pointer transition-all duration-200 ${modalSelectedUsers.has(user.user_id) ? 'border-blue-400 bg-blue-400/20 text-white' : 'border-slate-600 hover:border-slate-500 bg-slate-700/50 text-gray-300'}`} onClick={() => toggleModalUserSelection(user)}>
                                {user.character}
                            </div>
                            ))}
                        </div>
                    )}
                </div>
                <p className="text-gray-300 text-sm pt-2">Final selection: {modalSelectedUsers.size} hero{modalSelectedUsers.size !== 1 ? 's' : ''}</p>
                <div className="flex gap-2">
                  <Button onClick={handleShareNow} disabled={modalSelectedUsers.size === 0} className="flex-1 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700">
                    <Send className="w-4 h-4 mr-2" />
                    Share Now
                  </Button>
                  <Button onClick={() => setShowShareModal(false)} variant="outline" className="border-slate-600 text-gray-300 hover:bg-slate-700">
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* REMOVED: The old Receive Modal is no longer needed. */}

      </div>
    </div>
  );
};

export default App;
