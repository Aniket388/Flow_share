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

# --- More robust CORS settings ---
origins = [
    "https://flowshare.me",
    "https://www.flowshare.me",
    "http://localhost:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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

# Marvel characters list
MARVEL_CHARACTERS = [
    "Iron Man", "Captain America", "Thor", "Hulk", "Black Widow", "Hawkeye", "Spider-Man", "Doctor Strange", "Scarlet Witch", "Captain Marvel", "Black Panther", "Falcon", "Winter Soldier", "Ant-Man", "Wasp", "Star-Lord", "Gamora", "Drax", "Rocket Raccoon", "Groot", "Nebula", "Loki", "Vision", "War Machine", "Quicksilver", "Shuri", "Okoye", "Valkyrie", "Miss Marvel", "She-Hulk", "Moon Knight", "Daredevil", "Jessica Jones", "Luke Cage", "Iron Fist", "Punisher", "Ghost Rider", "Wolverine", "Mr. Fantastic", "Black Bolt", "Cyclops", "Jean Grey", "Professor X", "Invisible Woman", "Silver Surfer", "Gambit", "Rogue", "Namor", "Blade", "Human Torch", "Storm", "The Thing", "Nova", "Nightcrawler", "Beast", "Cable", "Elektra", "Cloak", "Dagger", "Spider-Woman", "Colossus", "Psylocke", "Iceman", "Emma Frost", "Angel", "Domino", "Medusa", "Jubilee", "Kitty Pryde", "Miles Morales", "Magik", "Nick Fury", "Havok", "X-23", "Adam Warlock", "Sentry", "Red Hulk", "Wonder Man", "Spider-Gwen", "Songbird", "Goliath", "Hercules", "Dazzler", "Crystal", "Captain Britain", "Beta Ray Bill", "Anti-Venom", "Bishop", "Clea", "Firestar", "Lockjaw", "Agent Venom", "Polaris", "Black Knight", "White Tiger", "Elsa Bloodstone", "Ka-Zar", "Man-Thing", "Heimdall", "Lady Sif", "Mockingbird", "Odin", "Shang-Chi"
]

class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}
        self.user_sessions: Dict[str, dict] = {}

    async def connect(self, websocket: WebSocket, user_id: str):
        await websocket.accept()
        self.active_connections[user_id] = websocket
        character = random.choice([c for c in MARVEL_CHARACTERS if c not in [s.get('character') for s in self.user_sessions.values()]] or MARVEL_CHARACTERS)
        self.user_sessions[user_id] = {'character': character, 'websocket': websocket}
        await self.send_personal_message(user_id, {'type': 'character_assigned', 'character': character, 'user_id': user_id})
        await self.broadcast_user_list()

    def disconnect(self, user_id: str):
        if user_id in self.active_connections: del self.active_connections[user_id]
        if user_id in self.user_sessions: del self.user_sessions[user_id]

    async def send_personal_message(self, user_id: str, message: dict):
        if user_id in self.active_connections:
            try:
                await self.active_connections[user_id].send_text(json.dumps(message))
            except:
                self.disconnect(user_id)

    async def broadcast_user_list(self):
        user_list = [{'user_id': uid, 'character': session['character']} for uid, session in self.user_sessions.items()]
        message = {'type': 'user_list_update', 'users': user_list}
        connections = list(self.active_connections.items())
        for user_id, websocket in connections:
            try:
                await websocket.send_text(json.dumps(message))
            except:
                self.disconnect(user_id)

    async def send_share_notification(self, from_user_id: str, to_user_ids: List[str], share_data: dict):
        from_character = self.user_sessions.get(from_user_id, {}).get('character', 'Unknown')
        message = {'type': 'incoming_share', 'from_user_id': from_user_id, 'from_character': from_character, 'share_data': share_data, 'timestamp': datetime.utcnow().isoformat()}
        success_count = 0
        for to_user_id in to_user_ids:
            if to_user_id in self.active_connections:
                await self.send_personal_message(to_user_id, message)
                success_count += 1
        if success_count > 0:
            await self.send_personal_message(from_user_id, {'type': 'share_success', 'message': f'Successfully shared with {success_count} hero{"s" if success_count > 1 else ""}!', 'success_count': success_count})

    async def send_private_message(self, from_user_id: str, to_user_id: str, content: str):
        from_character = self.user_sessions.get(from_user_id, {}).get('character', 'Unknown')
        message = {'type': 'private_message', 'from_user_id': from_user_id, 'to_user_id': to_user_id, 'from_character': from_character, 'content': content, 'timestamp': datetime.utcnow().isoformat()}
        if to_user_id in self.active_connections: await self.send_personal_message(to_user_id, message)
        if from_user_id in self.active_connections: await self.send_personal_message(from_user_id, message)

    async def handle_chat_request(self, from_user_id: str, to_user_id: str):
        from_character = self.user_sessions.get(from_user_id, {}).get('character', 'Unknown')
        message = {'type': 'chat_request', 'from_user_id': from_user_id, 'from_character': from_character}
        if to_user_id in self.active_connections: await self.send_personal_message(to_user_id, message)
    
    async def handle_chat_response(self, from_user_id: str, to_user_id: str, response_type: str):
        from_character = self.user_sessions.get(from_user_id, {}).get('character', 'Unknown')
        message = {'type': response_type, 'from_user_id': from_user_id, 'from_character': from_character}
        if to_user_id in self.active_connections: await self.send_personal_message(to_user_id, message)

manager = ConnectionManager()
UPLOAD_DIR = Path("/tmp/flowshare_files")
UPLOAD_DIR.mkdir(exist_ok=True)

# MODIFIED: Corrected the WebSocket endpoint logic
@app.websocket("/api/ws/{user_id}")
async def websocket_endpoint(websocket: WebSocket, user_id: str):
    await manager.connect(websocket, user_id)
    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            
            msg_type = message.get("type")

            if msg_type == 'share_notification':
                await manager.send_share_notification(user_id, message.get('to_user_ids', []), message.get('share_data', {}))
            elif msg_type == 'private_message':
                await manager.send_private_message(user_id, message.get('to_user_id'), message.get('content'))
            elif msg_type == 'chat_request':
                await manager.handle_chat_request(user_id, message.get('to_user_id'))
            elif msg_type in ['chat_accept', 'chat_decline']:
                await manager.handle_chat_response(user_id, message.get('to_user_id'), msg_type)

    except WebSocketDisconnect:
        pass # The finally block will handle cleanup
    finally:
        manager.disconnect(user_id)
        await manager.broadcast_user_list()

@app.api_route("/api/health", methods=["GET", "HEAD"])
async def health_check(): return {"status": "healthy", "service": "FlowShare"}

# All other endpoints (upload, download, etc.) remain unchanged
@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...), db: AsyncSession = Depends(get_db)):
    try:
        MAX_FILE_SIZE = 100 * 1024 * 1024
        if file.size and file.size > MAX_FILE_SIZE:
            raise HTTPException(status_code=413, detail=f"File is too large. Maximum size is 100MB.")
        file_id = str(uuid.uuid4())
        file_path = UPLOAD_DIR / f"{file_id}_{file.filename}"
        with open(file_path, "wb") as buffer: shutil.copyfileobj(file.file, buffer)
        new_file = FileStorage(file_id=file_id, filename=file.filename, content_type=file.content_type, size=file.size, file_path=str(file_path), expires_at=datetime.utcnow() + timedelta(minutes=30))
        db.add(new_file)
        await db.commit()
        return {"file_id": file_id, "filename": file.filename, "size": file.size, "content_type": file.content_type, "type": "file"}
    except Exception as e:
        if isinstance(e, HTTPException): raise e
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/download/{file_id}")
async def download_file(file_id: str, db: AsyncSession = Depends(get_db)):
    try:
        query = select(FileStorage).where(FileStorage.file_id == file_id)
        result = await db.execute(query)
        file_doc = result.scalars().first()
        if not file_doc: raise HTTPException(status_code=404, detail="File not found")
        if datetime.utcnow() > file_doc.expires_at: raise HTTPException(status_code=410, detail="File has expired")
        file_path = Path(file_doc.file_path)
        if not file_path.exists(): raise HTTPException(status_code=404, detail="File not found on disk")
        return FileResponse(path=file_path, filename=file_doc.filename, media_type=file_doc.content_type)
    except HTTPException: raise
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/create-text-share")
async def create_text_share(data: dict, db: AsyncSession = Depends(get_db)):
    try:
        share_id = str(uuid.uuid4())
        new_text_share = TextShare(share_id=share_id, content=data.get("content", ""), title=data.get("title", "Shared Note"), expires_at=datetime.utcnow() + timedelta(minutes=30))
        db.add(new_text_share)
        await db.commit()
        return {"share_id": share_id, "title": new_text_share.title, "content": new_text_share.content, "type": "text"}
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/text/{share_id}")
async def get_text_share(share_id: str, db: AsyncSession = Depends(get_db)):
    try:
        query = select(TextShare).where(TextShare.share_id == share_id)
        result = await db.execute(query)
        text_doc = result.scalars().first()
        if not text_doc: raise HTTPException(status_code=404, detail="Text share not found")
        if datetime.utcnow() > text_doc.expires_at: raise HTTPException(status_code=410, detail="Text share has expired")
        return {"share_id": text_doc.share_id, "title": text_doc.title, "content": text_doc.content, "created_at": text_doc.created_at.isoformat()}
    except HTTPException: raise
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/active-users")
async def get_active_users():
    return [{'user_id': uid, 'character': s['character']} for uid, s in manager.user_sessions.items()]
