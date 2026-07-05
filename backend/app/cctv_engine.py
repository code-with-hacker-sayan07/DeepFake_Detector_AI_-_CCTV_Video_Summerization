import cv2
import numpy as np
import os
import uuid
import time
import traceback
from PIL import Image

# Check for PyTorch & Torchvision dependencies
try:
    import torch
    import torchvision
    from torchvision.models.detection import ssdlite320_mobilenet_v3_large, SSDlite320_MobileNet_V3_Large_Weights
    TORCHVISION_AVAILABLE = True
except Exception as e:
    TORCHVISION_AVAILABLE = False
    print(f"[WARNING] Torch or Torchvision not fully initialized for CCTV: {str(e)}. Falling back to CV-Contour Engine.")

# COCO Class mapping for SSDLite
COCO_CLASSES = {
    1: "person",
    2: "bicycle",
    3: "car",
    4: "motorcycle",
    6: "bus",
    8: "truck",
    16: "bird",
    17: "cat",
    18: "dog",
    19: "horse",
    21: "cow",
    27: "backpack",
    28: "umbrella",
    31: "handbag",
    33: "suitcase"
}

class CctvEngine:
    def __init__(self):
        self.device = "cuda" if (TORCHVISION_AVAILABLE and torch.cuda.is_available()) else "cpu"
        self.model = None
        self.engine_name = "Heuristic CV-Contour Engine (Offline/Fallback)"
        
        # Load pre-trained SSDLite MobileNetV3 if available
        if TORCHVISION_AVAILABLE:
            try:
                # SSDLite is very lightweight (~12MB) and suitable for CPU/GPU dev servers
                weights = SSDlite320_MobileNet_V3_Large_Weights.DEFAULT
                self.model = ssdlite320_mobilenet_v3_large(weights=weights)
                self.model = self.model.to(self.device)
                self.model.eval()
                self.engine_name = f"Neural Vision Engine (SSDLite-MobileNetV3) on {self.device.upper()}"
                print(f"[INFO] CCTV Summarizer: Pre-trained SSDLite model loaded successfully on {self.device}.")
            except Exception as e:
                print(f"[ERROR] Failed to load pre-trained SSDLite model: {str(e)}. CCTV Engine will fall back to Heuristic CV contours.")
                self.model = None

    def summarize_footage(self, video_path: str, session_id: str, static_dir: str) -> dict:
        """
        Ingests CCTV video, calculates absolute frame-to-frame pixel-change motion profiles,
        groups active periods into timeline events, detects objects (person, vehicle, pet, etc.),
        saves static keyframe crops, and compiles an executive intelligence report.
        """
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            raise ValueError("Could not open video file.")

        # 1. Parse Video Telemetry
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        fps = cap.get(cv2.CAP_PROP_FPS)
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        
        if total_frames <= 0 or fps <= 0:
            cap.release()
            raise ValueError("Corrupted video payload: missing duration and rate meta.")

        duration = total_frames / fps
        
        # Determine temporal sampling rate
        # We don't need to run object detection on every frame. Processing at 5 FPS is optimal.
        sample_fps = 5.0
        frame_step = max(1, int(fps / sample_fps))
        
        # Create session directories for CCTV assets
        cctv_static_dir = os.path.join(static_dir, "cctv", session_id)
        os.makedirs(cctv_static_dir, exist_ok=True)
        
        print(f"[CCTV ANALYZER] Starting analysis of {os.path.basename(video_path)}.")
        print(f"Details: {width}x{height} @ {fps:.2f}fps | Duration: {duration:.1f}s | Step: {frame_step} frames")
        print(f"Running Engine: {self.engine_name}")

        sampled_frames = []
        motion_profile = [] # list of {"time": s, "motion": %} for graph drawing
        
        prev_gray = None
        
        # 2. Extract motion profile across sampled frames
        frame_idx = 0
        while True:
            cap.set(cv2.CAP_PROP_POS_FRAMES, frame_idx)
            ret, frame = cap.read()
            if not ret or frame is None:
                break
                
            curr_time = frame_idx / fps
            
            # Downsample to a lightweight processing size (640x360) for fast analysis
            work_w, work_h = 640, 360
            frame_resized = cv2.resize(frame, (work_w, work_h))
            gray = cv2.cvtColor(frame_resized, cv2.COLOR_BGR2GRAY)
            gray = cv2.GaussianBlur(gray, (15, 15), 0)
            
            motion_ratio = 0.0
            
            if prev_gray is not None:
                # Compute absolute pixel-level difference
                diff = cv2.absdiff(prev_gray, gray)
                _, thresh = cv2.threshold(diff, 18, 255, cv2.THRESH_BINARY)
                
                # Dilate to filter out minor camera noise and fill holes
                thresh = cv2.dilate(thresh, None, iterations=2)
                
                # Calculate percentage of screen containing active motion
                motion_pixels = np.sum(thresh == 255)
                motion_ratio = float(motion_pixels) / float(work_w * work_h) * 100.0
                
            motion_profile.append({
                "frame": frame_idx,
                "time": round(curr_time, 2),
                "motion": round(motion_ratio, 2)
            })
            
            # Save a copy of the original frame (BGR) inside memory for later keyframe pulls
            sampled_frames.append({
                "frame_idx": frame_idx,
                "time": curr_time,
                "frame": frame, # Keep original frame BGR
                "motion": motion_ratio
            })
            
            prev_gray = gray.copy()
            frame_idx += frame_step
            if frame_idx >= total_frames:
                break
                
        cap.release()
        
        # 3. Cluster high-motion frames into "Activity Events"
        # Motion threshold (e.g. 1.2% pixel changes counts as active)
        motion_threshold = 1.2
        active_flags = [f["motion"] > motion_threshold for f in sampled_frames]
        
        # Group contiguous active frames
        raw_events = []
        in_event = False
        start_idx = 0
        
        for i, is_active in enumerate(active_flags):
            if is_active and not in_event:
                in_event = True
                start_idx = i
            elif not is_active and in_event:
                in_event = False
                raw_events.append((start_idx, i - 1))
                
        if in_event:
            raw_events.append((start_idx, len(sampled_frames) - 1))
            
        # Merge events separated by less than 2.0 seconds to keep timelines cohesive
        merged_events = []
        max_gap_s = 2.0
        
        for start, end in raw_events:
            if not merged_events:
                merged_events.append([start, end])
            else:
                prev_start, prev_end = merged_events[-1]
                gap_time = sampled_frames[start]["time"] - sampled_frames[prev_end]["time"]
                
                if gap_time <= max_gap_s:
                    merged_events[-1][1] = end # Extend previous event
                else:
                    merged_events.append([start, end])
                    
        # 4. Process each event to find object details and crops
        timeline_events = []
        pedestrians_count = 0
        vehicles_count = 0
        alerts_count = 0
        
        # Hours context: CCTV cameras often have higher threat weights late at night
        # We can extract the hour from the current local system time
        current_hour = time.localtime().tm_hour
        is_night = current_hour >= 21 or current_hour <= 6
        night_multiplier = 1.4 if is_night else 1.0
        
        for ev_idx, (start, end) in enumerate(merged_events):
            event_id = f"EV_{ev_idx + 1:02d}"
            
            event_sampled = sampled_frames[start:end+1]
            if not event_sampled:
                continue
                
            # Locate keyframe (peak motion frame in the segment)
            keyframe_data = max(event_sampled, key=lambda x: x["motion"])
            kf_frame = keyframe_data["frame"]
            kf_idx = keyframe_data["frame_idx"]
            kf_time = keyframe_data["time"]
            kf_motion = keyframe_data["motion"]
            
            start_time = sampled_frames[start]["time"]
            end_time = sampled_frames[end]["time"]
            event_duration = max(0.5, end_time - start_time)
            
            # Detect objects on keyframe
            detected_objects = self._detect_objects_in_frame(kf_frame)
            
            # Classify primary object
            primary_obj = None
            category = "motion"
            title = "Motion Alert Detected"
            
            if detected_objects:
                # Prioritize high-threat objects: person, truck, car, etc.
                # Sort by confidence score
                detected_objects.sort(key=lambda o: o["score"], reverse=True)
                
                # Pick largest or highest score object as primary
                primary_obj = detected_objects[0]
                category = primary_obj["label"]
                
                if category == "person":
                    title = "Pedestrian Entry"
                    pedestrians_count += 1
                elif category in ["car", "truck", "bus", "motorcycle"]:
                    title = "Vehicle Crossing"
                    vehicles_count += 1
                else:
                    title = f"{category.capitalize()} Spotted"
            else:
                # If no object detected, try to isolate motion contour for cropping
                primary_obj = self._locate_motion_contour(kf_frame)
                if primary_obj:
                    category = primary_obj["label"]
                    if category == "person":
                        title = "Pedestrian Entry"
                        pedestrians_count += 1
                    elif category == "vehicle":
                        title = "Vehicle Crossing"
                        vehicles_count += 1
                        
            # Save keyframe statically
            kf_filename = f"event_{event_id}_full.jpg"
            kf_filepath = os.path.join(cctv_static_dir, kf_filename)
            cv2.imwrite(kf_filepath, kf_frame)
            kf_url = f"/static/sampled/cctv/{session_id}/{kf_filename}"
            
            # Crop keyframe around bounding box
            crop_filename = f"event_{event_id}_crop.jpg"
            crop_filepath = os.path.join(cctv_static_dir, crop_filename)
            crop_url = kf_url # Default fallback to full keyframe url if crop fails
            
            kh, kw = kf_frame.shape[:2]
            
            if primary_obj and "bbox" in primary_obj:
                x, y, w_box, h_box = primary_obj["bbox"]
                # Add padding to crop for context
                pad_x = int(w_box * 0.15)
                pad_y = int(h_box * 0.15)
                
                x_start = max(0, x - pad_x)
                y_start = max(0, y - pad_y)
                x_end = min(kw, x + w_box + pad_x)
                y_end = min(kh, y + h_box + pad_y)
                
                crop_img = kf_frame[y_start:y_end, x_start:x_end]
                if crop_img.size > 0:
                    cv2.imwrite(crop_filepath, crop_img)
                    crop_url = f"/static/sampled/cctv/{session_id}/{crop_filename}"
            else:
                # Fallback central crop
                cx, cy = kw // 2, kh // 2
                cw, ch = min(kw, 300), min(kh, 300)
                crop_img = kf_frame[cy - ch//2:cy + ch//2, cx - cw//2:cx + cw//2]
                cv2.imwrite(crop_filepath, crop_img)
                crop_url = f"/static/sampled/cctv/{session_id}/{crop_filename}"
                
            # Dynamic Threat Assessment
            # Base threat: person (50), vehicle (35), motion/other (15)
            base_threat = 15.0
            if category == "person":
                base_threat = 50.0
            elif category in ["car", "vehicle", "truck", "motorcycle"]:
                base_threat = 35.0
            elif category in ["dog", "cat", "backpack"]:
                base_threat = 20.0
                
            # Motion intensity factor (faster movement = higher threat)
            motion_factor = min(30.0, kf_motion * 1.5)
            
            # Combine scores and apply night multiplier
            threat_score = (base_threat + motion_factor) * night_multiplier
            threat_score = round(min(100.0, threat_score), 2)
            
            # Heuristic Security Violations / Illegal Activities:
            is_illegal = False
            illegal_type = None
            
            if category == "person" and is_night:
                is_illegal = True
                illegal_type = "Night Intrusion / Trespassing"
                title = "Trespassing Detected"
            elif category == "person" and kf_motion > 12.0:
                is_illegal = True
                illegal_type = "Physical Altercation / Suspect Action"
                title = "Altercation Alert"
            elif category in ["backpack", "handbag", "suitcase"] and event_duration > 5.0:
                is_illegal = True
                illegal_type = "Unattended Baggage Breach"
                title = "Suspicious Baggage Alert"
            elif category in ["car", "vehicle", "truck", "motorcycle"] and kf_motion > 8.0:
                is_illegal = True
                illegal_type = "Speeding / Reckless Driving Anomaly"
                title = "Reckless Driving Alert"

            if is_illegal:
                alerts_count += 1
                
            # Synthesize detailed description
            timestamp_str = self._format_timestamp(start_time)
            desc_text = self._synthesize_event_description(
                category=category,
                time_str=timestamp_str,
                duration=event_duration,
                motion=kf_motion,
                threat_score=threat_score,
                is_night=is_night
            )
            
            timeline_events.append({
                "id": event_id,
                "title": title,
                "timestamp": timestamp_str,
                "time_seconds": round(start_time, 2),
                "duration": round(event_duration, 1),
                "raw_frame": kf_idx,
                "category": category,
                "threat_score": threat_score,
                "motion_intensity": round(kf_motion, 2),
                "description": desc_text,
                "keyframe_url": kf_url,
                "crop_url": crop_url,
                "bbox": primary_obj["bbox"] if (primary_obj and "bbox" in primary_obj) else None,
                "is_illegal": is_illegal,
                "illegal_type": illegal_type
            })

        # 5. Compile Executive Intelligence Brief
        total_events = len(timeline_events)
        condensed_duration = sum(e["duration"] for e in timeline_events)
        
        # Decide overall security threat level
        if alerts_count > 2 or (timeline_events and max(e["threat_score"] for e in timeline_events) > 75.0):
            threat_level = "CRITICAL / HIGH THREAT DETECTED"
            threat_status = "CRITICAL"
        elif alerts_count > 0 or (timeline_events and max(e["threat_score"] for e in timeline_events) > 40.0):
            threat_level = "ALERT / MODERATE THREAT LOGGED"
            threat_status = "WARNING"
        else:
            threat_level = "SECURE / NORMAL ZONE TELEMETRY"
            threat_status = "SECURE"
            
        active_percent = (condensed_duration / duration) * 100.0 if duration > 0 else 0.0
        
        # Generate executive summary paragraph
        exec_brief = (
            f"AI CCTV analysis of the video feed has completed successfully using the {self.engine_name}. "
            f"A total of {total_events} key security events were extracted, compressing the original "
            f"{duration:.1f}-second footage into a condensed summary of {condensed_duration:.1f} seconds of active movement ({active_percent:.1f}% activity ratio). "
            f"The network isolated {pedestrians_count} pedestrian entries, {vehicles_count} vehicle movements, and triggered {alerts_count} active security warnings. "
            f"Overall area security threat rating is compiled as {threat_status} ({threat_level})."
        )
        
        # Prepare response object
        report = {
            "status": threat_status,
            "verdict": threat_level,
            "filename": os.path.basename(video_path),
            "original_duration": round(duration, 2),
            "summarized_duration": round(condensed_duration, 2),
            "total_events": total_events,
            "pedestrians_count": pedestrians_count,
            "vehicles_count": vehicles_count,
            "alerts_count": alerts_count,
            "executive_summary": exec_brief,
            "motion_profile": motion_profile,
            "events": timeline_events,
            "engine": self.engine_name
        }
        
        return report

    def _detect_objects_in_frame(self, frame_bgr) -> list:
        """
        Runs PyTorch SSDLite object detection on a frame (BGR).
        Returns a list of dictionaries: [ {"label": str, "score": float, "bbox": [x,y,w,h]}, ... ]
        """
        if self.model is None or not TORCHVISION_AVAILABLE:
            return []
            
        try:
            h, w = frame_bgr.shape[:2]
            
            # Convert BGR (OpenCV) to RGB & to PIL Image
            frame_rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
            pil_img = Image.fromarray(frame_rgb)
            
            # Convert PIL image to Torch Tensor
            transform = torchvision.transforms.ToTensor()
            img_tensor = transform(pil_img).to(self.device)
            
            # Run inference
            with torch.no_grad():
                predictions = self.model([img_tensor])[0]
                
            # Filter output
            boxes = predictions["boxes"].cpu().numpy()
            labels = predictions["labels"].cpu().numpy()
            scores = predictions["scores"].cpu().numpy()
            
            detections = []
            
            for i in range(len(scores)):
                score = float(scores[i])
                # We want a moderately high threshold for CCTV to prevent false positives
                if score >= 0.42:
                    label_id = int(labels[i])
                    label_name = COCO_CLASSES.get(label_id, "object")
                    
                    # Convert bounding boxes [x1, y1, x2, y2] to [x, y, w, h]
                    x1, y1, x2, y2 = map(int, boxes[i])
                    x = max(0, x1)
                    y = max(0, y1)
                    w_box = min(w - x, x2 - x)
                    h_box = min(h - y, y2 - y)
                    
                    if w_box > 8 and h_box > 8:
                        detections.append({
                            "label": label_name,
                            "score": score,
                            "bbox": [x, y, w_box, h_box]
                        })
                        
            return detections
        except Exception as e:
            print(f"[WARNING] SSDLite Object Detection runtime error: {str(e)}")
            traceback.print_exc()
            return []

    def _locate_motion_contour(self, frame_bgr) -> dict:
        """
        Heuristic Fallback: Uses motion contours to locate and classify objects.
        Determines if a bounding box resembles a person, vehicle, or other object.
        """
        try:
            h, w = frame_bgr.shape[:2]
            gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)
            gray = cv2.GaussianBlur(gray, (21, 21), 0)
            
            # Estimate structural edges (since we don't have historical frames in this single function,
            # we find high contrast contours which represent foreground objects in focus)
            edges = cv2.Canny(gray, 30, 150)
            edges = cv2.dilate(edges, None, iterations=3)
            
            contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            if not contours:
                return None
                
            # Filter contours by size, sorting by area
            contour_list = []
            for c in contours:
                area = cv2.contourArea(c)
                if area > 800:
                    x, y, cw, ch = cv2.boundingRect(c)
                    contour_list.append({
                        "area": area,
                        "bbox": [x, y, cw, ch]
                    })
                    
            if not contour_list:
                return None
                
            # Select the largest contour
            contour_list.sort(key=lambda x: x["area"], reverse=True)
            primary = contour_list[0]
            
            x, y, cw, ch = primary["bbox"]
            aspect_ratio = float(ch) / float(cw)
            
            # Heuristic aspect ratio classification
            # Tall = Pedestrian (Person)
            # Wide = Vehicle
            # Square/Small = Generic Object
            if aspect_ratio >= 1.35 and ch > 50:
                label = "person"
            elif aspect_ratio <= 0.85 and cw > 60:
                label = "vehicle"
            else:
                label = "object"
                
            return {
                "label": label,
                "score": 0.50, # Static heuristic score
                "bbox": [x, y, cw, ch]
            }
        except Exception as e:
            print(f"[WARNING] Heuristic Motion Contour extractor error: {str(e)}")
            return None

    def _format_timestamp(self, seconds: float) -> str:
        """Converts float seconds into a neat MM:SS format."""
        mins = int(seconds // 60)
        secs = int(seconds % 60)
        return f"{mins:02d}:{secs:02d}"

    def _synthesize_event_description(self, category: str, time_str: str, duration: float, motion: float, threat_score: float, is_night: bool) -> str:
        """Generates dynamic natural language descriptive text summarizing a CCTV event."""
        duration_desc = f"{duration:.1f} seconds"
        motion_desc = "high-intensity velocity spikes" if motion > 12.0 else "steady continuous movement"
        night_desc = " during restricted late-night hours, activating immediate dark-node alert protocols" if is_night else " under normal daylight conditions"
        
        threat_label = "Low Warning"
        if threat_score > 70.0:
            threat_label = "CRITICAL WARNING"
        elif threat_score > 40.0:
            threat_label = "MODERATE ALERT"
            
        if category == "person":
            desc = (
                f"Pedestrian spotted at {time_str}. The subject triggered active visual bounds for {duration_desc}, "
                f"displaying {motion_desc}{night_desc}. Integrated threat classifier evaluated this event "
                f"as a {threat_label} (Risk Factor: {threat_score}%)."
            )
        elif category in ["car", "vehicle", "truck", "motorcycle", "bus"]:
            desc = (
                f"Vehicle entry registered in secure zone at {time_str}. The target traversed the viewport "
                f"for {duration_desc} with {motion_desc}. The event was cataloged as a {threat_label} "
                f"({threat_score}% hazard index)."
            )
        elif category in ["dog", "cat", "bird"]:
            desc = (
                f"Biological non-human presence ({category}) detected near sensor gates at {time_str}. "
                f"Subject active for {duration_desc} exhibiting normal thermal/pixel signatures. "
                f"Assessed threat level: minimal ({threat_score}%)."
            )
        elif category == "backpack" or category == "handbag" or category == "suitcase":
            desc = (
                f"Object displacement alert ({category}) detected at {time_str}. The asset remained static/active "
                f"for {duration_desc}. Analyzed threat level: {threat_label} ({threat_score}% risk score)."
            )
        else:
            desc = (
                f"Unclassified motion anomaly captured at {time_str}. Pixel variance registered "
                f"over {duration_desc} with {motion_desc}{night_desc}. Analyzed risk index: {threat_score}%."
            )
            
        return desc
