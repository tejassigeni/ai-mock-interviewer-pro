"""Test Gemini API key - try v1 endpoint and flash-lite model."""
import urllib.request
import json
import time

key = "AIzaSyCyYu_sYRx9flUZxBPKuY40dOVLVvmC3hg"

# Test with different models
models_to_test = [
    "gemini-2.0-flash-lite",
    "gemini-1.5-flash-8b",
]

for model_name in models_to_test:
    print(f"\n=== Testing {model_name} ===")
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={key}"
    payload = json.dumps({
        "contents": [{"parts": [{"text": "Say hi"}]}]
    }).encode()
    req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"})
    try:
        resp = urllib.request.urlopen(req)
        result = json.loads(resp.read())
        text = result["candidates"][0]["content"]["parts"][0]["text"]
        print(f"SUCCESS! Response: {text.strip()}")
        break
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        try:
            err = json.loads(body)
            msg = err.get("error", {}).get("message", "")[:200]
            print(f"HTTP {e.code}: {msg}")
        except:
            print(f"HTTP {e.code}: {body[:200]}")
    
    time.sleep(2)
