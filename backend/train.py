import os
import cv2
import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader, random_split
from torchvision import datasets, transforms
import shutil

# 1. Setup paths
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATASET_DIR = os.path.join(BASE_DIR, "..", "dataset")
PROCESSED_DIR = os.path.join(DATASET_DIR, "processed")
MODELS_DIR = os.path.join(BASE_DIR, "..", "models")

os.makedirs(MODELS_DIR, exist_ok=True)
os.makedirs(PROCESSED_DIR, exist_ok=True)

# Target image size
IMG_SIZE = 224

# Face Detector Fallback System (OpenCV Cascade)
face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')

def extract_face_crop(img_bgr):
    """
    Detects face in the image and returns a 224x224 RGB crop.
    Falls back to a centered crop / whole image if no face is detected.
    """
    h, w = img_bgr.shape[:2]
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    faces = face_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(30, 30))
    
    if len(faces) > 0:
        # Sort by area descending to get the largest face
        faces = sorted(faces, key=lambda f: f[2] * f[3], reverse=True)
        x, y, w_box, h_box = faces[0]
        crop = img_bgr[y:y+h_box, x:x+w_box]
    else:
        # Take a center crop to capture facial/subject details instead of outer background
        margin_h, margin_w = int(h * 0.1), int(w * 0.1)
        crop = img_bgr[margin_h:h-margin_h, margin_w:w-margin_w]
        if crop.size == 0:
            crop = img_bgr
        
    crop_rgb = cv2.cvtColor(crop, cv2.COLOR_BGR2RGB)
    crop_resized = cv2.resize(crop_rgb, (IMG_SIZE, IMG_SIZE))
    return crop_resized

def preprocess_dataset():
    """
    Loops through original raw dataset and extracts faces into the processed directory.
    """
    print("[INFO] Starting dataset preprocessing and face extraction...")
    classes = ["real", "fake"]
    
    # Clean previous runs to prevent stale crops
    if os.path.exists(PROCESSED_DIR):
        shutil.rmtree(PROCESSED_DIR)
        
    for cls in classes:
        src_path = os.path.join(DATASET_DIR, cls)
        dest_path = os.path.join(PROCESSED_DIR, cls)
        os.makedirs(dest_path, exist_ok=True)
        
        if not os.path.exists(src_path):
            print(f"[WARNING] Class source folder {src_path} does not exist!")
            continue
            
        files = os.listdir(src_path)
        print(f"[INFO] Processing class: '{cls}' ({len(files)} files)...")
        
        crop_count = 0
        for f in files:
            file_path = os.path.join(src_path, f)
            if not os.path.isfile(file_path):
                continue
                
            ext = f.split(".")[-1].lower()
            
            # Handle Images
            if ext in ["jpg", "jpeg", "png"]:
                try:
                    img = cv2.imread(file_path)
                    if img is None:
                        continue
                    crop = extract_face_crop(img)
                    out_name = f"crop_{crop_count:05d}_{f}.jpg"
                    cv2.imwrite(os.path.join(dest_path, out_name), cv2.cvtColor(crop, cv2.COLOR_RGB2BGR))
                    crop_count += 1
                except Exception as e:
                    print(f"[ERROR] Failed to process image {f}: {e}")
                    
            # Handle Videos
            elif ext in ["mp4", "avi", "mov"]:
                try:
                    cap = cv2.VideoCapture(file_path)
                    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
                    if total_frames <= 0:
                        continue
                    # Sample 20 frames per video
                    sample_indices = np.linspace(0, total_frames - 1, min(20, total_frames), dtype=int)
                    
                    for idx in sample_indices:
                        cap.set(cv2.CAP_PROP_POS_FRAMES, int(idx))
                        ret, frame = cap.read()
                        if not ret:
                            break
                        crop = extract_face_crop(frame)
                        out_name = f"crop_{crop_count:05d}_{f}_frame_{idx}.jpg"
                        cv2.imwrite(os.path.join(dest_path, out_name), cv2.cvtColor(crop, cv2.COLOR_RGB2BGR))
                        crop_count += 1
                    cap.release()
                except Exception as e:
                    print(f"[ERROR] Failed to process video {f}: {e}")
                    
        print(f"[SUCCESS] Extracted {crop_count} crops for class '{cls}'.")

# 2. Define CNN Architecture (Matches ForensicEngine exactly)
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

class CustomImageFolder(datasets.ImageFolder):
    def find_classes(self, directory):
        # Force 'real' to map to 0 and 'fake' to map to 1
        classes = ['real', 'fake']
        class_to_idx = {'real': 0, 'fake': 1}
        return classes, class_to_idx

def train_model():
    """
    Sets up transforms, loads the extracted dataset, splits train/val,
    trains the PyTorch CNN model, and saves weights.
    """
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"[INFO] Using device for training: {device}")
    
    # Heavy augmentations on training set to prevent overfitting on small size
    train_transform = transforms.Compose([
        transforms.Resize((IMG_SIZE, IMG_SIZE)),
        transforms.RandomHorizontalFlip(p=0.5),
        transforms.RandomRotation(degrees=15),
        transforms.ColorJitter(brightness=0.2, contrast=0.2, saturation=0.2),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
    ])
    
    val_transform = transforms.Compose([
        transforms.Resize((IMG_SIZE, IMG_SIZE)),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
    ])
    
    # Load dataset
    if not os.path.exists(PROCESSED_DIR) or len(os.listdir(PROCESSED_DIR)) == 0:
        print("[ERROR] Processed dataset directory empty! Run preprocessing first.")
        return
        
    full_dataset = CustomImageFolder(PROCESSED_DIR)
    total_size = len(full_dataset)
    print(f"[INFO] Loaded total dataset size: {total_size} images")
    
    # Random split: 80% training, 20% validation
    train_size = int(0.8 * total_size)
    val_size = total_size - train_size
    train_dataset, val_dataset = random_split(full_dataset, [train_size, val_size])
    
    # Override transforms for splits
    train_dataset.dataset.transform = train_transform
    val_dataset.dataset.transform = val_transform
    
    # Compute class distribution for weights
    real_count = len(os.listdir(os.path.join(PROCESSED_DIR, "real")))
    fake_count = len(os.listdir(os.path.join(PROCESSED_DIR, "fake")))
    print(f"[INFO] Dataset balance: {real_count} real vs {fake_count} fake")
    
    # Class weights for CrossEntropyLoss
    # Weights are inversely proportional to class frequencies
    weights = [total_size / real_count, total_size / fake_count]
    class_weights = torch.FloatTensor(weights).to(device)
    print(f"[INFO] Loss class weights: Real={weights[0]:.2f}, Fake={weights[1]:.2f}")
    
    # Create DataLoaders
    batch_size = 16
    train_loader = DataLoader(train_dataset, batch_size=batch_size, shuffle=True, num_workers=0)
    val_loader = DataLoader(val_dataset, batch_size=batch_size, shuffle=False, num_workers=0)
    
    # Instantiate model, optimizer, loss
    model = DeepfakeClassifier().to(device)
    criterion = nn.CrossEntropyLoss(weight=class_weights)
    optimizer = optim.Adam(model.parameters(), lr=0.001, weight_decay=1e-4)
    scheduler = optim.lr_scheduler.StepLR(optimizer, step_size=5, gamma=0.5)
    
    best_acc = 0.0
    epochs = 15
    model_save_path = os.path.join(MODELS_DIR, "deepfake_classifier.pth")
    
    print("\n[STARTING TRAINING LOOP]")
    print("-" * 50)
    for epoch in range(epochs):
        # Training Phase
        model.train()
        train_loss = 0.0
        correct_train = 0
        total_train = 0
        
        for images, labels in train_loader:
            images, labels = images.to(device), labels.to(device)
            
            optimizer.zero_grad()
            outputs = model(images)
            loss = criterion(outputs, labels)
            loss.backward()
            optimizer.step()
            
            train_loss += loss.item() * images.size(0)
            _, predicted = outputs.max(1)
            total_train += labels.size(0)
            correct_train += predicted.eq(labels).sum().item()
            
        scheduler.step()
        epoch_train_loss = train_loss / total_train
        epoch_train_acc = 100. * correct_train / total_train
        
        # Validation Phase
        model.eval()
        val_loss = 0.0
        correct_val = 0
        total_val = 0
        
        with torch.no_grad():
            for images, labels in val_loader:
                images, labels = images.to(device), labels.to(device)
                outputs = model(images)
                loss = criterion(outputs, labels)
                
                val_loss += loss.item() * images.size(0)
                _, predicted = outputs.max(1)
                total_val += labels.size(0)
                correct_val += predicted.eq(labels).sum().item()
                
        epoch_val_loss = val_loss / total_val
        epoch_val_acc = 100. * correct_val / total_val
        
        print(f"Epoch {epoch+1:02d}/{epochs:02d} | "
              f"Train Loss: {epoch_train_loss:.4f} | Train Acc: {epoch_train_acc:.2f}% | "
              f"Val Loss: {epoch_val_loss:.4f} | Val Acc: {epoch_val_acc:.2f}%")
              
        # Save model if validation accuracy improves
        if epoch_val_acc >= best_acc:
            best_acc = epoch_val_acc
            torch.save(model.state_dict(), model_save_path)
            print(f" --> Saved best checkpoint to {model_save_path} (Acc: {best_acc:.2f}%)")
            
    print("-" * 50)
    print(f"[SUCCESS] Model training complete! Best Validation Accuracy: {best_acc:.2f}%")
    print(f"[INFO] Weights saved successfully at: {model_save_path}")

if __name__ == "__main__":
    # 1. Run face crop preprocessing
    preprocess_dataset()
    
    # 2. Run model training
    train_model()
