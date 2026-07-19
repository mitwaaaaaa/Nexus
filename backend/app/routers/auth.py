from fastapi import APIRouter, Depends, HTTPException, status, Response, Cookie
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from datetime import timedelta
from typing import Optional

from app.core.database import get_db
from app.core.security import (
    get_password_hash, verify_password, create_access_token, 
    create_refresh_token, decode_token
)
from app.core.config import settings
from app.schemas.all_schemas import (
    UserRegister, UserLogin, UserResponse, UserUpdate, Token, ForgotPassword, ResetPassword
)
from app.repositories.all_repositories import UserRepository, ActivityRepository
from app.models.all_models import User

router = APIRouter(prefix="/api/auth", tags=["auth"])
security = HTTPBearer(auto_error=False)

def get_current_user(
    token: Optional[str] = Cookie(None),
    auth: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: Session = Depends(get_db)
):
    """Dependency to retrieve the current logged-in user from Cookie or Authorization header."""
    actual_token = token
    if not actual_token and auth:
        actual_token = auth.credentials

    if not actual_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication credentials were not provided."
        )
    
    payload = decode_token(actual_token)
    user_id = payload.get("sub")
    token_type = payload.get("type")
    
    if not user_id or token_type != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials."
        )
        
    user = UserRepository.get_by_id(db, user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found."
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account is deactivated."
        )
    return user

@router.post("/register", response_model=UserResponse)
def register(user_in: UserRegister, db: Session = Depends(get_db)):
    db_user = UserRepository.get_by_email(db, user_in.email)
    if db_user:
        raise HTTPException(
            status_code=400,
            detail="A user with this email already exists."
        )
    hashed_pwd = get_password_hash(user_in.password)
    user = UserRepository.create(
        db, 
        email=user_in.email, 
        hashed_password=hashed_pwd, 
        full_name=user_in.full_name
    )
    ActivityRepository.log(db, user.id, "register", f"User registered: {user.email}")
    return user

@router.post("/login")
def login(response: Response, user_in: UserLogin, db: Session = Depends(get_db)):
    user = UserRepository.get_by_email(db, user_in.email)
    if not user or not verify_password(user_in.password, user.hashed_password):
        raise HTTPException(
            status_code=401,
            detail="Incorrect email or password."
        )
    
    access_token = create_access_token(user.id)
    refresh_token = create_refresh_token(user.id)
    
    is_prod = settings.ENVIRONMENT == "production"
    response.set_cookie(
        key="token",
        value=access_token,
        httponly=True,
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        samesite="none" if is_prod else "lax",
        secure=is_prod
    )
    
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60,
        samesite="none" if is_prod else "lax",
        secure=is_prod
    )
    
    ActivityRepository.log(db, user.id, "login", "User logged in successfully")
    return {
        "user": {
            "id": user.id,
            "email": user.email,
            "full_name": user.full_name,
            "is_admin": user.is_admin
        },
        "access_token": access_token,
        "refresh_token": refresh_token
    }

@router.post("/logout")
def logout(response: Response, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    response.delete_cookie("token")
    response.delete_cookie("refresh_token")
    ActivityRepository.log(db, current_user.id, "logout", "User logged out")
    return {"message": "Logged out successfully"}

@router.post("/refresh")
def refresh_token(response: Response, refresh_token: Optional[str] = Cookie(None), db: Session = Depends(get_db)):
    if not refresh_token:
        raise HTTPException(status_code=401, detail="Refresh token missing")
        
    payload = decode_token(refresh_token)
    user_id = payload.get("sub")
    token_type = payload.get("type")
    
    if not user_id or token_type != "refresh":
        raise HTTPException(status_code=401, detail="Invalid refresh token")
        
    user = UserRepository.get_by_id(db, user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User deactivated or not found")
        
    access_token = create_access_token(user.id)
    
    is_prod = settings.ENVIRONMENT == "production"
    response.set_cookie(
        key="token",
        value=access_token,
        httponly=True,
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        samesite="none" if is_prod else "lax",
        secure=is_prod
    )
    
    return {"access_token": access_token}

@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    return current_user

@router.put("/me", response_model=UserResponse)
def update_me(user_in: UserUpdate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    updated_user = UserRepository.update(db, current_user, user_in.model_dump(exclude_unset=True))
    ActivityRepository.log(db, current_user.id, "update_profile", "Updated profile settings")
    return updated_user

@router.post("/forgot-password")
def forgot_password(form: ForgotPassword, db: Session = Depends(get_db)):
    user = UserRepository.get_by_email(db, form.email)
    if not user:
        # Avoid user enumeration by returning 200 anyway
        return {"message": "If the email exists, a password reset link has been simulated."}
    
    # In production, send email reset token
    return {"message": "Password reset link simulated successfully.", "reset_token": "mock_reset_token_xyz"}

@router.post("/reset-password")
def reset_password(form: ResetPassword, db: Session = Depends(get_db)):
    # Simple simulation for reset
    if form.token == "mock_reset_token_xyz":
        return {"message": "Password has been reset successfully."}
    raise HTTPException(status_code=400, detail="Invalid reset token.")

@router.post("/verify-email")
def verify_email(db: Session = Depends(get_db)):
    return {"message": "Email verified successfully."}
