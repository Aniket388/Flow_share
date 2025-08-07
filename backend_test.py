import requests
import sys
import json
import websocket
import threading
import time
from datetime import datetime
import io

class FlowShareAPITester:
    def __init__(self, base_url="https://4f09e062-d2ce-4a1f-abb1-9606789771ec.preview.emergentagent.com"):
        self.base_url = base_url
        self.tests_run = 0
        self.tests_passed = 0
        self.websocket_messages = []
        self.websocket_connected = False

    def run_test(self, name, method, endpoint, expected_status, data=None, files=None):
        """Run a single API test"""
        url = f"{self.base_url}/{endpoint}"
        headers = {'Content-Type': 'application/json'} if not files else {}

        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        print(f"   URL: {url}")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, timeout=10)
            elif method == 'POST':
                if files:
                    response = requests.post(url, files=files, timeout=10)
                else:
                    response = requests.post(url, json=data, headers=headers, timeout=10)

            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                try:
                    response_data = response.json()
                    print(f"   Response: {json.dumps(response_data, indent=2)}")
                    return True, response_data
                except:
                    print(f"   Response: {response.text}")
                    return True, response.text
            else:
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                print(f"   Response: {response.text}")
                return False, {}

        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            return False, {}

    def test_websocket_connection(self, user_id="test_user_123"):
        """Test WebSocket connection and Marvel character assignment"""
        print(f"\n🔍 Testing WebSocket Connection...")
        
        ws_url = self.base_url.replace('https', 'wss') + f"/api/ws/{user_id}"
        print(f"   WebSocket URL: {ws_url}")
        
        def on_message(ws, message):
            print(f"   📨 Received: {message}")
            self.websocket_messages.append(json.loads(message))
            
        def on_error(ws, error):
            print(f"   ❌ WebSocket Error: {error}")
            
        def on_close(ws, close_status_code, close_msg):
            print(f"   🔌 WebSocket Closed: {close_status_code} - {close_msg}")
            self.websocket_connected = False
            
        def on_open(ws):
            print(f"   ✅ WebSocket Connected")
            self.websocket_connected = True

        try:
            ws = websocket.WebSocketApp(ws_url,
                                      on_open=on_open,
                                      on_message=on_message,
                                      on_error=on_error,
                                      on_close=on_close)
            
            # Run WebSocket in a separate thread
            wst = threading.Thread(target=ws.run_forever)
            wst.daemon = True
            wst.start()
            
            # Wait for connection and messages
            time.sleep(3)
            
            if self.websocket_connected and len(self.websocket_messages) > 0:
                self.tests_passed += 1
                print(f"   ✅ WebSocket test passed - Received {len(self.websocket_messages)} messages")
                
                # Check for character assignment
                for msg in self.websocket_messages:
                    if msg.get('type') == 'character_assigned':
                        print(f"   🦸 Assigned Character: {msg.get('character')}")
                        break
                        
                ws.close()
                return True
            else:
                print(f"   ❌ WebSocket test failed - Connected: {self.websocket_connected}, Messages: {len(self.websocket_messages)}")
                ws.close()
                return False
                
        except Exception as e:
            print(f"   ❌ WebSocket test failed - Error: {str(e)}")
            return False
        finally:
            self.tests_run += 1

    def test_health_endpoint(self):
        """Test health check endpoint"""
        return self.run_test(
            "Health Check",
            "GET", 
            "api/health",
            200
        )

    def test_file_upload(self):
        """Test file upload endpoint"""
        # Create a test file
        test_content = b"This is a test file for FlowShare P2P Marvel Share"
        test_file = io.BytesIO(test_content)
        test_file.name = "test_marvel_file.txt"
        
        files = {'file': ('test_marvel_file.txt', test_file, 'text/plain')}
        
        success, response = self.run_test(
            "File Upload",
            "POST",
            "api/upload", 
            200,
            files=files
        )
        
        if success and isinstance(response, dict):
            expected_fields = ['file_id', 'filename', 'size', 'type']
            missing_fields = [field for field in expected_fields if field not in response]
            if missing_fields:
                print(f"   ⚠️  Missing response fields: {missing_fields}")
            else:
                print(f"   ✅ All expected fields present in response")
                
        return success, response

    def test_text_share(self):
        """Test text sharing endpoint"""
        test_data = {
            "content": "This is a test note from Iron Man to share with other Marvel heroes!",
            "title": "Test Marvel Note"
        }
        
        success, response = self.run_test(
            "Text Share Creation",
            "POST",
            "api/create-text-share",
            200,
            data=test_data
        )
        
        if success and isinstance(response, dict):
            expected_fields = ['share_id', 'title', 'content', 'type']
            missing_fields = [field for field in expected_fields if field not in response]
            if missing_fields:
                print(f"   ⚠️  Missing response fields: {missing_fields}")
            else:
                print(f"   ✅ All expected fields present in response")
                
        return success, response

    def test_active_users(self):
        """Test active users endpoint"""
        return self.run_test(
            "Active Users",
            "GET",
            "api/active-users",
            200
        )

def main():
    print("🚀 Starting FlowShare P2P Marvel Share Backend Tests")
    print("=" * 60)
    
    tester = FlowShareAPITester()
    
    # Test all endpoints
    print("\n📡 Testing API Endpoints...")
    
    # 1. Health check
    tester.test_health_endpoint()
    
    # 2. File upload
    tester.test_file_upload()
    
    # 3. Text sharing
    tester.test_text_share()
    
    # 4. Active users
    tester.test_active_users()
    
    # 5. WebSocket connection
    print("\n🔌 Testing WebSocket Connection...")
    tester.test_websocket_connection()
    
    # Print final results
    print("\n" + "=" * 60)
    print(f"📊 Final Results: {tester.tests_passed}/{tester.tests_run} tests passed")
    
    if tester.tests_passed == tester.tests_run:
        print("🎉 All backend tests passed!")
        return 0
    else:
        print(f"⚠️  {tester.tests_run - tester.tests_passed} tests failed")
        return 1

if __name__ == "__main__":
    sys.exit(main())