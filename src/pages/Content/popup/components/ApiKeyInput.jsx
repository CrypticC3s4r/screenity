import React, { useState, useContext, useEffect } from "react";

// Context
import { contentStateContext } from "../../context/ContentState";

const ApiKeyInput = () => {
  const [contentState, setContentState] = useContext(contentStateContext);
  const [apiKey, setApiKey] = useState("");
  const [isValid, setIsValid] = useState(null);

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
    const isValidKey = value.startsWith("sk-") && value.length > 20;
    setIsValid(isValidKey);

    // Save to storage
    chrome.storage.local.set({ 
      openaiApiKey: value,
      openaiApiKeyValid: isValidKey 
    });

    // Update context
    setContentState((prevContentState) => ({
      ...prevContentState,
      openaiApiKey: value,
      openaiApiKeyValid: isValidKey,
    }));
  };

  return (
    <div style={{ marginTop: "10px", marginBottom: "10px" }}>
      <div 
        style={{ 
          fontSize: "14px", 
          fontWeight: "500", 
          marginBottom: "8px",
          color: "#374151"
        }}
      >
        OpenAI API Key
      </div>
      <div style={{ position: "relative" }}>
        <input
          type="password"
          placeholder="sk-..."
          value={apiKey}
          onChange={handleApiKeyChange}
          style={{
            width: "100%",
            height: "40px",
            borderRadius: "8px",
            border: `1px solid ${isValid === false ? "#ef4444" : "#d1d5db"}`,
            paddingLeft: "12px",
            paddingRight: "40px",
            fontSize: "14px",
            fontFamily: "inherit",
            backgroundColor: "#f9fafb",
            boxSizing: "border-box",
          }}
          onFocus={(e) => {
            e.target.style.outline = "none";
            e.target.style.boxShadow = "0 0 0 2px rgba(59, 130, 246, 0.5)";
          }}
          onBlur={(e) => {
            e.target.style.boxShadow = "none";
          }}
        />
        {isValid !== null && (
          <div
            style={{
              position: "absolute",
              right: "12px",
              top: "50%",
              transform: "translateY(-50%)",
              fontSize: "12px",
              color: isValid ? "#10b981" : "#ef4444",
            }}
          >
            {isValid ? "✓" : "✗"}
          </div>
        )}
      </div>
      {isValid === false && (
        <div
          style={{
            fontSize: "12px",
            color: "#ef4444",
            marginTop: "4px",
          }}
        >
          Invalid API key format. Keys should start with "sk-"
        </div>
      )}
      <div
        style={{
          fontSize: "12px",
          color: "#6b7280",
          marginTop: "4px",
        }}
      >
        Get your API key from{" "}
        <span 
          style={{ color: "#3b82f6", cursor: "pointer", textDecoration: "underline" }}
          onClick={() => window.open("https://platform.openai.com/api-keys", "_blank")}
        >
          OpenAI Platform
        </span>
      </div>
    </div>
  );
};

export default ApiKeyInput; 