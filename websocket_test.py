#!/usr/bin/env python3

import asyncio
import websockets
import json
import uuid
from datetime import datetime

class MultiUserWebSocketTest:
    def __init__(self, base_url="wss://4f09e062-d2ce-4a1f-abb1-9606789771ec.preview.emergentagent.com"):
        self.base_url = base_url
        self.connections = {}
        self.user_data = {}

    async def connect_user(self, user_name):
        """Connect a single user and maintain the connection"""
        user_id = f"test_{user_name}_{int(datetime.now().timestamp())}"
        ws_url = f"{self.base_url}/api/ws/{user_id}"
        
        print(f"🔌 Connecting {user_name} to {ws_url}")
        
        try:
            websocket = await websockets.connect(ws_url)
            self.connections[user_name] = websocket
            self.user_data[user_name] = {"user_id": user_id, "character": None}
            
            print(f"✅ {user_name} connected successfully")
            
            # Listen for messages
            async for message in websocket:
                data = json.loads(message)
                await self.handle_message(user_name, data)
                
        except Exception as e:
            print(f"❌ {user_name} connection failed: {str(e)}")

    async def handle_message(self, user_name, message):
        """Handle incoming WebSocket messages"""
        msg_type = message.get('type')
        
        if msg_type == 'character_assigned':
            character = message.get('character')
            self.user_data[user_name]['character'] = character
            print(f"🦸 {user_name} assigned character: {character}")
            
        elif msg_type == 'user_list_update':
            users = message.get('users', [])
            print(f"👥 {user_name} sees {len(users)} users: {[u.get('character') for u in users]}")
            
        elif msg_type == 'incoming_share':
            from_char = message.get('from_character')
            share_type = message.get('share_data', {}).get('type')
            print(f"📨 {user_name} received {share_type} from {from_char}")
            
        else:
            print(f"📩 {user_name} received: {message}")

    async def send_share_notification(self, from_user, to_users, share_data):
        """Send a share notification from one user to others"""
        if from_user not in self.connections:
            print(f"❌ {from_user} not connected")
            return
            
        to_user_ids = []
        for to_user in to_users:
            if to_user in self.user_data:
                to_user_ids.append(self.user_data[to_user]['user_id'])
        
        message = {
            'type': 'share_notification',
            'to_user_ids': to_user_ids,
            'share_data': share_data
        }
        
        try:
            await self.connections[from_user].send(json.dumps(message))
            print(f"📤 {from_user} sent share to {to_users}")
        except Exception as e:
            print(f"❌ Failed to send share: {str(e)}")

    async def run_multi_user_test(self):
        """Run the multi-user P2P test"""
        print("🚀 Starting Multi-User WebSocket P2P Test")
        print("=" * 50)
        
        # Create tasks for multiple users
        users = ["IronMan", "CaptainAmerica", "Thor"]
        tasks = []
        
        for user in users:
            task = asyncio.create_task(self.connect_user(user))
            tasks.append(task)
        
        # Wait a bit for connections to establish
        await asyncio.sleep(2)
        
        print(f"\n📊 Connection Status:")
        for user in users:
            if user in self.connections:
                print(f"   ✅ {user}: Connected as {self.user_data[user].get('character', 'Unknown')}")
            else:
                print(f"   ❌ {user}: Not connected")
        
        # Wait for user discovery
        print(f"\n⏱️  Waiting 5 seconds for user discovery...")
        await asyncio.sleep(5)
        
        # Test sharing between users
        if len(self.connections) >= 2:
            print(f"\n📝 Testing P2P sharing...")
            
            share_data = {
                "type": "text",
                "title": "Test Share",
                "content": "Hello from Iron Man to other Marvel heroes!"
            }
            
            from_user = list(self.connections.keys())[0]
            to_users = list(self.connections.keys())[1:]
            
            await self.send_share_notification(from_user, to_users, share_data)
            
            # Wait for share to be processed
            await asyncio.sleep(2)
        
        print(f"\n✅ Multi-user test completed")
        
        # Keep connections alive for a bit longer
        print(f"🔄 Keeping connections alive for 10 more seconds...")
        await asyncio.sleep(10)
        
        # Close all connections
        for user, websocket in self.connections.items():
            await websocket.close()
            print(f"🔌 {user} disconnected")

async def main():
    tester = MultiUserWebSocketTest()
    await tester.run_multi_user_test()

if __name__ == "__main__":
    asyncio.run(main())