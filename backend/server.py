from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
import os
import json
import uuid
import random
from datetime import datetime, timedelta
from typing import Dict, List, AsyncGenerator
import shutil
from pathlib import Path

# --- NEW: SQLAlchemy Imports ---
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy import Column, String, Integer, DateTime, Text, select
# --- END NEW ---

app = FastAPI()

# --- MODIFIED: More secure CORS middleware ---
# It now reads the frontend URL from an environment variable
origins = [
    os.environ.get("FRONTEND_URL", "http://localhost:3000")
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# --- END MODIFIED ---

# --- NEW: SQLAlchemy Database Setup ---
DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql+asyncpg://user:password@localhost/db")

engine = create_async_engine(DATABASE_URL)
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
Base = declarative_base()

# --- NEW: Define database table models ---
class FileStorage(Base):
    __tablename__ = "files"
    id = Column(Integer, primary_key=True)
    file_id = Column(String, unique=True, index=True)
    filename = Column(String)
    content_type = Column(String)
    size = Column(Integer)
    file_path = Column(String)
    uploaded_at = Column(DateTime, default=datetime.utcnow)
    expires_at = Column(DateTime)

class TextShare(Base):
    __tablename__ = "text_shares"
    id = Column(Integer, primary_key=True)
    share_id = Column(String, unique=True, index=True)
    title = Column(String)
    content = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    expires_at = Column(DateTime)

# --- NEW: Function to create tables on startup ---
@app.on_event("startup")
async def startup():
    async with engine.begin() as conn:
        # This creates the tables if they don't exist.
        # For production, a migration tool like Alembic is recommended.
        await conn.run_sync(Base.metadata.create_all)

# --- NEW: Dependency to get a database session for each request ---
async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        yield session
# --- END NEW ---


# File storage directory (ephemeral on Render's free tier)
UPLOAD_DIR = Path("/tmp/flowshare_files")
UPLOAD_DIR.mkdir(exist_ok=True)

# (ConnectionManager and MARVEL_CHARACTERS code remains the same as before)
# ... [Paste your existing MARVEL_CHARACTERS list and ConnectionManager class here] ...

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
        
        available_characters = [char for char in MARVEL_CHARACTERS if char not in [session.get('character') for session in self.user_sessions.values()]]
        if not available_characters:
            available_characters = MARVEL_CHARACTERS
        
        character = random.choice(available_characters)
        
        self.user_sessions[user_id] = {
            'character': character,
            'connected_at': datetime.utcnow(),
            'websocket': websocket
        }
        
        await self.send_personal_message(user_id, {
            'type': 'character_assigned',
            'character': character,
            'user_id': user_id
        })
        
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
                self.disconnect(user_id)

    async def broadcast_user_list(self):
        user_list = [{'user_id': user_id, 'character': session['character']} for user_id, session in self.user_sessions.items()]
        message = {'type': 'user_list_update', 'users': user_list}
        
        disconnected_users = []
        for user_id, websocket in self.active_connections.items():
            try:
                await websocket.send_text(json.dumps(message))
            except:
                disconnected_users.append(user_id)
        
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
        message = {
            'type': 'incoming_share',
            'from_user_id': from_user_id,
            'from_character': from_character,
            'share_data': share_data,
            'timestamp': datetime.utcnow().isoformat()
        }
        
        success_count = 0
        for to_user_id in to_user_ids:
            try:
                await self.send_personal_message(to_user_id, message)
                success_count += 1
            except Exception as e:
                print(f"Failed to send to {to_user_id}: {str(e)}")
        
        if success_count > 0:
            await self.send_personal_message(from_user_id, {
                'type': 'share_success',
                'message': f'Successfully shared with {success_count} Marvel hero{"s" if success_count > 1 else ""}!',
                'success_count': success_count
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
                await manager.send_webrtc_signal(user_id, message['to_user_id'], message['signal_data'])
            elif message['type'] == 'share_notification':
                await manager.send_share_notification(user_id, message['to_user_ids'], message['share_data'])
    except WebSocketDisconnect:
        manager.disconnect(user_id)
        await manager.broadcast_user_list()

@app.get("/api/health")
async def health_check():
    return {"status": "healthy", "service": "FlowShare P2P"}

# --- MODIFIED: Endpoints now use SQLAlchemy session ---
@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...), db: AsyncSession = Depends(get_db)):
    try:
        file_id = str(uuid.uuid4())
        file_path = UPLOAD_DIR / f"{file_id}_{file.filename}"
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        # Create a new FileStorage object and add it to the database
        new_file = FileStorage(
            file_id=file_id,
            filename=file.filename,
            content_type=file.content_type,
            size=file.size,
            file_path=str(file_path),
            expires_at=datetime.utcnow() + timedelta(hours=24)
        )
        db.add(new_file)
        await db.commit()
        
        return {
            "file_id": file_id, "filename": file.filename, "size": file.size,
            "content_type": file.content_type, "type": "file"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/download/{file_id}")
async def download_file(file_id: str, db: AsyncSession = Depends(get_db)):
    try:
        # Query the database for the file
        query = select(FileStorage).where(FileStorage.file_id == file_id)
        result = await db.execute(query)
        file_doc = result.scalars().first()
        
        if not file_doc:
            raise HTTPException(status_code=404, detail="File not found")
        if datetime.utcnow() > file_doc.expires_at:
            raise HTTPException(status_code=410, detail="File has expired")
        
        file_path = Path(file_doc.file_path)
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="File not found on disk")
        
        return FileResponse(path=file_path, filename=file_doc.filename, media_type=file_doc.content_type)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/create-text-share")
async def create_text_share(data: dict, db: AsyncSession = Depends(get_db)):
    try:
        share_id = str(uuid.uuid4())
        
        new_text_share = TextShare(
            share_id=share_id,
            content=data.get("content", ""),
            title=data.get("title", "Shared Note"),
            expires_at=datetime.utcnow() + timedelta(hours=24)
        )
        db.add(new_text_share)
        await db.commit()
        
        return {
            "share_id": share_id, "title": new_text_share.title,
            "content": new_text_share.content, "type": "text"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/text/{share_id}")
async def get_text_share(share_id: str, db: AsyncSession = Depends(get_db)):
    try:
        query = select(TextShare).where(TextShare.share_id == share_id)
        result = await db.execute(query)
        text_doc = result.scalars().first()
        
        if not text_doc:
            raise HTTPException(status_code=404, detail="Text share not found")
        if datetime.utcnow() > text_doc.expires_at:
            raise HTTPException(status_code=410, detail="Text share has expired")
        
        return {
            "share_id": text_doc.share_id, "title": text_doc.title,
            "content": text_doc.content, "created_at": text_doc.created_at.isoformat()
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/active-users")
async def get_active_users():
    user_list = [{'user_id': user_id, 'character': session['character']} for user_id, session in manager.user_sessions.items()]
    return {"users": user_list}
# --- END MODIFIED ---
