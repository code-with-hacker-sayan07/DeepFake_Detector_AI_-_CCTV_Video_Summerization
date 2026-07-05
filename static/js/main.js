document.addEventListener('DOMContentLoaded', () => {
    const uploadZone = document.getElementById('upload-zone');
    const fileInput = document.getElementById('file-input');
    const fileInfo = document.getElementById('file-info');
    const fileNameDisplay = document.getElementById('file-name');
    const fileSizeDisplay = document.getElementById('file-size');
    const scanBtn = document.getElementById('scan-btn');
    
    const progressContainer = document.getElementById('progress-container');
    const progressBar = document.getElementById('progress-bar');
    const progressText = document.getElementById('progress-text');
    
    const resultDashboard = document.getElementById('result-dashboard');
    const verdictTitle = document.getElementById('verdict-title');
    const confidenceScore = document.getElementById('confidence-score');
    const resultDetails = document.getElementById('result-details');
    
    const errorContainer = document.getElementById('error-container');
    const errorMessage = document.getElementById('error-message');

    let selectedFile = null;

    // Drag and Drop Handlers
    uploadZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadZone.classList.add('dragover');
    });

    uploadZone.addEventListener('dragleave', () => {
        uploadZone.classList.remove('dragover');
    });

    uploadZone.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadZone.classList.remove('dragover');
        
        if (e.dataTransfer.files.length > 0) {
            handleFileSelect(e.dataTransfer.files[0]);
        }
    });

    uploadZone.addEventListener('click', () => {
        fileInput.click();
    });

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFileSelect(e.target.files[0]);
        }
    });

    function handleFileSelect(file) {
        // Reset UI
        resultDashboard.classList.add('hidden');
        errorContainer.classList.add('hidden');
        progressContainer.classList.add('hidden');

        const validTypes = ['image/jpeg', 'image/png', 'video/mp4'];
        if (!validTypes.includes(file.type)) {
            showError("We only accept JPG, PNG, and MP4 files. Please try again with a supported format.");
            return;
        }

        selectedFile = file;
        fileNameDisplay.textContent = file.name;
        
        // Format file size
        const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
        fileSizeDisplay.textContent = `${sizeMb} MB`;
        
        fileInfo.classList.remove('hidden');
    }

    scanBtn.addEventListener('click', async () => {
        if (!selectedFile) return;

        // UI transitions
        scanBtn.disabled = true;
        scanBtn.classList.add('opacity-50', 'cursor-not-allowed');
        scanBtn.textContent = 'Scanning...';
        
        errorContainer.classList.add('hidden');
        resultDashboard.classList.add('hidden');
        progressContainer.classList.remove('hidden');
        
        // Simulate initial progress while upload happens
        progressBar.style.width = '10%';
        progressText.textContent = '10%';

        const formData = new FormData();
        formData.append('file', selectedFile);

        try {
            // Fake progress animation for better UX during ML inference
            let progress = 10;
            const progressInterval = setInterval(() => {
                if (progress < 90) {
                    progress += Math.floor(Math.random() * 5) + 1;
                    if(progress > 90) progress = 90;
                    progressBar.style.width = `${progress}%`;
                    progressText.textContent = `${progress}%`;
                }
            }, 600);

            const response = await fetch('/detect', {
                method: 'POST',
                body: formData
            });

            clearInterval(progressInterval);
            
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Something went wrong during the analysis.');
            }

            // Finish progress
            progressBar.style.width = '100%';
            progressText.textContent = '100%';

            setTimeout(() => {
                showResults(data);
            }, 500);

        } catch (error) {
            progressContainer.classList.add('hidden');
            showError(error.message);
        } finally {
            scanBtn.disabled = false;
            scanBtn.classList.remove('opacity-50', 'cursor-not-allowed');
            scanBtn.textContent = 'Start Scan';
            // Reset progress bar for next time
            setTimeout(() => {
                if (progressContainer.classList.contains('hidden')) {
                    progressBar.style.width = '0%';
                    progressText.textContent = '0%';
                }
            }, 1000);
        }
    });

    function showResults(data) {
        progressContainer.classList.add('hidden');
        resultDashboard.classList.remove('hidden', 'fake-result', 'real-result');
        
        if (data.status === 'Fake') {
            resultDashboard.classList.add('fake-result');
            verdictTitle.textContent = '🚨 Deepfake Detected';
        } else {
            resultDashboard.classList.add('real-result');
            verdictTitle.textContent = '✅ Authentic Media';
        }

        confidenceScore.textContent = `${data.confidence}%`;
        resultDetails.textContent = data.details;
    }

    function showError(message) {
        errorContainer.classList.remove('hidden');
        errorMessage.textContent = message;
    }
});
