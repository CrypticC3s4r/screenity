import React, { useContext, useState, useEffect, useRef } from "react";
import styles from "../../styles/player/_TranscriptionPanel.module.scss";
import { ReactSVG } from "react-svg";

// Context
import { ContentStateContext } from "../../context/ContentState";

// Services
import TranscriptionService from "../../services/transcriptionService";

const URL =
  "chrome-extension://" + chrome.i18n.getMessage("@@extension_id") + "/assets/";

const TranscriptionPanel = ({ isOpen, onClose }) => {
  const [contentState, setContentState] = useContext(ContentStateContext);
  const [transcription, setTranscription] = useState(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState(0);
  const transcriptionService = useRef(null);

  useEffect(() => {
    // Initialize transcription service when API key is available
    const initializeService = async () => {
      try {
        const result = await new Promise((resolve) => {
          chrome.storage.local.get(["openaiApiKey"], resolve);
        });
        
        if (result.openaiApiKey) {
          transcriptionService.current = new TranscriptionService(result.openaiApiKey);
        }
      } catch (err) {
        console.error("Failed to initialize transcription service:", err);
      }
    };

    initializeService();
  }, []);

  const handleTranscribe = async () => {
    if (!transcriptionService.current) {
      setError("Please set your OpenAI API key in the settings first");
      return;
    }

    if (!contentState.mp4ready && !contentState.webm) {
      setError("No video available for transcription");
      return;
    }

    setIsTranscribing(true);
    setError(null);
    setProgress(0);
    setTranscription(null);

    try {
      // First extract audio from video as MP3
      setProgress(20);
      
      // Use the sandbox message system to extract audio
      const videoBlob = contentState.mp4ready ? contentState.blob : contentState.webm;
      
      // Convert video blob to base64 for message passing
      const reader = new FileReader();
      const base64Video = await new Promise((resolve, reject) => {
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(videoBlob);
      });
      
      // Send message to sandbox to extract MP3 audio
      const audioBlob = await new Promise((resolve, reject) => {
        const handleMessage = (event) => {
          if (event.data.type === "updated-blob") {
            window.removeEventListener("message", handleMessage);
            // Convert base64 back to blob
            const base64 = event.data.base64.split(",")[1];
            const binaryString = atob(base64);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
              bytes[i] = binaryString.charCodeAt(i);
            }
            const blob = new Blob([bytes], { type: "audio/mp3" });
            resolve(blob);
          } else if (event.data.type === "ffmpeg-error") {
            window.removeEventListener("message", handleMessage);
            reject(new Error("Failed to extract audio from video"));
          }
        };

        window.addEventListener("message", handleMessage);
        
        // Send message to parent window (the Editor context) to get MP3 audio
        window.parent.postMessage({
          type: "get-audio-mp3",
          base64: base64Video
        }, "*");
        
        // Set a timeout in case no response
        setTimeout(() => {
          window.removeEventListener("message", handleMessage);
          reject(new Error("Timeout: No response from audio extraction"));
        }, 30000); // 30 second timeout
      });

      setProgress(40);

      // Now transcribe the audio
      const result = await transcriptionService.current.transcribeAudio(
        audioBlob, 
        contentState.duration
      );

      setProgress(80);

      // Format the transcription with timestamps
      const formattedText = transcriptionService.current.formatTranscriptionWithTimestamps(result);
      
      setTranscription({
        text: formattedText,
        rawResult: result,
        language: result.language || 'auto-detected'
      });
      
      setProgress(100);
    } catch (err) {
      console.error("Transcription error:", err);
      setError(err.message || "Failed to transcribe audio");
    } finally {
      setIsTranscribing(false);
      setProgress(0);
    }
  };

  const handleCopy = () => {
    if (transcription) {
      navigator.clipboard.writeText(transcription.text).then(() => {
        // Could add a toast notification here
        console.log("Transcription copied to clipboard");
      });
    }
  };

  const handleDownload = () => {
    if (transcription) {
      const element = document.createElement("a");
      const file = new Blob([transcription.text], { type: 'text/plain' });
      element.href = URL.createObjectURL(file);
      element.download = `${contentState.title || 'video'}-transcription.txt`;
      document.body.appendChild(element);
      element.click();
      document.body.removeChild(element);
    }
  };

  if (!isOpen) return null;

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <div className={styles.title}>Audio Transcription</div>
        <button className={styles.closeButton} onClick={onClose}>
          <ReactSVG src={URL + "editor/icons/close.svg"} />
        </button>
      </div>

      <div className={styles.content}>
        {!transcription && !isTranscribing && !error && (
          <div className={styles.initial}>
            <div className={styles.description}>
              Generate a text transcription of your video's audio using OpenAI Whisper.
            </div>
            <button 
              className={styles.transcribeButton}
              onClick={handleTranscribe}
              disabled={!transcriptionService.current}
            >
              <ReactSVG src={URL + "editor/icons/mic.svg"} />
              Start Transcription
            </button>
            {!transcriptionService.current && (
              <div className={styles.warning}>
                Please set your OpenAI API key in the popup settings first
              </div>
            )}
          </div>
        )}

        {isTranscribing && (
          <div className={styles.loading}>
            <div className={styles.spinner}></div>
            <div className={styles.loadingText}>Transcribing audio...</div>
            <div className={styles.progressBar}>
              <div 
                className={styles.progressFill} 
                style={{ width: `${progress}%` }}
              ></div>
            </div>
            <div className={styles.progressText}>{progress}%</div>
          </div>
        )}

        {error && (
          <div className={styles.error}>
            <ReactSVG src={URL + "editor/icons/alert.svg"} />
            <div className={styles.errorText}>{error}</div>
            <button 
              className={styles.retryButton}
              onClick={handleTranscribe}
            >
              Try Again
            </button>
          </div>
        )}

        {transcription && (
          <div className={styles.result}>
            <div className={styles.resultHeader}>
              <div className={styles.resultInfo}>
                Language: {transcription.language}
              </div>
              <div className={styles.resultActions}>
                <button 
                  className={styles.actionButton}
                  onClick={handleCopy}
                  title="Copy to clipboard"
                >
                  <ReactSVG src={URL + "editor/icons/copy.svg"} />
                </button>
                <button 
                  className={styles.actionButton}
                  onClick={handleDownload}
                  title="Download as text file"
                >
                  <ReactSVG src={URL + "editor/icons/download.svg"} />
                </button>
                <button 
                  className={styles.actionButton}
                  onClick={handleTranscribe}
                  title="Transcribe again"
                >
                  <ReactSVG src={URL + "editor/icons/refresh.svg"} />
                </button>
              </div>
            </div>
            
            <div className={styles.transcriptionText}>
              {transcription.text.split('\n').map((line, index) => (
                <div 
                  key={index} 
                  className={styles.transcriptionLine}
                  data-timestamp={line.trim().startsWith('[') ? 'true' : 'false'}
                >
                  {line}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TranscriptionPanel; 