import os

class Settings:
    APP_NAME: str = "Deepfake and AI Anomaly Forensics Server"
    
    # Path to the base directory of the backend
    BASE_DIR: str = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    UPLOAD_DIR: str = os.path.join(BASE_DIR, "uploads")
    
    MAX_FILE_SIZE_MB: int = 50
    MAX_FILE_SIZE_BYTES: int = 50 * 1024 * 1024
    
    ALLOWED_EXTENSIONS: set = {"mp4", "avi", "mov", "jpeg", "jpg", "png"}
    ALLOWED_MIME_TYPES: set = {
        "video/mp4", 
        "video/x-msvideo", 
        "video/quicktime", 
        "image/jpeg", 
        "image/png"
    }
    FRAMES_TO_SAMPLE: int = 30

settings = Settings()

# Ensure uploads folder exists
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
