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
import asyncio

# --- SQLAlchemy Imports ---
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy import Column, String, Integer, DateTime, Text, select

app = FastAPI()

# --- MODIFIED: More robust CORS settings ---
# This explicitly allows both versions of your domain to prevent future issues.
origins = [
    "https://flowshare.me",
    "https://www.flowshare.me",
    "http://localhost:3000", # For local development
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# --- END MODIFIED ---

# --- SQLAlchemy Database Setup with URL Fix ---
DATABASE_URL = os.environ.get("DATABASE_URL")

if DATABASE_URL and DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://", 1)

engine = create_async_engine(DATABASE_URL)
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
Base = declarative_base()

# --- Database table models ---
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
    
# --- Background Cleanup Task ---
async def cleanup_expired_data():
    while True:
        await asyncio.sleep(600)  # Sleep for 10 minutes
        print("Running scheduled cleanup of expired data...")
        
        async with AsyncSessionLocal() as db:
            try:
                now = datetime.utcnow()
                
                # Find and delete expired files
                expired_files_query = select(FileStorage).where(FileStorage.expires_at < now)
                result_files = await db.execute(expired_files_query)
                expired_files = result_files.scalars().all()

                for file in expired_files:
                    try:
                        file_path = Path(file.file_path)
                        if file_path.exists():
                            os.remove(file_path)
                    except Exception as e:
                        print(f"Error deleting file {file.file_path} from disk: {e}")
                    
                    await db.delete(file)

                # Find and delete expired text shares
                expired_texts_query = select(TextShare).where(TextShare.expires_at < now)
                result_texts = await db.execute(expired_texts_query)
                expired_texts = result_texts.scalars().all()

                for text in expired_texts:
                    await db.delete(text)
                
                if expired_files or expired_texts:
                    await db.commit()
                    print(f"Cleanup complete. Removed {len(expired_files)} files and {len(expired_texts)} text shares.")
                else:
                    print("No expired data to clean up.")

            except Exception as e:
                print(f"An error occurred during scheduled cleanup: {e}")
                await db.rollback()

# --- startup function to launch cleanup task ---
@app.on_event("startup")
async def startup():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    asyncio.create_task(cleanup_expired_data())

# --- Dependency to get a database session ---
async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        yield session

# ... [Your MARVEL_CHARACTERS list and ConnectionManager class remain the same] ...
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
    # ... [Paste your existing ConnectionManager class code here, it does not need changes] ...
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
UPLOAD_DIR = Path("/tmp/flowshare_files")
UPLOAD_DIR.mkdir(exist_ok=True)

# ... [Your websocket endpoints and other routes] ...
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

# --- Upload endpoint with file size limit ---
@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...), db: AsyncSession = Depends(get_db)):
    try:
        # Check file size before doing anything else
        MAX_FILE_SIZE = 100 * 1024 * 1024  # 100 MB
        if file.size and file.size > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=413, 
                detail=f"File is too large ({round(file.size / (1024*1024), 2)} MB). Maximum size is 100MB."
            )

        file_id = str(uuid.uuid4())
        file_path = UPLOAD_DIR / f"{file_id}_{file.filename}"
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
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
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=str(e))

# ... [The rest of your endpoints: download, create_text_share, etc. remain the same] ...
@app.get("/api/download/{file_id}")
async def download_file(file_id: str, db: AsyncSession = Depends(get_db)):
    try:
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
