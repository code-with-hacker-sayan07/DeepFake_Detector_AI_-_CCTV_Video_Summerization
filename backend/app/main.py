from fastapi import FastAPI, UploadFile, File, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import os
import shutil
import uuid
import cv2
import numpy as np
import traceback
from typing import List, Dict, Any, Optional

from .config import settings
from .forensic_engine import ForensicEngine
from .cctv_engine import CctvEngine

app = FastAPI(
    title=settings.APP_NAME,
    description="ASynchronous Deepfake, GAN, and Diffusion Generative Anomaly Detection Server."
)

# Enable CORS for the React development server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, restrict this to specific domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Ensure static directories exist
STATIC_DIR = os.path.join(settings.BASE_DIR, "static")
SAMPLED_DIR = os.path.join(STATIC_DIR, "sampled")
os.makedirs(SAMPLED_DIR, exist_ok=True)

# Mount static folder so frontend can access the extracted frame previews
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

# Mount frontend production assets if built
from fastapi.responses import FileResponse

DIST_DIR = os.path.join(settings.BASE_DIR, "..", "frontend", "dist")
if os.path.exists(DIST_DIR):
    app.mount("/assets", StaticFiles(directory=os.path.join(DIST_DIR, "assets")), name="assets")
    
    @app.get("/")
    async def serve_index():
        return FileResponse(os.path.join(DIST_DIR, "index.html"))


# Instantiate our Multi-Dimensional Forensic Engine
forensic_engine = ForensicEngine()
cctv_engine = CctvEngine()

# Response Models
class CctvEvent(BaseModel):
    id: str
    title: str
    timestamp: str
    time_seconds: float
    duration: float
    raw_frame: int
    category: str
    threat_score: float
    motion_intensity: float
    description: str
    keyframe_url: str
    crop_url: str
    bbox: Optional[List[int]] = None
    is_illegal: bool = False
    illegal_type: Optional[str] = None

class MotionPoint(BaseModel):
    frame: int
    time: float
    motion: float

class CctvSummaryReport(BaseModel):
    status: str
    verdict: str
    filename: str
    original_duration: float
    summarized_duration: float
    total_events: int
    pedestrians_count: int
    vehicles_count: int
    alerts_count: int
    executive_summary: str
    motion_profile: List[MotionPoint]
    events: List[CctvEvent]
    engine: str

class ForensicDetail(BaseModel):
    spatial_score: float
    spectral_score: float
    temporal_score: float

class FaceAnomaly(BaseModel):
    bbox: List[int] # [x, y, w, h]
    spatial_score: float
    spectral_score: float
    heatmap: List[List[float]] # 10x10 grid of cell anomalies

class FrameReport(BaseModel):
    index: int
    url: str
    faces_detected: int
    faces: List[FaceAnomaly]
    temporal_score: float

class AnalysisReport(BaseModel):
    status: str
    filename: str
    media_type: str
    frames_count: int
    confidence_score: float
    verdict: str
    summary: ForensicDetail
    frames: List[FrameReport]

def cleanup_old_sessions(directory: str, max_sessions: int = 15):
    """
    Cleans up old static session folders to prevent storage leaks.
    """
    try:
        subdirs = [os.path.join(directory, d) for d in os.listdir(directory)]
        subdirs = [d for d in subdirs if os.path.isdir(d)]
        
        if len(subdirs) > max_sessions:
            # Sort by creation time (oldest first)
            subdirs.sort(key=os.path.getctime)
            for old_dir in subdirs[:-max_sessions]:
                shutil.rmtree(old_dir, ignore_errors=True)
                print(f"[CLEANUP] Removed old forensic directory: {old_dir}")
    except Exception as e:
        print(f"[CLEANUP ERROR] Failed to clean old directories: {str(e)}")

@app.get("/api/health")
async def health_check():
    return {
        "status": "healthy",
        "engine": "pyTorch/OpenCV Fallback Enabled",
        "cuda_available": forensic_engine.device == "cuda"
    }

@app.post("/api/detect", response_model=AnalysisReport)
async def detect_anomaly(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...)
):
    # 1. Input Validation (Size & Extension)
    filename = file.filename
    ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else ""
    
    if ext not in settings.ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file extension '.{ext}'. Whitelisted formats: {', '.join(settings.ALLOWED_EXTENSIONS)}"
        )
    
    # Read a tiny chunk first to verify file size constraints
    # Keep reading and check total length
    content_len = 0
    temp_filename = f"{uuid.uuid4()}_{filename}"
    filepath = os.path.join(settings.UPLOAD_DIR, temp_filename)
    
    try:
        with open(filepath, "wb") as buffer:
            while chunk := await file.read(8192):
                content_len += len(chunk)
                if content_len > settings.MAX_FILE_SIZE_BYTES:
                    raise HTTPException(
                        status_code=413,
                        detail=f"File exceeds maximum allowed size of {settings.MAX_FILE_SIZE_MB}MB."
                    )
                buffer.write(chunk)
    except HTTPException:
        # Re-raise size constraint HTTPException
        if os.path.exists(filepath):
            os.remove(filepath)
        raise
    except Exception as e:
        if os.path.exists(filepath):
            os.remove(filepath)
        raise HTTPException(status_code=500, detail=f"File save failure: {str(e)}")

    # Create session for visual static frames
    session_id = str(uuid.uuid4())
    session_dir = os.path.join(SAMPLED_DIR, session_id)
    os.makedirs(session_dir, exist_ok=True)
    
    # Register session cleanups in background
    background_tasks.add_task(cleanup_old_sessions, SAMPLED_DIR)

    # Determine if Upload is an Image or Video
    is_image = ext in {"jpeg", "jpg", "png"}
    media_type = "image" if is_image else "video"
    
    frames_processed: List[FrameReport] = []
    
    # Variables for Ensemble Summarization
    all_spatial_scores = []
    all_spectral_scores = []
    all_temporal_scores = []
    
    # ================= IMAGE PIPELINE =================
    if is_image:
        try:
            frame_bgr = cv2.imread(filepath)
            if frame_bgr is None:
                raise ValueError("Could not read or parse uploaded image.")
            
            # Detect faces
            faces_bbox = forensic_engine.detect_faces(frame_bgr)
            faces_details: List[FaceAnomaly] = []
            
            # Analyze image crop
            if len(faces_bbox) > 0:
                for box in faces_bbox:
                    x, y, w, h = box
                    crop = frame_bgr[y:y+h, x:x+w]
                    
                    spatial_score = forensic_engine.analyze_spatial_artifacts(crop)
                    spectral_score, heatmap = forensic_engine.analyze_frequency_anomalies(crop)
                    
                    # Blend with Deep Learning PyTorch classifier prediction if active
                    dl_score = forensic_engine.predict_deep_learning_score(crop)
                    if dl_score is not None:
                        spatial_score = 0.60 * dl_score + 0.40 * spatial_score
                        spectral_score = 0.60 * dl_score + 0.40 * spectral_score
                        print(f"[DL FORENSICS] Face crop anomaly score: {dl_score:.2f}% (Blended -> Spatial: {spatial_score:.2f}%, Spectral: {spectral_score:.2f}%)")
                    
                    faces_details.append(FaceAnomaly(
                        bbox=box,
                        spatial_score=round(spatial_score, 2),
                        spectral_score=round(spectral_score, 2),
                        heatmap=heatmap
                    ))
                    
                    all_spatial_scores.append(spatial_score)
                    all_spectral_scores.append(spectral_score)
            else:
                # Run whole-image FFT/spatial anomalies if zero faces are found
                # This ensures the dashboard still highlights fake textures (e.g. landscapes)
                spatial_score = forensic_engine.analyze_spatial_artifacts(frame_bgr)
                spectral_score, heatmap = forensic_engine.analyze_frequency_anomalies(frame_bgr)
                
                # Blend with Deep Learning PyTorch classifier prediction if active
                dl_score = forensic_engine.predict_deep_learning_score(frame_bgr)
                if dl_score is not None:
                    spatial_score = 0.60 * dl_score + 0.40 * spatial_score
                    spectral_score = 0.60 * dl_score + 0.40 * spectral_score
                    print(f"[DL FORENSICS] Full-image anomaly score: {dl_score:.2f}% (Blended -> Spatial: {spatial_score:.2f}%, Spectral: {spectral_score:.2f}%)")
                
                faces_details.append(FaceAnomaly(
                    bbox=[0, 0, frame_bgr.shape[1], frame_bgr.shape[0]],
                    spatial_score=round(spatial_score, 2),
                    spectral_score=round(spectral_score, 2),
                    heatmap=heatmap
                ))
                all_spatial_scores.append(spatial_score)
                all_spectral_scores.append(spectral_score)
            
            # Save the frame image statically
            static_frame_path = os.path.join(session_dir, "frame_00.jpg")
            # Resize image if excessively large to keep bandwidth light
            h, w = frame_bgr.shape[:2]
            if w > 1200:
                scale = 1200.0 / w
                frame_bgr = cv2.resize(frame_bgr, (1200, int(h * scale)))
            cv2.imwrite(static_frame_path, frame_bgr)
            
            frame_url = f"/static/sampled/{session_id}/frame_00.jpg"
            
            frames_processed.append(FrameReport(
                index=0,
                url=frame_url,
                faces_detected=len(faces_bbox),
                faces=faces_details,
                temporal_score=0.0
            ))
            
            all_temporal_scores.append(0.0)
            
        except Exception as e:
            traceback.print_exc()
            if os.path.exists(filepath):
                os.remove(filepath)
            raise HTTPException(status_code=500, detail=f"Image decoding exception: {str(e)}")
            
    # ================= VIDEO PIPELINE =================
    else:
        cap = cv2.VideoCapture(filepath)
        try:
            total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
            fps = cap.get(cv2.CAP_PROP_FPS)
            
            if total_frames <= 0 or np.isnan(fps) or fps <= 0:
                raise ValueError("Corrupted video payload: zero frames or missing metadata.")
            
            # Uniformly sample exactly 30 frames across the video duration
            sampled_indices = np.linspace(0, total_frames - 1, settings.FRAMES_TO_SAMPLE, dtype=int)
            
            prev_face_crop = None
            
            for idx, frame_idx in enumerate(sampled_indices):
                cap.set(cv2.CAP_PROP_POS_FRAMES, int(frame_idx))
                ret, frame_bgr = cap.read()
                if not ret:
                    break
                
                # Resize frame to a uniform light weight size for bandwidth and processing efficiency
                fh, fw = frame_bgr.shape[:2]
                if fw > 960:
                    scale = 960.0 / fw
                    frame_bgr = cv2.resize(frame_bgr, (960, int(fh * scale)))
                    fh, fw = frame_bgr.shape[:2]
                
                # Save static frame image
                static_filename = f"frame_{idx:02d}.jpg"
                static_frame_path = os.path.join(session_dir, static_filename)
                cv2.imwrite(static_frame_path, frame_bgr)
                frame_url = f"/static/sampled/{session_id}/{static_filename}"
                
                # Detect faces
                faces_bbox = forensic_engine.detect_faces(frame_bgr)
                faces_details = []
                
                # Temporal processing variables
                temporal_score = 0.0
                curr_face_crop = None
                
                if len(faces_bbox) > 0:
                    # Target the largest detected face
                    faces_bbox.sort(key=lambda b: b[2] * b[3], reverse=True)
                    
                    for f_idx, box in enumerate(faces_bbox):
                        x, y, w, h = box
                        # Slice face crop
                        crop = frame_bgr[y:y+h, x:x+w]
                        
                        spatial_score = forensic_engine.analyze_spatial_artifacts(crop)
                        spectral_score, heatmap = forensic_engine.analyze_frequency_anomalies(crop)
                        
                        # Blend with Deep Learning PyTorch classifier prediction if active
                        dl_score = forensic_engine.predict_deep_learning_score(crop)
                        if dl_score is not None:
                            spatial_score = 0.60 * dl_score + 0.40 * spatial_score
                            spectral_score = 0.60 * dl_score + 0.40 * spectral_score
                        
                        faces_details.append(FaceAnomaly(
                            bbox=box,
                            spatial_score=round(spatial_score, 2),
                            spectral_score=round(spectral_score, 2),
                            heatmap=heatmap
                        ))
                        
                        # Accumulate metrics
                        all_spatial_scores.append(spatial_score)
                        all_spectral_scores.append(spectral_score)
                        
                        # Use the primary/largest face crop to run spatiotemporal optical flow
                        if f_idx == 0:
                            curr_face_crop = crop
                else:
                    # Fallback to whole frame FFT/spatial
                    spatial_score = forensic_engine.analyze_spatial_artifacts(frame_bgr)
                    spectral_score, heatmap = forensic_engine.analyze_frequency_anomalies(frame_bgr)
                    
                    # Blend with Deep Learning PyTorch classifier prediction if active
                    dl_score = forensic_engine.predict_deep_learning_score(frame_bgr)
                    if dl_score is not None:
                        spatial_score = 0.60 * dl_score + 0.40 * spatial_score
                        spectral_score = 0.60 * dl_score + 0.40 * spectral_score
                    
                    faces_details.append(FaceAnomaly(
                        bbox=[0, 0, fw, fh],
                        spatial_score=round(spatial_score, 2),
                        spectral_score=round(spectral_score, 2),
                        heatmap=heatmap
                    ))
                    
                    all_spatial_scores.append(spatial_score)
                    all_spectral_scores.append(spectral_score)
                    curr_face_crop = frame_bgr
                
                # Compute temporal optical flow jump
                if idx > 0 and prev_face_crop is not None and curr_face_crop is not None:
                    temporal_score = forensic_engine.analyze_temporal_flow(prev_face_crop, curr_face_crop)
                    all_temporal_scores.append(temporal_score)
                else:
                    temporal_score = 0.0
                
                prev_face_crop = curr_face_crop
                
                frames_processed.append(FrameReport(
                    index=idx,
                    url=frame_url,
                    faces_detected=len(faces_bbox),
                    faces=faces_details,
                    temporal_score=round(temporal_score, 2)
                ))
                
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=f"Video frame ingestion pipeline crash: {str(e)}")
        finally:
            cap.release()
            
    # Remove the uploaded payload file from local temp folder to keep storage light
    if os.path.exists(filepath):
        os.remove(filepath)

    # 3. Compile Combined Metrics & Assemble Ensemble Score
    avg_spatial = float(np.mean(all_spatial_scores)) if len(all_spatial_scores) > 0 else 0.0
    avg_spectral = float(np.mean(all_spectral_scores)) if len(all_spectral_scores) > 0 else 0.0
    avg_temporal = float(np.mean(all_temporal_scores)) if len(all_temporal_scores) > 0 else 0.0
    
    # Video vs Image ensemble weights
    if is_image:
        confidence_score = 0.50 * avg_spatial + 0.50 * avg_spectral
    else:
        confidence_score = 0.35 * avg_spatial + 0.40 * avg_spectral + 0.25 * avg_temporal
        
    confidence_score = round(confidence_score, 2)
    
    # Determine Verdict and Threshold labels
    if confidence_score > 60.0:
        verdict = "COMPROMISED / DEEPFAKE DETECTED"
        status = "COMPROMISED"
    elif confidence_score > 40.0:
        verdict = "SUSPICIOUS / AI ANOMALIES DETECTED"
        status = "SUSPICIOUS"
    else:
        verdict = "AUTHENTIC / REAL RECORDING"
        status = "AUTHENTIC"

    return AnalysisReport(
        status=status,
        filename=filename,
        media_type=media_type,
        frames_count=len(frames_processed),
        confidence_score=confidence_score,
        verdict=verdict,
        summary=ForensicDetail(
            spatial_score=round(avg_spatial, 2),
            spectral_score=round(avg_spectral, 2),
            temporal_score=round(avg_temporal, 2)
        ),
        frames=frames_processed
    )


@app.post("/api/cctv/summarize", response_model=CctvSummaryReport)
async def cctv_summarize(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...)
):
    # 1. Input Validation
    filename = file.filename
    ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else ""
    
    # CCTV video whitelisted formats
    cctv_extensions = {"mp4", "avi", "mov", "mkv"}
    if ext not in cctv_extensions:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file extension '.{ext}'. Whitelisted CCTV formats: {', '.join(cctv_extensions)}"
        )
        
    temp_filename = f"cctv_{uuid.uuid4()}_{filename}"
    filepath = os.path.join(settings.UPLOAD_DIR, temp_filename)
    
    # Save uploaded file
    content_len = 0
    try:
        with open(filepath, "wb") as buffer:
            while chunk := await file.read(8192):
                content_len += len(chunk)
                if content_len > settings.MAX_FILE_SIZE_BYTES:
                    raise HTTPException(
                        status_code=413,
                        detail=f"File exceeds maximum allowed size of {settings.MAX_FILE_SIZE_MB}MB."
                    )
                buffer.write(chunk)
    except HTTPException:
        if os.path.exists(filepath):
            os.remove(filepath)
        raise
    except Exception as e:
        if os.path.exists(filepath):
            os.remove(filepath)
        raise HTTPException(status_code=500, detail=f"CCTV file upload failure: {str(e)}")
        
    # Generate unique session ID for static resources
    session_id = str(uuid.uuid4())
    
    # Add cleanups to background tasks
    background_tasks.add_task(cleanup_old_sessions, os.path.join(SAMPLED_DIR, "cctv"), max_sessions=10)
    
    try:
        # Run CCTV Summarizer Engine
        report_dict = cctv_engine.summarize_footage(
            video_path=filepath,
            session_id=session_id,
            static_dir=SAMPLED_DIR
        )
        return CctvSummaryReport(**report_dict)
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"CCTV Ingestion Summarizer pipeline crashed: {str(e)}")
    finally:
        # Always remove temporary uploaded video
        if os.path.exists(filepath):
            os.remove(filepath)

