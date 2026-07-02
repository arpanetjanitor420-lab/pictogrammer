document.addEventListener('DOMContentLoaded', () => {
    const imageInput = document.getElementById('image-input');
    const mapNumberInput = document.getElementById('map-number');
    const messageTextarea = document.getElementById('message-textarea');
    const processButton = document.getElementById('process-button');
    const canvas = document.getElementById('image-canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    let isEncodeMode = false;
    let totalPixels = 0;
    let imageDataCache = null;
    
    let failedAttempts = parseInt(sessionStorage.getItem('microwave_strikes')) || 0;
    let originalFileName = 'secret_image.png'; 

    imageInput.addEventListener('change', handleImageUpload);
    processButton.addEventListener('click', handleProcess);

    function getMessageTitle(text) {
        const words = text.trim().split(/\s+/);
        if (words.length >= 2) {
            return `${words[0]}_${words[1]}`.toLowerCase().replace(/[^a-z0-9_]/g, '');
        }
        return (words[0] || 'decoded_message').toLowerCase().replace(/[^a-z0-9_]/g, '');
    }

    function handleImageUpload(e) {
        const file = e.target.files[0];
        if (!file || file.type !== 'image/png') {
            alert('Please select a valid .png file.');
            return;
        }

        originalFileName = file.name;

        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                canvas.width = img.naturalWidth;
                canvas.height = img.naturalHeight;
                ctx.drawImage(img, 0, 0);

                try {
                    totalPixels = canvas.width * canvas.height;
                    imageDataCache = ctx.getImageData(0, 0, canvas.width, canvas.height);
                    checkForMarker(imageDataCache);
                } catch (error) {
                    if (error.name === 'SecurityError') {
                        alert(`ERROR: Could not read image data.\n\nREASON: Browser policy blocked canvas extraction.`);
                    } else {
                        alert(`An unexpected error occurred: ${error.message}`);
                    }
                    imageInput.value = '';
                    canvas.style.display = 'none';
                }
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    }

    function checkForMarker(imageData) {
        const data = imageData.data;
        let markerFound = true;
        if (totalPixels < 25) {
            markerFound = false;
        } else {
            for (let i = 0; i < 25 * 4; i += 4) {
                const r = data[i];
                const g = data[i + 1];
                const b = data[i + 2];
                if (!(r % 5 === 0 && g % 2 !== 0 && b % 2 === 0)) {
                    markerFound = false;
                    break;
                }
            }
        }

        const messageLabel = document.querySelector('label[for="message-textarea"]');

        // Reset the display status of the mobile fallback link container on new uploads
        const fallbackZone = document.getElementById('download-fallback-zone');
        if (fallbackZone) fallbackZone.style.display = 'none';

        if (markerFound) {
            isEncodeMode = false;
            messageTextarea.style.display = 'none';
            if (messageLabel) messageLabel.style.display = 'none';
            processButton.textContent = 'Retrieve Message';
        } else {
            isEncodeMode = true;
            messageTextarea.style.display = 'block';
            if (messageLabel) messageLabel.style.display = 'block';
            const capacity = Math.floor(((totalPixels - 33) * 0.95) / 8);
            messageTextarea.maxLength = capacity;
            messageTextarea.placeholder = `Enter message to hide (Max chars: ${capacity})...`;
            processButton.textContent = 'Encode Message';
        }
         canvas.style.display = 'block';
         canvas.style.visibility = 'visible';
         
         if (canvas.parentElement) {
             canvas.parentElement.style.width = 'fit-content';
             canvas.parentElement.style.margin = '1em auto';
         }
         
         if (failedAttempts >= 3) {
             processButton.disabled = true;
             processButton.textContent = "FILE DAMAGED";
             mapNumberInput.disabled = true;
         }
    }

    function handleProcess() {
        const key = parseInt(mapNumberInput.value, 10);
        if (isNaN(key) || key < 1 || key > 99) {
            alert('Please choose a number between 1 and 99.');
            return;
        }

        if (isEncodeMode) {
            encodeMessage(key);
        } else {
            decodeMessage(key);
        }
    }

    function textToBinary(text) {
        return text.split('').map(char => char.charCodeAt(0).toString(2).padStart(8, '0')).join('');
    }

    function binaryToText(binary) {
        const bytes = binary.match(/.{1,8}/g) || [];
        return bytes.map(byte => String.fromCharCode(parseInt(byte, 2))).join('');
    }

    function saveTextAsFile(text, filename) {
        const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    function getEncodingParams(key) {
        let sequence_position;
        if (key >= 45) {
            sequence_position = key - 45;
        } else {
            sequence_position = (99 - 45 + 1) + (44 - key);
        }
        const startPixelIndex = 33 + Math.floor(sequence_position / 4);
        const startColorChannel = (key % 3 === 1) ? 2 : (key % 3 === 2) ? 0 : 1;
        const jumps = (key % 2 !== 0) ? [11, 7] : [4, 20];
        return { startPixelIndex, startColorChannel, jumps };
    }

    function encodeMessage(key) {
        const sentinel = "fuck12";
        const binaryMessage = textToBinary(messageTextarea.value + sentinel);
        const { startPixelIndex, startColorChannel, jumps } = getEncodingParams(key);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        let currentPixel = startPixelIndex;
        let currentChannel = startColorChannel;
        let jumpIndex = 0;

        for (let i = 0; i < binaryMessage.length; i++) {
            const bit = parseInt(binaryMessage[i], 10);
            const pixelDataIndex = (currentPixel * 4) + currentChannel;
            if (pixelDataIndex >= data.length) {
                alert('Message too long for this image and key combination!');
                return;
            }
            data[pixelDataIndex] = (data[pixelDataIndex] & 0xFE) | bit;
            currentChannel = (currentChannel + 1) % 3;
            if (currentChannel === 0) {
                currentPixel += jumps[jumpIndex % 2];
                jumpIndex++;
            }
        }

        for (let i = 0; i < 25 * 4; i += 4) {
            data[i] = 5;
            data[i + 1] = 1;
            data[i + 2] = 2;
        }

        ctx.putImageData(imageData, 0, 0);
        
        const dataUrl = canvas.toDataURL('image/png');
        
        // Populate and reveal permanent download button for environments that block auto-clicks
        const fallbackZone = document.getElementById('download-fallback-zone');
        const manualLink = document.getElementById('manual-download-link');
        if (fallbackZone && manualLink) {
            manualLink.href = dataUrl;
            manualLink.download = `secure_${originalFileName}`;
            fallbackZone.style.display = 'block';
        }

        alert('Message encoded! The download has been prepared.');
        const link = document.createElement('a');
        link.download = `secure_${originalFileName}`; 
        link.href = dataUrl;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    function decodeMessage(key) {
        const { startPixelIndex, startColorChannel, jumps } = getEncodingParams(key);
        const data = imageDataCache.data;
        const sentinel = "fuck12";
        const binarySentinel = textToBinary(sentinel);
        let binaryMessage = '';
        let currentPixel = startPixelIndex;
        let currentChannel = startColorChannel;
        let jumpIndex = 0;

        while (currentPixel * 4 < data.length) {
            const pixelDataIndex = (currentPixel * 4) + currentChannel;
            if (pixelDataIndex >= data.length) break;
            const bit = data[pixelDataIndex] & 1;
            binaryMessage += bit;

            if (binaryMessage.length > 50000) {
                break; 
            }

            if (binaryMessage.endsWith(binarySentinel)) {
                const decodedText = binaryToText(binaryMessage.slice(0, -binarySentinel.length));
                alert(`Message Found: ${decodedText}`);
                
                const title = getMessageTitle(decodedText);
                saveTextAsFile(decodedText, `${title}.txt`);
                
                failedAttempts = 0;
                sessionStorage.setItem('microwave_strikes', 0);
                return;
            }
            currentChannel = (currentChannel + 1) % 3;
            if (currentChannel === 0) {
                currentPixel += jumps[jumpIndex % 2];
                jumpIndex++;
            }
        }
        handleFailedAttempt();
    }

    function handleFailedAttempt() {
        failedAttempts++;
        sessionStorage.setItem('microwave_strikes', failedAttempts);

        if (failedAttempts === 1) {
            alert('DECODE FAILURE: That is not it.');
        } else if (failedAttempts === 2) {
            alert('DECODE FAILURE: That is still not it. WARNING: If you get it wrong a third time, the system will destroy the picture and the message. Any further interaction with this file is not recommended, as it may damage your computer system.');
        } else if (failedAttempts >= 3) {
            alert('CRITICAL ERROR: This file has been damaged. Core data shredded. Further interaction is not recommended as it may damage your computer.');
            corruptImageData();
        }
    }

    function corruptImageData() {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        const width = canvas.width;
        const height = canvas.height;
        const newImageData = ctx.createImageData(width, height);
        const newData = newImageData.data;

        for (let y = 0; y < height; y++) {
            let offset = Math.floor(Math.sin(y * 0.1) * 10 + Math.random() * 5);
            for (let x = 0; x < width; x++) {
                let sourceX = Math.min(width - 1, Math.max(0, x + offset));
                let destIdx = (y * width + x) * 4;
                let srcIdx = (y * width + sourceX) * 4;
                
                newData[destIdx] = data[srcIdx] * 0.2; 
                newData[destIdx + 1] = Math.min(255, data[srcIdx + 1] + 80); 
                newData[destIdx + 2] = data[srcIdx + 2] * 0.2; 
                newData[destIdx + 3] = data[srcIdx + 3]; 
            }
        }
        ctx.putImageData(newImageData, 0, 0);

        ctx.strokeStyle = '#00FF00';
        ctx.lineWidth = 4;
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#00FF00';

        const drawLightning = (startX, startY, endX, endY) => {
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            const steps = 25;
            for (let i = 1; i <= steps; i++) {
                let nextX = startX + ((endX - startX) * (i / steps)) + (Math.random() - 0.5) * 50;
                let nextY = startY + ((endY - startY) * (i / steps)) + (Math.random() - 0.5) * 50;
                ctx.lineTo(nextX, nextY);
            }
            ctx.stroke();
        };

        for (let i = 0; i < 7; i++) {
            drawLightning(0, Math.random() * height, width, Math.random() * height);
        }

        const midX = width / 2;
        const midY = height / 2;
        for (let i = 0; i < 10; i++) {
            let angle = Math.random() * Math.PI * 2;
            let length = Math.random() * (Math.max(width, height) / 2);
            let destX = midX + Math.cos(angle) * length;
            let destY = midY + Math.sin(angle) * length;
            drawLightning(midX, midY, destX, destY);
        }

        processButton.disabled = true;
        processButton.textContent = "FILE DAMAGED";
        mapNumberInput.disabled = true;
    }
});
