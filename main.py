import os
import json
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from google import genai
from dotenv import load_dotenv

load_dotenv()
client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
app = FastAPI()

app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

class StyleRequest(BaseModel):
    selected_text: str
    user_prompt: str

@app.post("/generate-style")
async def generate_style(request: StyleRequest):
    # Enhanced schema to include particles and extra effects
    response_schema = {
        "type": "OBJECT",
        "properties": {
            "css": {"type": "STRING", "description": "CSS rules for the className"},
            "className": {"type": "STRING", "description": "Unique CSS class name"},
            "particles": {"type": "STRING", "enum": ["none", "fire", "snow", "glitch", "void"], "description": "Ambient background effect"},
            "ambient_html": {"type": "STRING", "description": "Small HTML snippet for extra effects like a floating flame or dripping blood (use absolute positioning)"}
        },
        "required": ["css", "className", "particles", "ambient_html"]
    }

    prompt = (
        f"Design a visual experience for this novel text: '{request.selected_text}'. "
        f"Style goal: '{request.user_prompt}'. "
        "If the user mentions fire, set particles to 'fire'. If they mention spooky/digital, use 'glitch' or 'void'. "
        "The ambient_html can be a div with a unique class for absolute-positioned decorations."
    )
    
    response = client.models.generate_content(
        model='gemini-2.0-flash', 
        contents=prompt,
        config={"response_mime_type": "application/json", "response_schema": response_schema}
    )
    return json.loads(response.text)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)