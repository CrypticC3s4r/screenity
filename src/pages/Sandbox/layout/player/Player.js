import React, { useContext, useState } from "react";

// Components
import PlayerNav from "./PlayerNav";
import CropNav from "../editor/CropNav";
import AudioNav from "../editor/AudioNav";
import RightPanel from "./RightPanel";
import TranscriptionPanel from "./TranscriptionPanel";
import Content from "./Content";

import styles from "../../styles/player/_Player.module.scss";

// Context
import { ContentStateContext } from "../../context/ContentState"; // Import the ContentState context

const Player = () => {
  const [contentState, setContentState] = useContext(ContentStateContext); // Access the ContentState context
  const [isTranscriptionOpen, setIsTranscriptionOpen] = useState(false);

  const handleToggleTranscription = () => {
    setIsTranscriptionOpen(!isTranscriptionOpen);
  };

  const handleCloseTranscription = () => {
    setIsTranscriptionOpen(false);
  };

  return (
    <div className={styles.layout}>
      {contentState.mode === "crop" && <CropNav />}
      {contentState.mode === "player" && <PlayerNav />}
      {contentState.mode === "audio" && <AudioNav />}
      <div className={styles.content}>
        <Content />
        <div className={styles.panels}>
          <RightPanel 
            onToggleTranscription={handleToggleTranscription}
            isTranscriptionOpen={isTranscriptionOpen}
          />
          <TranscriptionPanel 
            isOpen={isTranscriptionOpen}
            onClose={handleCloseTranscription}
          />
        </div>
      </div>
    </div>
  );
};

export default Player;
