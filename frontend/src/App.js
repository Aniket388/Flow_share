import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Upload, Users, Send, FileText, Wifi, Loader2, Download, Copy, X, CheckCircle, AlertCircle } from 'lucide-react';
import { Button } from './components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card';
import { Textarea } from './components/ui/textarea';
import { Badge } from './components/ui/badge';
import { Progress } from './components/ui/progress';
import { toast } from 'sonner';
import './App.css';

const App = () => {
  const [dragActive, setDragActive] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [textContent, setTextContent] = useState('');
  const [connectedUsers, setConnectedUsers] = useState([]);
  const [selectedUsers, setSelectedUsers] = useState(new Set());
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
    const wsUrl = backendUrl.replace('http', 'ws') + `/api/ws/${userId}`;
    const ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
      setConnectionStatus('connected');
      toast.success('🌟 Connected to FlowShare network!');
    };
    
    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      handleWebSocketMessage(message);
    };
    
    ws.onclose = () => {
      setConnectionStatus('disconnected');
      toast.error('⚠️ Connection lost. Reconnecting...');
      setTimeout(connectWebSocket, 3000); // Reconnect after 3 seconds
    };
    
    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      setConnectionStatus('error');
      toast.error('❌ Connection error. Retrying...');
    };
    
    websocketRef.current = ws;
  };

  const handleWebSocketMessage = (message) => {
    switch (message.type) {
      case 'character_assigned':
        setMyCharacter(message.character);
        toast.success(`🦸‍♂️ You are now ${message.character}!`);
        break;
      
      case 'user_list_update':
        const otherUsers = message.users.filter(user => user.user_id !== userId);
        setConnectedUsers(otherUsers);
        break;
      
      case 'webrtc_signal':
        handleWebRTCSignal(message);
        break;
      
      case 'incoming_share':
        handleIncomingShare(message);
        break;
      
      case 'share_success':
        toast.success(`✅ ${message.message}`);
        break;
      
      case 'share_failed':
        toast.error(`❌ ${message.message}`);
        break;
      
      default:
        console.log('Unknown message type:', message.type);
    }
  };

  const handleWebRTCSignal = (message) => {
    // WebRTC signaling logic will be implemented here
    console.log('Received WebRTC signal from', message.from_character);
  };

  const handleIncomingShare = (message) => {
    const shareType = message.share_data.type;
    const fromCharacter = message.from_character;
    
    // Show immediate notification
    toast.success(`🦸‍♂️ ${fromCharacter} is sharing ${shareType === 'file' ? 'a file' : 'a note'} with you!`);
    
    // Set received share data and show modal
    setReceivedShare({
      from_character: fromCharacter,
      from_user_id: message.from_user_id,
      share_data: message.share_data,
      timestamp: message.timestamp
    });
    setShowReceiveModal(true);
  };

  const sendWebRTCSignal = (toUserId, signalData) => {
    if (websocketRef.current && websocketRef.current.readyState === WebSocket.OPEN) {
      websocketRef.current.send(JSON.stringify({
        type: 'webrtc_signal',
        to_user_id: toUserId,
        signal_data: signalData
      }));
    }
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
    
    setIsUploading(true);
    setUploadProgress(0);
    
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await axios.post(`${backendUrl}/api/upload`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress: (progressEvent) => {
          const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setUploadProgress(progress);
        },
      });
      
      setCurrentShare(response.data);
      setShowShareModal(true);
      toast.success('📁 File uploaded successfully!');
      
    } catch (error) {
      toast.error('❌ Failed to upload file. Please try again.');
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
      setShowShareModal(true);
      setTextContent('');
      toast.success('📝 Text note ready to share!');
      
    } catch (error) {
      toast.error('❌ Failed to create text share. Please try again.');
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

  const handleShareNow = () => {
    if (selectedUsers.size === 0) {
      toast.error('Please select at least one hero to share with.');
      return;
    }
    
    if (websocketRef.current && websocketRef.current.readyState === WebSocket.OPEN) {
      websocketRef.current.send(JSON.stringify({
        type: 'share_notification',
        to_user_ids: Array.from(selectedUsers),
        share_data: currentShare
      }));
      
      setShowShareModal(false);
      setSelectedUsers(new Set());
      setCurrentShare(null);
    } else {
      toast.error('❌ Connection lost. Please try again.');
    }
  };

  const handleCopyText = async () => {
    if (!receivedShare?.share_data?.content) return;
    
    try {
      await navigator.clipboard.writeText(receivedShare.share_data.content);
      toast.success('📋 Text copied to clipboard!');
    } catch (error) {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = receivedShare.share_data.content;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      toast.success('📋 Text copied to clipboard!');
    }
  };

  const handleDownloadFile = async () => {
    if (!receivedShare?.share_data?.file_id) return;
    
    setIsDownloading(true);
    
    try {
      const response = await axios.get(`${backendUrl}/api/download/${receivedShare.share_data.file_id}`, {
        responseType: 'blob'
      });
      
      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', receivedShare.share_data.filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      toast.success('📁 File downloaded successfully!');
    } catch (error) {
      console.error('Download error:', error);
      toast.error('❌ Failed to download file. Please try again.');
    } finally {
      setIsDownloading(false);
    }
  };

  const closeReceiveModal = () => {
    setShowReceiveModal(false);
    setReceivedShare(null);
  };

  const getFileIcon = (filename) => {
    const extension = filename?.split('.').pop()?.toLowerCase();
    switch (extension) {
      case 'pdf':
        return '📄';
      case 'doc':
      case 'docx':
        return '📝';
      case 'jpg':
      case 'jpeg':
      case 'png':
      case 'gif':
        return '🖼️';
      case 'mp4':
      case 'avi':
        return '🎥';
      case 'mp3':
      case 'wav':
        return '🎵';
      default:
        return '📁';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-6xl font-bold bg-gradient-to-r from-red-400 via-yellow-400 to-blue-400 bg-clip-text text-transparent mb-4">
            FlowShare
          </h1>
          <p className="text-gray-300 text-xl">P2P Marvel Share Network</p>
          
          {/* Your Character Identity */}
          {myCharacter && (
            <div className="mt-6 p-4 bg-gradient-to-r from-blue-600/20 to-purple-600/20 rounded-lg border border-blue-500/30">
              <h2 className="text-3xl font-bold text-white mb-2">
                You are: <span className="text-blue-400">{myCharacter}</span>
              </h2>
              <p className="text-gray-300">Your Marvel identity on the network</p>
            </div>
          )}
          
          {/* Connection Status */}
          <div className="flex items-center justify-center gap-2 mt-4">
            <Wifi className={`w-5 h-5 ${connectionStatus === 'connected' ? 'text-green-400' : 'text-red-400'}`} />
            <span className={`text-sm ${connectionStatus === 'connected' ? 'text-green-400' : 'text-red-400'}`}>
              {connectionStatus === 'connected' 
                ? `Connected to network` 
                : 'Connecting to network...'}
            </span>
          </div>
        </div>

        {/* Main Content */}
        <div className="grid md:grid-cols-2 gap-8">
          {/* File Upload Section */}
          <Card className="bg-slate-800/50 border-slate-700 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Upload className="w-5 h-5" />
                Share a File
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div
                className={`border-2 border-dashed rounded-lg p-8 text-center transition-all duration-300 cursor-pointer ${
                  dragActive
                    ? 'border-blue-400 bg-blue-400/10'
                    : 'border-slate-600 hover:border-slate-500'
                }`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
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
              
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={(e) => e.target.files && handleFileUpload(e.target.files[0])}
              />
            </CardContent>
          </Card>

          {/* Text Share Section */}
          <Card className="bg-slate-800/50 border-slate-700 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Share a Note
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                placeholder="Type your message or paste text here..."
                value={textContent}
                onChange={(e) => setTextContent(e.target.value)}
                className="min-h-[120px] bg-slate-700/50 border-slate-600 text-white placeholder-gray-400"
              />
              <Button 
                onClick={handleTextShare}
                disabled={!textContent.trim()}
                className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
              >
                <FileText className="w-4 h-4 mr-2" />
                Share Note
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Connected Users */}
        <Card className="mt-8 bg-slate-800/50 border-slate-700 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Users className="w-5 h-5" />
              Available Marvel Heroes ({connectedUsers.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {connectedUsers.length === 0 ? (
              <p className="text-gray-400 text-center py-8">
                No other heroes online. Share the FlowShare link with friends to get started!
              </p>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {connectedUsers.map((user) => (
                  <div
                    key={user.user_id}
                    className={`p-3 rounded-lg border cursor-pointer transition-all duration-200 ${
                      selectedUsers.has(user.user_id)
                        ? 'border-blue-400 bg-blue-400/20'
                        : 'border-slate-600 hover:border-slate-500 bg-slate-700/50'
                    }`}
                    onClick={() => toggleUserSelection(user)}
                  >
                    <Badge 
                      variant="secondary" 
                      className={`w-full justify-center ${
                        selectedUsers.has(user.user_id) 
                          ? 'bg-blue-600 text-white' 
                          : 'bg-slate-600 text-gray-200'
                      }`}
                    >
                      {user.character}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Share Modal */}
        {showShareModal && currentShare && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <Card className="bg-slate-800 border-slate-700 w-full max-w-md">
              <CardHeader>
                <CardTitle className="text-white">
                  Ready to Share {currentShare.type === 'file' ? 'File' : 'Note'}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 bg-slate-700/50 rounded-lg">
                  <p className="text-white font-medium">
                    {currentShare.type === 'file' ? currentShare.filename : currentShare.title}
                  </p>
                  {currentShare.type === 'text' && (
                    <p className="text-gray-400 text-sm mt-2">
                      {currentShare.content.substring(0, 100)}...
                    </p>
                  )}
                </div>
                
                <p className="text-gray-300 text-sm">
                  Selected: {selectedUsers.size} hero{selectedUsers.size !== 1 ? 's' : ''}
                </p>
                
                <div className="flex gap-2">
                  <Button
                    onClick={handleShareNow}
                    disabled={selectedUsers.size === 0}
                    className="flex-1 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700"
                  >
                    <Send className="w-4 h-4 mr-2" />
                    Share Now
                  </Button>
                  <Button
                    onClick={() => setShowShareModal(false)}
                    variant="outline"
                    className="border-slate-600 text-gray-300 hover:bg-slate-700"
                  >
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Receive Modal */}
        {showReceiveModal && receivedShare && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <Card className="bg-slate-800 border-slate-700 w-full max-w-md">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-white flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-green-400" />
                    {receivedShare.from_character} sent you something!
                  </CardTitle>
                  <Button
                    onClick={closeReceiveModal}
                    variant="ghost"
                    size="sm"
                    className="text-gray-400 hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 bg-slate-700/50 rounded-lg">
                  {receivedShare.share_data.type === 'file' ? (
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{getFileIcon(receivedShare.share_data.filename)}</span>
                      <div>
                        <p className="text-white font-medium">{receivedShare.share_data.filename}</p>
                        <p className="text-gray-400 text-sm">
                          {Math.round(receivedShare.share_data.size / 1024)} KB
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <p className="text-white font-medium mb-2">{receivedShare.share_data.title}</p>
                      <p className="text-gray-300 text-sm max-h-32 overflow-y-auto">
                        {receivedShare.share_data.content}
                      </p>
                    </div>
                  )}
                </div>
                
                <div className="flex gap-2">
                  {receivedShare.share_data.type === 'file' ? (
                    <Button
                      onClick={handleDownloadFile}
                      disabled={isDownloading}
                      className="flex-1 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700"
                    >
                      {isDownloading ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Download className="w-4 h-4 mr-2" />
                      )}
                      Download File
                    </Button>
                  ) : (
                    <Button
                      onClick={handleCopyText}
                      className="flex-1 bg-gradient-to-r from-green-600 to-teal-600 hover:from-green-700 hover:to-teal-700"
                    >
                      <Copy className="w-4 h-4 mr-2" />
                      Copy Text
                    </Button>
                  )}
                  
                  <Button
                    onClick={closeReceiveModal}
                    variant="outline"
                    className="border-slate-600 text-gray-300 hover:bg-slate-700"
                  >
                    Close
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;