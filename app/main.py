import os
import uuid
from typing import List, Optional, Dict
from jose import jwt, JWTError
from google import genai 
from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm

from . import models, schemas, auth, database

app = FastAPI()

# --- CONFIG ---
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "YOUR_GEMINI_API_KEY")
client = genai.Client(api_key=GEMINI_API_KEY)

app.add_middleware(
    CORSMiddleware, 
    allow_origins=["*"], 
    allow_methods=["*"], 
    allow_headers=["*"]
)

models.Base.metadata.create_all(bind=database.engine)
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")

# --- AUTH DEPENDENCY ---
async def get_user(token: str = Depends(oauth2_scheme), db: Session = Depends(database.get_db)):
    try:
        payload = jwt.decode(
            token, 
            os.getenv("SECRET_KEY", "your-secret-key"), 
            algorithms=[os.getenv("ALGORITHM", "HS256")]
        )
        username: str = payload.get("sub")
        if username is None:
            raise HTTPException(status_code=401, detail="Invalid token")
        user = db.query(models.User).filter(models.User.username == username).first()
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except JWTError:
        raise HTTPException(status_code=401, detail="Could not validate credentials")

# --- ROUTES ---

@app.post("/signup")
def signup(user: schemas.UserCreate, db: Session = Depends(database.get_db)):
    if db.query(models.User).filter(models.User.username == user.username).first():
        raise HTTPException(status_code=400, detail="Username taken")
    
    new_user = models.User(username=user.username, hashed_password=auth.hash_password(user.password))
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    # Create Default Book for New User
    default_book = models.Book(title="My First Journal", user_id=new_user.id)
    db.add(default_book)
    db.commit()
    return {"message": "Success"}

@app.post("/login", response_model=schemas.Token)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(database.get_db)):
    user = db.query(models.User).filter(models.User.username == form_data.username).first()
    if not user or not auth.verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Incorrect credentials")
    access_token = auth.create_access_token(data={"sub": user.username})
    return {"access_token": access_token, "token_type": "bearer"}

@app.get("/books", response_model=List[schemas.BookResponse])
def get_books(user=Depends(get_user), db: Session = Depends(database.get_db)):
    return db.query(models.Book).filter(models.Book.user_id == user.id).all()

@app.post("/books", response_model=schemas.BookResponse)
def create_book(book: schemas.BookCreate, user=Depends(get_user), db: Session = Depends(database.get_db)):
    new_book = models.Book(title=book.title, user_id=user.id)
    db.add(new_book)
    db.commit()
    db.refresh(new_book)
    return new_book

@app.post("/chapters/save")
def save_chapter(chapter: schemas.ChapterCreate, user=Depends(get_user), db: Session = Depends(database.get_db)):
    book = db.query(models.Book).filter(models.Book.id == chapter.book_id, models.Book.user_id == user.id).first()
    if not book:
        raise HTTPException(status_code=403, detail="Unauthorized access to this book")

    existing = db.query(models.Chapter).filter(models.Chapter.id == chapter.id).first()
    if existing:
        existing.title = chapter.title
        existing.html_content = chapter.html
        existing.style_manifest = chapter.meta # Fixed keyword
    else:
        new_chap = models.Chapter(
            id=chapter.id,
            title=chapter.title, 
            html_content=chapter.html,
            style_manifest=chapter.meta, # Fixed keyword
            book_id=chapter.book_id,
            sequence_number=chapter.order
        )
        db.add(new_chap)
    db.commit()
    return {"status": "synced"}

@app.post("/ai/spell")
async def ai_spell(req: schemas.StyleRequest, user=Depends(get_user)):
    prompt_text = f"""
    Act as a Narrative UI Architect. Wrap the following text in a <span> with complex inline CSS.
    CONTEXT: {req.current_css}
    PROMPT: {req.user_prompt}
    TEXT: {req.selected_text}
    Return ONLY the <span> snippet. No markdown blocks or backticks.
    """
    
    response = client.models.generate_content(
        model="gemini-2.5-flash", 
        contents=prompt_text
    )
    
    clean_html = response.text.strip().replace("```html", "").replace("```", "")
    return {"html": clean_html}

@app.post("/chapters/reorder")
def reorder(req: schemas.ChapterMoveRequest, db: Session = Depends(database.get_db)):
    for idx, chap_id in enumerate(req.ordered_ids):
        db.query(models.Chapter).filter(models.Chapter.id == chap_id).update({"sequence_number": idx})
    db.commit()
    return {"status": "ok"}

# Static files mounted LAST to avoid route conflicts
app.mount("/static", StaticFiles(directory="static"), name="static")