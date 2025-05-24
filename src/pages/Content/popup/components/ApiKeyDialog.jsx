import React, { useState, useContext, useEffect } from "react";
import * as Dialog from "@radix-ui/react-dialog";

// Context
import { contentStateContext } from "../../context/ContentState";

const ApiKeyDialog = ({ open, onOpenChange, shadowRef }) => {
  const [contentState, setContentState] = useContext(contentStateContext);
  const [apiKey, setApiKey] = useState("");
  const [isValid, setIsValid] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    // Load API key from storage on component mount
    chrome.storage.local.get(["openaiApiKey"], (result) => {
      if (result.openaiApiKey) {
        setApiKey(result.openaiApiKey);
        setIsValid(true);
      }
    });
  }, []);

  const handleApiKeyChange = (e) => {
    const value = e.target.value;
    setApiKey(value);
    
    // Basic validation - OpenAI API keys start with "sk-"
    const isValidKey = value.trim() === "" || value.startsWith("sk-");
    setIsValid(isValidKey);
  };

  const handleSave = async () => {
    if (!isValid && apiKey.trim() !== "") {
      return;
    }

    setIsSaving(true);
    
    try {
      if (apiKey.trim() === "") {
        // Remove API key
        await new Promise((resolve) => {
          chrome.storage.local.remove(["openaiApiKey"], resolve);
        });
      } else {
        // Save API key
        await new Promise((resolve) => {
          chrome.storage.local.set({ openaiApiKey: apiKey.trim() }, resolve);
        });
      }
      onOpenChange(false);
    } catch (error) {
      console.error("Error saving API key:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    // Reset to stored value
    chrome.storage.local.get(["openaiApiKey"], (result) => {
      setApiKey(result.openaiApiKey || "");
      setIsValid(result.openaiApiKey ? true : null);
    });
    onOpenChange(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal
        container={shadowRef?.current?.shadowRoot?.querySelector(".container")}
      >
        <Dialog.Overlay 
          style={{
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            position: "fixed",
            inset: 0,
            zIndex: 99999999,
            pointerEvents: "auto",
          }}
          onClick={(e) => {
            // Only close if clicking directly on the overlay, not on child elements
            if (e.target === e.currentTarget) {
              onOpenChange(false);
            }
          }}
        />
        <Dialog.Content
          style={{
            backgroundColor: "white",
            borderRadius: "15px",
            padding: "24px",
            position: "fixed",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: "90vw",
            maxWidth: "500px",
            maxHeight: "85vh",
            zIndex: 999999999,
            pointerEvents: "auto",
            boxShadow: "0px 10px 38px -10px rgba(22, 23, 24, 0.35), 0px 10px 20px -15px rgba(22, 23, 24, 0.2)",
            fontFamily: "'Satoshi-Medium', sans-serif",
            boxSizing: "border-box",
          }}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <Dialog.Title
            style={{
              fontSize: "18px",
              fontWeight: "600",
              color: "#29292F",
              marginBottom: "16px",
            }}
          >
            OpenAI API Key Settings
          </Dialog.Title>
          
          <Dialog.Description
            style={{
              fontSize: "14px",
              color: "#666",
              marginBottom: "20px",
              lineHeight: "1.5",
            }}
          >
            Enter your OpenAI API key to enable audio transcription with Whisper. 
            Your API key is stored locally and only used for transcription requests.
          </Dialog.Description>

          <div style={{ marginBottom: "20px" }}>
            <label
              style={{
                display: "block",
                fontSize: "14px",
                fontWeight: "500",
                color: "#29292F",
                marginBottom: "8px",
              }}
            >
              OpenAI API Key
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={handleApiKeyChange}
              placeholder="sk-..."
              style={{
                width: "100%",
                padding: "12px",
                border: `2px solid ${isValid === false ? "#EF4444" : "#E5E7EB"}`,
                borderRadius: "8px",
                fontSize: "14px",
                fontFamily: "'Satoshi-Medium', sans-serif",
                outline: "none",
                transition: "border-color 0.2s",
                boxSizing: "border-box",
              }}
              onFocus={(e) => {
                e.target.style.borderColor = isValid === false ? "#EF4444" : "#3080F8";
              }}
              onBlur={(e) => {
                e.target.style.borderColor = isValid === false ? "#EF4444" : "#E5E7EB";
              }}
            />
            {isValid === false && (
              <p style={{
                color: "#EF4444",
                fontSize: "12px",
                marginTop: "4px",
              }}>
                Please enter a valid OpenAI API key (starts with "sk-")
              </p>
            )}
            {apiKey && isValid && (
              <p style={{
                color: "#10B981",
                fontSize: "12px",
                marginTop: "4px",
              }}>
                API key looks valid ✓
              </p>
            )}
          </div>

          <div style={{
            fontSize: "12px",
            color: "#666",
            marginBottom: "24px",
            padding: "12px",
            backgroundColor: "#F9FAFB",
            borderRadius: "8px",
            lineHeight: "1.4",
          }}>
            <strong>Need an API key?</strong> Visit{" "}
            <a 
              href="https://platform.openai.com/api-keys" 
              target="_blank" 
              rel="noopener noreferrer"
              style={{ color: "#3080F8", textDecoration: "underline" }}
            >
              platform.openai.com/api-keys
            </a>{" "}
            to create one. Make sure you have credits in your OpenAI account.
          </div>

          <div style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: "12px",
            boxSizing: "border-box",
          }}>
            <button
              onClick={handleCancel}
              disabled={isSaving}
              style={{
                padding: "10px 20px",
                border: "2px solid #E5E7EB",
                borderRadius: "8px",
                backgroundColor: "white",
                color: "#374151",
                fontSize: "14px",
                fontWeight: "500",
                cursor: isSaving ? "not-allowed" : "pointer",
                opacity: isSaving ? 0.6 : 1,
                fontFamily: "'Satoshi-Medium', sans-serif",
                boxSizing: "border-box",
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving || (isValid === false)}
              style={{
                padding: "10px 20px",
                border: "none",
                borderRadius: "8px",
                backgroundColor: (isValid === false || isSaving) ? "#9CA3AF" : "#3080F8",
                color: "white",
                fontSize: "14px",
                fontWeight: "500",
                cursor: (isValid === false || isSaving) ? "not-allowed" : "pointer",
                fontFamily: "'Satoshi-Medium', sans-serif",
                boxSizing: "border-box",
              }}
            >
              {isSaving ? "Saving..." : "Save"}
            </button>
          </div>

          <Dialog.Close asChild>
            <button
              style={{
                position: "absolute",
                top: "16px",
                right: "16px",
                background: "none",
                border: "none",
                fontSize: "18px",
                cursor: "pointer",
                color: "#9CA3AF",
                width: "24px",
                height: "24px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
              aria-label="Close"
            >
              ×
            </button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

export default ApiKeyDialog; 