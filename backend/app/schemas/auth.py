from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, EmailStr


class UserRegister(BaseModel):
    email: str
    full_name: str
    password: str
    role: Optional[str] = "consumer"


class UserLogin(BaseModel):
    email: str
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserResponse(BaseModel):
    id: str
    email: str
    full_name: str
    role: str
    is_active: bool

    class Config:
        from_attributes = True
