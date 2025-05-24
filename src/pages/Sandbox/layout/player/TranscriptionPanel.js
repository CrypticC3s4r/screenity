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
  const [sop, setSop] = useState(null);
  const [activeTab, setActiveTab] = useState("transcription");
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isGeneratingSop, setIsGeneratingSop] = useState(false);
  const [error, setError] = useState(null);
  const [sopError, setSopError] = useState(null);
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
    setSop(null); // Clear SOP when starting new transcription

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

  const handleGenerateSop = async () => {
    if (!transcriptionService.current) {
      setSopError("Please set your OpenAI API key in the settings first");
      return;
    }

    if (!transcription) {
      setSopError("No transcription available to generate SOP from");
      return;
    }

    setIsGeneratingSop(true);
    setSopError(null);

    try {
      const generatedSop = await transcriptionService.current.generateSOP(
        transcription.text, 
        transcription.language
      );
      
      setSop({
        content: generatedSop,
        language: transcription.language,
        isEdited: false
      });
      
      // Switch to SOP tab after generation
      setActiveTab("sop");
      
    } catch (err) {
      console.error("SOP generation error:", err);
      setSopError(err.message || "Failed to generate SOP");
    } finally {
      setIsGeneratingSop(false);
    }
  };

  const handleCopy = async () => {
    if (!transcription) return;
    
    try {
      // First try the modern clipboard API
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(transcription.text);
        console.log("Transcription copied to clipboard");
      } else {
        // Fallback for chrome-extension:// contexts
        const textArea = document.createElement("textarea");
        textArea.value = transcription.text;
        textArea.style.position = "fixed";
        textArea.style.left = "-999999px";
        textArea.style.top = "-999999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        
        try {
          document.execCommand('copy');
          console.log("Transcription copied to clipboard (fallback)");
        } catch (err) {
          console.error("Failed to copy to clipboard:", err);
        } finally {
          document.body.removeChild(textArea);
        }
      }
    } catch (err) {
      console.error("Failed to copy to clipboard:", err);
      // Try the fallback method
      const textArea = document.createElement("textarea");
      textArea.value = transcription.text;
      textArea.style.position = "fixed";
      textArea.style.left = "-999999px";
      textArea.style.top = "-999999px";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      
      try {
        document.execCommand('copy');
        console.log("Transcription copied to clipboard (fallback)");
      } catch (fallbackErr) {
        console.error("All clipboard methods failed:", fallbackErr);
      } finally {
        document.body.removeChild(textArea);
      }
    }
  };

  const handleCopySop = async () => {
    if (!sop) return;
    
    try {
      // First try the modern clipboard API
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(sop.content);
        console.log("SOP copied to clipboard");
      } else {
        // Fallback for chrome-extension:// contexts
        const textArea = document.createElement("textarea");
        textArea.value = sop.content;
        textArea.style.position = "fixed";
        textArea.style.left = "-999999px";
        textArea.style.top = "-999999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        
        try {
          document.execCommand('copy');
          console.log("SOP copied to clipboard (fallback)");
        } catch (err) {
          console.error("Failed to copy SOP to clipboard:", err);
        } finally {
          document.body.removeChild(textArea);
        }
      }
    } catch (err) {
      console.error("Failed to copy SOP to clipboard:", err);
      // Try the fallback method
      const textArea = document.createElement("textarea");
      textArea.value = sop.content;
      textArea.style.position = "fixed";
      textArea.style.left = "-999999px";
      textArea.style.top = "-999999px";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      
      try {
        document.execCommand('copy');
        console.log("SOP copied to clipboard (fallback)");
      } catch (fallbackErr) {
        console.error("All SOP clipboard methods failed:", fallbackErr);
      } finally {
        document.body.removeChild(textArea);
      }
    }
  };

  const handleDownload = () => {
    if (!transcription) return;
    
    try {
      const element = document.createElement("a");
      const file = new Blob([transcription.text], { type: 'text/plain' });
      element.href = URL.createObjectURL(file);
      element.download = `${contentState.title || 'video'}-transcription.txt`;
      element.style.display = "none";
      document.body.appendChild(element);
      element.click();
      
      // Clean up after a short delay
      setTimeout(() => {
        document.body.removeChild(element);
        URL.revokeObjectURL(element.href);
      }, 100);
      
      console.log("Transcription download initiated");
    } catch (err) {
      console.error("Failed to download transcription:", err);
    }
  };

  const handleDownloadSop = () => {
    if (!sop) return;
    
    try {
      const element = document.createElement("a");
      const file = new Blob([sop.content], { type: 'text/plain' });
      element.href = URL.createObjectURL(file);
      element.download = `${contentState.title || 'video'}-sop.txt`;
      element.style.display = "none";
      document.body.appendChild(element);
      element.click();
      
      // Clean up after a short delay
      setTimeout(() => {
        document.body.removeChild(element);
        URL.revokeObjectURL(element.href);
      }, 100);
      
      console.log("SOP download initiated");
    } catch (err) {
      console.error("Failed to download SOP:", err);
    }
  };

  const handleSopEdit = (newContent) => {
    setSop(prev => ({
      ...prev,
      content: newContent,
      isEdited: true
    }));
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

      {/* Tab Navigation */}
      {(transcription || sop) && (
        <div className={styles.tabNavigation}>
          <button 
            className={`${styles.tabButton} ${activeTab === "transcription" ? styles.active : ""}`}
            onClick={() => setActiveTab("transcription")}
          >
            Transcription
          </button>
          <button 
            className={`${styles.tabButton} ${activeTab === "sop" ? styles.active : ""}`}
            onClick={() => setActiveTab("sop")}
            disabled={!sop}
          >
            SOP
          </button>
        </div>
      )}

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

        {/* Transcription Tab Content */}
        {transcription && activeTab === "transcription" && (
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
                <button 
                  className={`${styles.actionButton} ${styles.generateSopButton}`}
                  onClick={handleGenerateSop}
                  disabled={isGeneratingSop}
                  title="Generate SOP from transcription"
                >
                  <ReactSVG src={URL + "editor/icons/pencil.svg"} />
                  {isGeneratingSop ? "Generating..." : "Generate SOP"}
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

        {/* SOP Generation Loading */}
        {isGeneratingSop && (
          <div className={styles.loading}>
            <div className={styles.spinner}></div>
            <div className={styles.loadingText}>Generating SOP...</div>
          </div>
        )}

        {/* SOP Generation Error */}
        {sopError && (
          <div className={styles.error}>
            <ReactSVG src={URL + "editor/icons/alert.svg"} />
            <div className={styles.errorText}>{sopError}</div>
            <button 
              className={styles.retryButton}
              onClick={handleGenerateSop}
            >
              Try Again
            </button>
          </div>
        )}

        {/* SOP Tab Content */}
        {sop && activeTab === "sop" && (
          <div className={styles.result}>
            <div className={styles.resultHeader}>
              <div className={styles.resultInfo}>
                Language: {sop.language} {sop.isEdited && "(Edited)"}
              </div>
              <div className={styles.resultActions}>
                <button 
                  className={styles.actionButton}
                  onClick={handleCopySop}
                  title="Copy SOP to clipboard"
                >
                  <ReactSVG src={URL + "editor/icons/copy.svg"} />
                </button>
                <button 
                  className={styles.actionButton}
                  onClick={handleDownloadSop}
                  title="Download SOP as text file"
                >
                  <ReactSVG src={URL + "editor/icons/download.svg"} />
                </button>
                <button 
                  className={styles.actionButton}
                  onClick={handleGenerateSop}
                  disabled={isGeneratingSop}
                  title="Regenerate SOP"
                >
                  <ReactSVG src={URL + "editor/icons/refresh.svg"} />
                </button>
              </div>
            </div>
            
            <div className={styles.sopEditor}>
              <textarea
                className={styles.sopTextarea}
                value={sop.content}
                onChange={(e) => handleSopEdit(e.target.value)}
                placeholder="Your SOP will appear here..."
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TranscriptionPanel; 