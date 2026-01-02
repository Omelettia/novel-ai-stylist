from sqlalchemy import Column, String, Text, ForeignKey, DateTime, Integer, Boolean
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
import uuid
from datetime import datetime
from .database import Base

class User(Base):
    __tablename__ = "users"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    username = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    books = relationship("Book", back_populates="owner", cascade="all, delete-orphan")
    spells = relationship("Spell", back_populates="owner", cascade="all, delete-orphan")

class Book(Base):
    __tablename__ = "books"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    
    owner = relationship("User", back_populates="books")
    chapters = relationship("Chapter", back_populates="book", cascade="all, delete-orphan", order_by="Chapter.sequence_number")

class Chapter(Base):
    __tablename__ = "chapters"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title = Column(String)
    sequence_number = Column(Integer, default=0, index=True) 
    html_content = Column(Text) 
    style_manifest = Column(JSONB, default={}) # Fixed: named to match ChapterCreate.meta
    book_id = Column(UUID(as_uuid=True), ForeignKey("books.id"))
    
    book = relationship("Book", back_populates="chapters")
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class Spell(Base):
    __tablename__ = "spells"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String, nullable=False) 
    category = Column(String, default="General")
    css_code = Column(Text, nullable=False) 
    is_favorite = Column(Boolean, default=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    
    owner = relationship("User", back_populates="spells")