import os
from dotenv import load_dotenv
load_dotenv()
import uuid
from typing import List, Optional, Dict
from jose import jwt, JWTError
from google import genai 
from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.responses import RedirectResponse


from . import models, schemas, auth, database

app = FastAPI()

# --- CONFIG ---
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
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
        existing.style_manifest = chapter.meta 
    else:
        new_chap = models.Chapter(
            id=chapter.id,
            title=chapter.title, 
            html_content=chapter.html,
            style_manifest=chapter.meta, 
            book_id=chapter.book_id,
            sequence_number=chapter.order
        )
        db.add(new_chap)
    db.commit()
    return {"status": "synced"}

@app.patch("/books/{book_id}", response_model=schemas.BookResponse)
def update_book(
    book_id: uuid.UUID, 
    book_update: schemas.BookCreate, 
    user=Depends(get_user), 
    db: Session = Depends(database.get_db)
):
    # 1. Verify the book exists and belongs to the current user
    book = db.query(models.Book).filter(
        models.Book.id == book_id, 
        models.Book.user_id == user.id
    ).first()
    
    if not book:
        raise HTTPException(status_code=404, detail="Book not found or unauthorized")
    
    # 2. Update the title
    book.title = book_update.title
    
    # 3. Commit changes to the database
    db.commit()
    db.refresh(book)
    
    return book

# --- DELETE ROUTES ---
@app.delete("/books/{book_id}")
def delete_book(book_id: uuid.UUID, user=Depends(get_user), db: Session = Depends(database.get_db)):
    book = db.query(models.Book).filter(models.Book.id == book_id, models.Book.user_id == user.id).first()
    if not book: raise HTTPException(status_code=404)
    db.delete(book)
    db.commit()
    return {"status": "deleted"}

@app.delete("/chapters/{chapter_id}")
def delete_chapter(chapter_id: uuid.UUID, user=Depends(get_user), db: Session = Depends(database.get_db)):
    # Verify ownership via the book
    chapter = db.query(models.Chapter).filter(models.Chapter.id == chapter_id).first()
    if not chapter: raise HTTPException(status_code=404)
    
    book = db.query(models.Book).filter(models.Book.id == chapter.book_id, models.Book.user_id == user.id).first()
    if not book: raise HTTPException(status_code=403)
    
    db.delete(chapter)
    db.commit()
    return {"status": "deleted"}

@app.post("/ai/spell")
async def ai_spell(req: schemas.StyleRequest, user=Depends(get_user)):
    # If current_css is provided, tell the AI to evolve it
    base_context = f"BASE STYLE TO EVOLVE: {req.current_css}" if req.current_css else "START FROM SCRATCH"
    
    prompt_text = f"""
    Act as a Narrative UI Architect. Your goal is to wrap text in a <span> with complex inline CSS.
    
    STRATEGY: {base_context}
    USER REQUEST: {req.user_prompt}
    TARGET TEXT: {req.selected_text}
    
    REQUIREMENTS:
    1. The page background is white (#f4f1ea), so ensure high contrast/readability.
    2. If a BASE STYLE is provided, treat it as the 'foundation' and modify it according to the USER REQUEST.
    3. Return ONLY the <span> snippet. No markdown, no backticks, no prose.
    """
    
    response = client.models.generate_content(
        model="gemini-2.5-flash", 
        contents=prompt_text
    )
    
    clean_html = response.text.strip().replace("```html", "").replace("```", "")
    return {"html": clean_html}

@app.get("/spells", response_model=List[schemas.SpellResponse])
def get_spells(user=Depends(get_user), db: Session = Depends(database.get_db)):
    """Retrieve all saved spells for the current user."""
    return db.query(models.Spell).filter(models.Spell.user_id == user.id).all()

@app.post("/spells", response_model=schemas.SpellResponse)
def save_spell(spell: schemas.SpellCreate, user=Depends(get_user), db: Session = Depends(database.get_db)):
    """Store a new AI-generated style in the user's Grimoire."""
    new_spell = models.Spell(
        name=spell.name,
        prompt=spell.prompt,
        category=spell.category,
        css_code=spell.css_code,
        is_favorite=spell.is_favorite,
        user_id=user.id
    )
    db.add(new_spell)
    db.commit()
    db.refresh(new_spell)
    return new_spell

@app.delete("/spells/{spell_id}")
def delete_spell(spell_id: uuid.UUID, user=Depends(get_user), db: Session = Depends(database.get_db)):
    """Remove a spell from the Grimoire."""
    spell = db.query(models.Spell).filter(models.Spell.id == spell_id, models.Spell.user_id == user.id).first()
    if not spell:
        raise HTTPException(status_code=404, detail="Spell not found")
    db.delete(spell)
    db.commit()
    return {"status": "forgotten"}

@app.patch("/spells/{spell_id}", response_model=schemas.SpellResponse)
def update_spell(
    spell_id: uuid.UUID, 
    spell_update: schemas.SpellCreate, 
    user=Depends(get_user), 
    db: Session = Depends(database.get_db)
):
    spell = db.query(models.Spell).filter(
        models.Spell.id == spell_id, 
        models.Spell.user_id == user.id
    ).first()
    
    if not spell:
        raise HTTPException(status_code=404, detail="Spell not found")
    
    spell.prompt = spell_update.prompt
    spell.css_code = spell_update.css_code
    spell.name = spell_update.name
    
    db.commit()
    db.refresh(spell)
    return spell

@app.post("/chapters/reorder")
def reorder(req: schemas.ChapterMoveRequest, db: Session = Depends(database.get_db)):
    for idx, chap_id in enumerate(req.ordered_ids):
        db.query(models.Chapter).filter(models.Chapter.id == chap_id).update({"sequence_number": idx})
    db.commit()
    return {"status": "ok"}

@app.get("/")
async def root():
    return RedirectResponse(url="/static/index.html")



script_dir = os.path.dirname(os.path.abspath(__file__))

static_path = os.path.join(os.path.dirname(script_dir), "static")

# Mount using the absolute path
app.mount("/static", StaticFiles(directory=static_path), name="static")