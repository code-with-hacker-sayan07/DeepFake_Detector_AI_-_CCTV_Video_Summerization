import cv2
import numpy as np
from PIL import Image
import os
import traceback

# Optional imports for PyTorch & MTCNN
try:
    import torch
    import torch.nn as nn
    from facenet_pytorch import MTCNN
    TORCH_AVAILABLE = True
except Exception:
    TORCH_AVAILABLE = False

if TORCH_AVAILABLE:
    class DeepfakeClassifier(nn.Module):
        def __init__(self):
            super(DeepfakeClassifier, self).__init__()
            self.features = nn.Sequential(
                # Block 1: Input 3x224x224 -> Output 32x112x112
                nn.Conv2d(3, 32, kernel_size=3, padding=1),
                nn.BatchNorm2d(32),
                nn.ReLU(),
                nn.MaxPool2d(2, 2),
                
                # Block 2: 32x112x112 -> 64x56x56
                nn.Conv2d(32, 64, kernel_size=3, padding=1),
                nn.BatchNorm2d(64),
                nn.ReLU(),
                nn.MaxPool2d(2, 2),
                
                # Block 3: 64x56x56 -> 128x28x28
                nn.Conv2d(64, 128, kernel_size=3, padding=1),
                nn.BatchNorm2d(128),
                nn.ReLU(),
                nn.MaxPool2d(2, 2),
                
                # Block 4: 128x28x28 -> 256x14x14
                nn.Conv2d(128, 256, kernel_size=3, padding=1),
                nn.BatchNorm2d(256),
                nn.ReLU(),
                nn.MaxPool2d(2, 2),
            )
            self.classifier = nn.Sequential(
                nn.AdaptiveAvgPool2d((1, 1)),
                nn.Flatten(),
                nn.Dropout(0.4),
                nn.Linear(256, 128),
                nn.ReLU(),
                nn.Dropout(0.2),
                nn.Linear(128, 2) # [real_prob, fake_prob]
            )

        def forward(self, x):
            x = self.features(x)
            x = self.classifier(x)
            return x

class ForensicEngine:
    def __init__(self):
        self.device = "cuda" if (TORCH_AVAILABLE and torch.cuda.is_available()) else "cpu"
        self.mtcnn = None
        
        # Attempt to initialize MTCNN
        if TORCH_AVAILABLE:
            try:
                self.mtcnn = MTCNN(
                    keep_all=True, 
                    device=self.device, 
                    post_process=False,
                    select_largest=False
                )
                print(f"[INFO] MTCNN Face Detector loaded successfully on {self.device}.")
            except Exception as e:
                print(f"[WARNING] Failed to load MTCNN: {str(e)}. Falling back to Haar Cascades.")
        
        # Pre-load Haar Cascades as a bulletproof backup
        try:
            self.face_cascade = cv2.CascadeClassifier(
                cv2.data.haarcascades + 'haarcascade_frontalface_default.xml'
            )
            self.eye_cascade = cv2.CascadeClassifier(
                cv2.data.haarcascades + 'haarcascade_eye.xml'
            )
            print("[INFO] OpenCV Haar Cascades loaded successfully as fallback.")
        except Exception as e:
            print(f"[ERROR] Failed to load OpenCV Haar Cascades: {str(e)}")
            self.face_cascade = None
            self.eye_cascade = None

        # Load Deepfake Classifier PyTorch Weights if trained
        self.dl_model = None
        self.dl_model_loaded = False
        
        if TORCH_AVAILABLE:
            try:
                backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
                model_path = os.path.join(backend_dir, "..", "models", "deepfake_classifier.pth")
                
                if os.path.exists(model_path):
                    self.dl_model = DeepfakeClassifier().to(self.device)
                    state_dict = torch.load(model_path, map_location=self.device)
                    self.dl_model.load_state_dict(state_dict)
                    self.dl_model.eval()
                    self.dl_model_loaded = True
                    print(f"[INFO] Deepfake Classifier PyTorch Model loaded successfully from {model_path} on {self.device}.")
                else:
                    print(f"[WARNING] Deepfake Classifier model weights not found at {model_path}. Please train the dataset first.")
            except Exception as e:
                print(f"[ERROR] Failed to load Deepfake Classifier PyTorch Model: {str(e)}")
                traceback.print_exc()

    def detect_faces(self, frame_bgr):
        """
        Detects faces in a frame. Returns a list of bounding boxes: [ [x, y, w, h], ... ]
        """
        frame_rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
        
        # 1. Try MTCNN first if loaded
        if self.mtcnn is not None:
            try:
                pil_img = Image.fromarray(frame_rgb)
                boxes, _ = self.mtcnn.detect(pil_img)
                if boxes is not None and len(boxes) > 0:
                    cv_boxes = []
                    for box in boxes:
                        # MTCNN returns [x1, y1, x2, y2]
                        x1, y1, x2, y2 = map(int, box)
                        # Constrain coordinates
                        x1, y1 = max(0, x1), max(0, y1)
                        w = min(frame_bgr.shape[1] - x1, x2 - x1)
                        h = min(frame_bgr.shape[0] - y1, y2 - y1)
                        if w > 10 and h > 10:
                            cv_boxes.append([x1, y1, w, h])
                    if len(cv_boxes) > 0:
                        return cv_boxes
            except Exception as e:
                print(f"[WARNING] MTCNN runtime error: {str(e)}. Falling back to Haar Cascade.")
        
        # 2. Fallback to Haar Cascade
        if self.face_cascade is not None:
            try:
                gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)
                # Equalize histogram for better illumination invariance
                gray = cv2.equalizeHist(gray)
                faces = self.face_cascade.detectMultiScale(
                    gray, 
                    scaleFactor=1.1, 
                    minNeighbors=5, 
                    minSize=(30, 30)
                )
                if len(faces) > 0:
                    return [list(map(int, face)) for face in faces]
            except Exception as e:
                print(f"[ERROR] Haar Cascade detection error: {str(e)}")
        
        return []

    def analyze_spatial_artifacts(self, crop):
        """
        Spatial analysis on a detected face or full frame crop.
        Checks for:
        1. Boundary blending degradation (Laplacian variance gradients at edges vs center)
        2. Illumination/lighting vector asymmetry (left vs right horizontal luminance gradients)
        3. Local texture noise coherence (high-frequency local binary patterns or variance jumps)
        """
        try:
            h, w = crop.shape[:2]
            if h < 16 or w < 16:
                return 30.0 # Return base metric
            
            gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
            
            # 1. Edge Blending Degradation: Compare Laplacian variance of outer boundary vs inner region
            # Deepfakes often have blurry boundaries due to warping/feathering
            boundary_mask = np.ones_like(gray)
            margin_h, margin_w = max(4, int(h * 0.15)), max(4, int(w * 0.15))
            boundary_mask[margin_h:h-margin_h, margin_w:w-margin_w] = 0
            
            laplacian = cv2.Laplacian(gray, cv2.CV_64F)
            boundary_var = np.var(laplacian[boundary_mask == 1])
            inner_var = np.var(laplacian[boundary_mask == 0])
            
            # Safe division
            if inner_var < 1.0:
                inner_var = 1.0
            ratio = boundary_var / inner_var
            # Ideal real ratio is closer to 0.7-1.1; manipulated boundaries are often heavily smoothed (very low ratio)
            # or have high sharpening artifacts (very high ratio)
            boundary_score = min(100.0, abs(1.0 - ratio) * 120.0)
            
            # 2. Lighting Vector Asymmetry: Horizontal gradients asymmetry
            # Standard lighting vectors in real shots are uniform or progressive. Deepfake face splices have mismatched lighting.
            left_half = gray[:, :w//2]
            right_half = gray[:, w//2:]
            
            # Calculate mean intensity and Sobel horizontal gradient
            left_mean = np.mean(left_half)
            right_mean = np.mean(right_half)
            
            left_sobel = np.mean(np.abs(cv2.Sobel(left_half, cv2.CV_64F, 1, 0, ksize=3)))
            right_sobel = np.mean(np.abs(cv2.Sobel(right_half, cv2.CV_64F, 1, 0, ksize=3)))
            
            mean_diff = abs(left_mean - right_mean) / 255.0
            sobel_diff = abs(left_sobel - right_sobel) / max(1.0, left_sobel + right_sobel)
            
            lighting_score = min(100.0, (mean_diff * 40.0 + sobel_diff * 60.0) * 100.0)
            
            # 3. Gaze/Eye Consistency (simulated if eyes are detected, fallback to texture noise)
            eyes_detected = False
            eye_symmetry_score = 0.0
            if self.eye_cascade is not None:
                eyes = self.eye_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=3)
                if len(eyes) >= 2:
                    eyes_detected = True
                    # Measure eye sizes and bounding boxes asymmetry
                    e_w1, e_h1 = eyes[0][2], eyes[0][3]
                    e_w2, e_h2 = eyes[1][2], eyes[1][3]
                    size_diff = abs(e_w1 * e_h1 - e_w2 * e_h2) / max(1.0, (e_w1 * e_h1 + e_w2 * e_h2) / 2.0)
                    eye_symmetry_score = min(100.0, size_diff * 150.0)
            
            if not eyes_detected:
                # Fallback: local texture noise coherence (standard deviation of local patches)
                patches_std = []
                for i in range(0, h - 8, 8):
                    for j in range(0, w - 8, 8):
                        patches_std.append(np.std(gray[i:i+8, j:j+8]))
                texture_coherence = np.std(patches_std) if len(patches_std) > 0 else 0.0
                # Real face has smooth, progressive textures. Generative noises cause high fluctuations.
                eye_symmetry_score = min(100.0, texture_coherence * 3.5)

            # Combined spatial score
            spatial_score = 0.35 * boundary_score + 0.35 * lighting_score + 0.30 * eye_symmetry_score
            return float(np.clip(spatial_score, 0, 100))
        except Exception as e:
            print(f"[WARNING] Spatial analysis error: {str(e)}")
            return 45.0 # Safe default middle score on error

    def analyze_frequency_anomalies(self, crop):
        """
        Frequency Domain analysis using 2D FFT.
        Generative models leave periodic high-frequency patterns due to deconvolution/upsampling layers.
        Returns:
        - spectral_score: Anomaly percentage (0-100)
        - heatmap_grid: A 10x10 matrix representing local high-frequency concentrations
        """
        try:
            h, w = crop.shape[:2]
            gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
            
            # Compute 2D FFT on the entire crop
            f_transform = np.fft.fft2(gray)
            f_shift = np.fft.fftshift(f_transform)
            magnitude_spectrum = np.abs(f_shift)
            
            # Avoid divide-by-zero
            magnitude_spectrum = np.clip(magnitude_spectrum, 1e-6, None)
            
            # Calculate radial profile (azimuthal average) to find spikes in high frequency
            cy, cx = h // 2, w // 2
            y, x = np.ogrid[-cy:h-cy, -cx:w-cx]
            r = np.sqrt(x*x + y*y).astype(int)
            
            # We want to measure the relative energy in high frequencies vs low frequencies
            r_max = min(cy, cx)
            if r_max < 5:
                r_max = 5
                
            radial_sums = np.zeros(r_max)
            radial_counts = np.zeros(r_max)
            
            for radius in range(r_max):
                mask = (r == radius)
                radial_sums[radius] = np.sum(magnitude_spectrum[mask])
                radial_counts[radius] = max(1.0, np.sum(mask))
                
            radial_profile = radial_sums / radial_counts
            
            # Split profile into low frequencies (first 30%) and high frequencies (last 70%)
            low_cutoff = int(r_max * 0.3)
            high_cutoff = int(r_max * 0.85)
            
            if low_cutoff < 1:
                low_cutoff = 1
            if high_cutoff <= low_cutoff:
                high_cutoff = r_max
                
            low_freq_energy = np.sum(radial_profile[:low_cutoff])
            high_freq_energy = np.sum(radial_profile[low_cutoff:high_cutoff])
            
            # Real cameras have naturally decaying high frequency power. 
            # Deepfakes show spikes or abnormally flat high frequency spectra.
            ratio = high_freq_energy / max(1e-6, low_freq_energy)
            
            # High-frequency variance check (GAN signature: high fluctuations in HF)
            hf_profile = radial_profile[low_cutoff:high_cutoff]
            hf_diffs = np.diff(hf_profile)
            hf_fluctuation = np.std(hf_diffs) / max(1e-6, np.mean(hf_profile))
            
            # Normalize scores
            ratio_score = min(100.0, ratio * 1500.0)
            fluctuation_score = min(100.0, hf_fluctuation * 180.0)
            
            spectral_score = 0.5 * ratio_score + 0.5 * fluctuation_score
            
            # Generate 10x10 Heatmap Grid
            # Divide crop into a 10x10 grid and analyze local high-frequency ratio
            grid_h = max(2, h // 10)
            grid_w = max(2, w // 10)
            
            heatmap_grid = []
            for row in range(10):
                row_data = []
                for col in range(10):
                    y_start = row * grid_h
                    y_end = min(h, (row + 1) * grid_h)
                    x_start = col * grid_w
                    x_end = min(w, (col + 1) * grid_w)
                    
                    cell = gray[y_start:y_end, x_start:x_end]
                    cell_h, cell_w = cell.shape[:2]
                    
                    if cell_h < 2 or cell_w < 2:
                        row_data.append(0.0)
                        continue
                    
                    # FFT on cell
                    f_cell = np.fft.fft2(cell)
                    f_cell_shift = np.fft.fftshift(f_cell)
                    cell_magnitude = np.abs(f_cell_shift)
                    
                    cell_cy, cell_cx = cell_h // 2, cell_w // 2
                    cell_y, cell_x = np.ogrid[-cell_cy:cell_h-cell_cy, -cell_cx:cell_w-cell_cx]
                    cell_r = np.sqrt(cell_x*cell_x + cell_y*cell_y)
                    
                    # High frequency pixels are those at distance > 0.4 of maximum cell radius
                    cell_max_r = max(1.0, np.max(cell_r))
                    hf_mask = (cell_r > 0.4 * cell_max_r)
                    lf_mask = (cell_r <= 0.4 * cell_max_r)
                    
                    cell_hf = np.sum(cell_magnitude[hf_mask])
                    cell_lf = np.sum(cell_magnitude[lf_mask])
                    
                    cell_ratio = cell_hf / max(1e-6, cell_lf)
                    
                    # Score it against standard threshold
                    cell_anomaly = min(100.0, cell_ratio * 400.0)
                    row_data.append(float(round(cell_anomaly, 2)))
                heatmap_grid.append(row_data)
                
            return float(np.clip(spectral_score, 0, 100)), heatmap_grid
        except Exception as e:
            print(f"[WARNING] Frequency analysis error: {str(e)}")
            # Default fallback grid
            empty_grid = [[30.0 + (i*j)%20 for j in range(10)] for i in range(10)]
            return 45.0, empty_grid

    def analyze_temporal_flow(self, prev_crop, curr_crop):
        """
        Temporal Inconsistency score. 
        Measures the Farneback Dense Optical Flow between two consecutive frames' crops.
        Large gradient jumps / velocity standard deviations reveal deepfake facial warping boundaries.
        """
        try:
            if prev_crop is None or curr_crop is None:
                return 0.0
                
            h, w = curr_crop.shape[:2]
            
            # Resize prev to match current crop size if they slightly differ
            if prev_crop.shape != curr_crop.shape:
                prev_resized = cv2.resize(prev_crop, (w, h))
            else:
                prev_resized = prev_crop
                
            prev_gray = cv2.cvtColor(prev_resized, cv2.COLOR_BGR2GRAY)
            curr_gray = cv2.cvtColor(curr_crop, cv2.COLOR_BGR2GRAY)
            
            # Compute Dense Optical Flow using Farneback
            flow = cv2.calcOpticalFlowFarneback(
                prev_gray, curr_gray, None,
                pyr_scale=0.5, levels=3, winsize=15,
                iterations=3, poly_n=5, poly_sigma=1.2, flags=0
            )
            
            # Compute flow magnitude and angle
            magnitude, _ = cv2.cartToPolar(flow[..., 0], flow[..., 1])
            
            # Deepfake temporal glitches exhibit high spatial standard deviations in movement
            # because the synthetic face moves at a mismatched pace to the background
            flow_mean = np.mean(magnitude)
            flow_std = np.std(magnitude)
            
            # Track high local spikes (abrupt warpings)
            peak_movement = np.percentile(magnitude, 95)
            
            # Normalize temporal score
            # Natural movement is continuous; fake frames have high-frequency fluttering / high flow std
            flow_score = (flow_std * 18.0 + peak_movement * 8.0)
            return float(np.clip(flow_score, 0, 100))
            
        except Exception as e:
            print(f"[WARNING] Temporal optical flow error: {str(e)}")
            return 35.0

    def predict_deep_learning_score(self, crop):
        """
        Runs the face crop through the trained DeepfakeClassifier PyTorch model.
        Returns a probability of deepfake anomaly (0.0 - 100.0).
        """
        if not TORCH_AVAILABLE or not self.dl_model_loaded or self.dl_model is None:
            return None
            
        try:
            # Preprocessing
            h, w = crop.shape[:2]
            if h == 0 or w == 0:
                return 0.0
                
            # Convert BGR (OpenCV) to RGB
            crop_rgb = cv2.cvtColor(crop, cv2.COLOR_BGR2RGB)
            crop_resized = cv2.resize(crop_rgb, (224, 224))
            
            # Convert to float tensor and normalize (same as val_transform)
            # Normalization mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]
            img_tensor = crop_resized.astype(np.float32) / 255.0
            mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
            std = np.array([0.229, 0.224, 0.225], dtype=np.float32)
            img_tensor = (img_tensor - mean) / std
            
            # Reorder channels from HWC to CHW
            img_tensor = img_tensor.transpose(2, 0, 1)
            
            # Convert to torch tensor and add batch dimension [1, 3, 224, 224]
            input_tensor = torch.tensor(img_tensor).unsqueeze(0).to(self.device)
            
            # Run forward pass
            with torch.no_grad():
                outputs = self.dl_model(input_tensor)
                # Apply softmax to get probabilities
                probs = torch.softmax(outputs, dim=1).cpu().numpy()[0]
                
            # Class index 1 corresponds to "fake"
            fake_prob = float(probs[1]) * 100.0
            return float(np.clip(fake_prob, 0.0, 100.0))
            
        except Exception as e:
            print(f"[WARNING] Deep Learning Inference error: {str(e)}")
            return 0.0

