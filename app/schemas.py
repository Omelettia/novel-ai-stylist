from pydantic import BaseModel, ConfigDict
from typing import Optional, Dict, List
from uuid import UUID

class UserCreate(BaseModel):
    username: str
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str

class ChapterCreate(BaseModel):
    id: UUID
    title: str
    html: str
    meta: Dict 
    book_id: UUID
    order: int

class ChapterResponse(BaseModel):
    id: UUID
    title: str
    sequence_number: int
    html_content: str
    style_manifest: Dict
    model_config = ConfigDict(from_attributes=True)

class BookCreate(BaseModel):
    title: str
    description: Optional[str] = None

class BookResponse(BaseModel):
    id: UUID
    title: str
    chapters: List[ChapterResponse] = []
    model_config = ConfigDict(from_attributes=True)

class StyleRequest(BaseModel):
    selected_text: str
    user_prompt: str
    current_css: Optional[str] = ""

class ChapterMoveRequest(BaseModel):
    ordered_ids: List[UUID]

class SpellCreate(BaseModel):
    name: str
    prompt: Optional[str] = None 
    css_code: str
    category: Optional[str] = "General"
    is_favorite: bool = False

class SpellResponse(BaseModel):
    id: UUID
    name: str
    prompt: Optional[str] 
    css_code: str
    category: str
    is_favorite: bool
    model_config = ConfigDict(from_attributes=True)