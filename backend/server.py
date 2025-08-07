from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from motor.motor_asyncio import AsyncIOMotorClient
import os
import json
import uuid
import random
from datetime import datetime, timedelta
from typing import Dict, List
import asyncio
import shutil
from pathlib import Path

app = FastAPI()

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# MongoDB connection
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
client = AsyncIOMotorClient(MONGO_URL)
db = client.flowshare

# File storage directory
UPLOAD_DIR = Path("/tmp/flowshare_files")
UPLOAD_DIR.mkdir(exist_ok=True)

# Marvel characters list
MARVEL_CHARACTERS = [
    "Iron Man", "Captain America", "Thor", "Hulk", "Black Widow", "Hawkeye",
    "Spider-Man", "Doctor Strange", "Scarlet Witch", "Captain Marvel",
    "Black Panther", "Falcon", "Winter Soldier", "Ant-Man", "Wasp",
    "Star-Lord", "Gamora", "Drax", "Rocket", "Groot", "Nebula",
    "Loki", "Vision", "War Machine", "Quicksilver", "Shuri", "Okoye",
    "Valkyrie", "Ms. Marvel", "She-Hulk", "Moon Knight",
    "Daredevil", "Jessica Jones", "Luke Cage", "Iron Fist", "Punisher"
]

# Active WebSocket connections and user sessions
class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}
        self.user_sessions: Dict[str, dict] = {}

    async def connect(self, websocket: WebSocket, user_id: str):
        await websocket.accept()
        self.active_connections[user_id] = websocket
        
        # Assign random Marvel character
        available_characters = [char for char in MARVEL_CHARACTERS if char not in [session.get('character') for session in self.user_sessions.values()]]
        if not available_characters:
            available_characters = MARVEL_CHARACTERS
        
        character = random.choice(available_characters)
        
        self.user_sessions[user_id] = {
            'character': character,
            'connected_at': datetime.utcnow(),
            'websocket': websocket
        }
        
        # Notify user of their character assignment
        await self.send_personal_message(user_id, {
            'type': 'character_assigned',
            'character': character,
            'user_id': user_id
        })
        
        # Broadcast updated user list to all connected users
        await self.broadcast_user_list()

    def disconnect(self, user_id: str):
        if user_id in self.active_connections:
            del self.active_connections[user_id]
        if user_id in self.user_sessions:
            del self.user_sessions[user_id]

    async def send_personal_message(self, user_id: str, message: dict):
        if user_id in self.active_connections:
            try:
                await self.active_connections[user_id].send_text(json.dumps(message))
            except:
                # Connection might be closed, clean up
                self.disconnect(user_id)

    async def broadcast_user_list(self):
        user_list = []
        for user_id, session in self.user_sessions.items():
            user_list.append({
                'user_id': user_id,
                'character': session['character']
            })
        
        message = {
            'type': 'user_list_update',
            'users': user_list
        }
        
        disconnected_users = []
        for user_id, websocket in self.active_connections.items():
            try:
                await websocket.send_text(json.dumps(message))
            except:
                disconnected_users.append(user_id)
        
        # Clean up disconnected users
        for user_id in disconnected_users:
            self.disconnect(user_id)

    async def send_webrtc_signal(self, from_user_id: str, to_user_id: str, signal_data: dict):
        message = {
            'type': 'webrtc_signal',
            'from_user_id': from_user_id,
            'from_character': self.user_sessions.get(from_user_id, {}).get('character', 'Unknown'),
            'signal_data': signal_data
        }
        await self.send_personal_message(to_user_id, message)

    async def send_share_notification(self, from_user_id: str, to_user_ids: List[str], share_data: dict):
        from_character = self.user_sessions.get(from_user_id, {}).get('character', 'Unknown')
        
        # Enhanced share notification with download/copy functionality
        message = {
            'type': 'incoming_share',
            'from_user_id': from_user_id,
            'from_character': from_character,
            'share_data': share_data,
            'timestamp': datetime.utcnow().isoformat()
        }
        
        success_count = 0
        failed_users = []
        
        for to_user_id in to_user_ids:
            try:
                await self.send_personal_message(to_user_id, message)
                success_count += 1
            except Exception as e:
                failed_users.append(to_user_id)
                print(f"Failed to send to {to_user_id}: {str(e)}")
        
        # Send success/failure notification back to sender
        if success_count > 0:
            await self.send_personal_message(from_user_id, {
                'type': 'share_success',
                'message': f'Successfully shared with {success_count} Marvel hero{"s" if success_count > 1 else ""}!',
                'success_count': success_count
            })
        
        if failed_users:
            await self.send_personal_message(from_user_id, {
                'type': 'share_failed',
                'message': f'Failed to share with {len(failed_users)} user{"s" if len(failed_users) > 1 else ""}. Please try again.',
                'failed_count': len(failed_users)
            })

manager = ConnectionManager()

@app.websocket("/api/ws/{user_id}")
async def websocket_endpoint(websocket: WebSocket, user_id: str):
    await manager.connect(websocket, user_id)
    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            
            if message['type'] == 'webrtc_signal':
                await manager.send_webrtc_signal(
                    user_id, 
                    message['to_user_id'], 
                    message['signal_data']
                )
            elif message['type'] == 'share_notification':
                await manager.send_share_notification(
                    user_id,
                    message['to_user_ids'],
                    message['share_data']
                )
                
    except WebSocketDisconnect:
        manager.disconnect(user_id)
        await manager.broadcast_user_list()

@app.get("/api/health")
async def health_check():
    return {"status": "healthy", "service": "FlowShare P2P"}

@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    try:
        # Generate unique file ID
        file_id = str(uuid.uuid4())
        
        # Save file to disk
        file_path = UPLOAD_DIR / f"{file_id}_{file.filename}"
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        # Store file metadata in database
        file_doc = {
            "file_id": file_id,
            "filename": file.filename,
            "content_type": file.content_type,
            "size": file.size,
            "file_path": str(file_path),
            "uploaded_at": datetime.utcnow(),
            "expires_at": datetime.utcnow() + timedelta(hours=24)
        }
        
        await db.files.insert_one(file_doc)
        
        return {
            "file_id": file_id,
            "filename": file.filename,
            "size": file.size,
            "content_type": file.content_type,
            "type": "file"
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/download/{file_id}")
async def download_file(file_id: str):
    try:
        # Find file in database
        file_doc = await db.files.find_one({"file_id": file_id})
        
        if not file_doc:
            raise HTTPException(status_code=404, detail="File not found")
        
        # Check if file has expired
        if datetime.utcnow() > file_doc['expires_at']:
            raise HTTPException(status_code=410, detail="File has expired")
        
        file_path = Path(file_doc['file_path'])
        
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="File not found on disk")
        
        return FileResponse(
            path=file_path,
            filename=file_doc['filename'],
            media_type=file_doc['content_type']
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/create-text-share")
async def create_text_share(data: dict):
    try:
        # Generate unique text share ID
        share_id = str(uuid.uuid4())
        
        # Store text share in database
        text_doc = {
            "share_id": share_id,
            "content": data.get("content", ""),
            "title": data.get("title", "Shared Note"),
            "created_at": datetime.utcnow(),
            "expires_at": datetime.utcnow() + timedelta(hours=24)
        }
        
        await db.text_shares.insert_one(text_doc)
        
        return {
            "share_id": share_id,
            "title": text_doc["title"],
            "content": text_doc["content"],
            "type": "text"
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/text/{share_id}")
async def get_text_share(share_id: str):
    try:
        # Find text share in database
        text_doc = await db.text_shares.find_one({"share_id": share_id})
        
        if not text_doc:
            raise HTTPException(status_code=404, detail="Text share not found")
        
        # Check if text has expired
        if datetime.utcnow() > text_doc['expires_at']:
            raise HTTPException(status_code=410, detail="Text share has expired")
        
        return {
            "share_id": text_doc["share_id"],
            "title": text_doc["title"],
            "content": text_doc["content"],
            "created_at": text_doc["created_at"].isoformat()
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/active-users")
async def get_active_users():
    user_list = []
    for user_id, session in manager.user_sessions.items():
        user_list.append({
            'user_id': user_id,
            'character': session['character']
        })
    
    return {"users": user_list}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)