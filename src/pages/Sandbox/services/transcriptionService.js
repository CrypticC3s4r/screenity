// Transcription service using OpenAI Whisper API
class TranscriptionService {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.maxFileSize = 25 * 1024 * 1024; // 25MB limit
  }

  // Check if audio file needs to be chunked
  needsChunking(audioBlob) {
    return audioBlob.size > this.maxFileSize;
  }

  // Create audio chunks for files over 25MB
  async createAudioChunks(audioBlob, durationSeconds) {
    const chunks = [];
    const chunkDuration = 10 * 60; // 10 minutes per chunk
    const totalChunks = Math.ceil(durationSeconds / chunkDuration);

    for (let i = 0; i < totalChunks; i++) {
      const startTime = i * chunkDuration;
      const endTime = Math.min((i + 1) * chunkDuration, durationSeconds);
      
      // Use FFmpeg to create chunk (this would need to be implemented)
      // For now, we'll create a simple chunk based on size
      const chunkSize = Math.floor(audioBlob.size / totalChunks);
      const start = i * chunkSize;
      const end = i === totalChunks - 1 ? audioBlob.size : (i + 1) * chunkSize;
      
      const chunkBlob = audioBlob.slice(start, end, audioBlob.type);
      chunks.push({
        blob: chunkBlob,
        startTime: startTime,
        endTime: endTime,
        index: i
      });
    }

    return chunks;
  }

  // Transcribe a single audio chunk
  async transcribeChunk(audioBlob, language = null) {
    const formData = new FormData();
    formData.append('file', audioBlob, 'audio.mp3');
    formData.append('model', 'whisper-1');
    formData.append('response_format', 'verbose_json');
    formData.append('timestamp_granularities[]', 'word');
    
    if (language) {
      formData.append('language', language);
    }

    try {
      const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: formData
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`OpenAI API error: ${response.status} - ${errorData.error?.message || 'Unknown error'}`);
      }

      const result = await response.json();
      return result;
    } catch (error) {
      console.error('Transcription error:', error);
      throw error;
    }
  }

  // Transcribe complete audio file (handles chunking if needed)
  async transcribeAudio(audioBlob, durationSeconds) {
    try {
      if (this.needsChunking(audioBlob)) {
        // Handle large files with chunking
        const chunks = await this.createAudioChunks(audioBlob, durationSeconds);
        const transcriptions = [];

        for (const chunk of chunks) {
          const result = await this.transcribeChunk(chunk.blob);
          
          // Adjust timestamps for chunk offset
          if (result.words) {
            result.words = result.words.map(word => ({
              ...word,
              start: word.start + chunk.startTime,
              end: word.end + chunk.startTime
            }));
          }
          
          transcriptions.push({
            ...result,
            chunkIndex: chunk.index,
            chunkStartTime: chunk.startTime,
            chunkEndTime: chunk.endTime
          });
        }

        return this.mergeTranscriptions(transcriptions);
      } else {
        // Handle normal-sized files
        return await this.transcribeChunk(audioBlob);
      }
    } catch (error) {
      console.error('Full transcription error:', error);
      throw error;
    }
  }

  // Merge multiple chunk transcriptions into one
  mergeTranscriptions(transcriptions) {
    const mergedText = transcriptions.map(t => t.text).join(' ');
    const allWords = transcriptions.flatMap(t => t.words || []);
    
    return {
      text: mergedText,
      words: allWords,
      language: transcriptions[0]?.language || 'en',
      duration: transcriptions[transcriptions.length - 1]?.chunkEndTime || 0
    };
  }

  // Format transcription for display with timestamps
  formatTranscriptionWithTimestamps(transcription) {
    if (!transcription.words) {
      return transcription.text;
    }

    let formatted = '';
    let currentTime = 0;
    const timestampInterval = 30; // Add timestamp every 30 seconds

    transcription.words.forEach((word, index) => {
      // Add timestamp marker every 30 seconds
      if (word.start >= currentTime + timestampInterval) {
        currentTime = Math.floor(word.start / timestampInterval) * timestampInterval;
        const minutes = Math.floor(currentTime / 60);
        const seconds = currentTime % 60;
        formatted += `\n\n[${minutes}:${seconds.toString().padStart(2, '0')}] `;
      }

      formatted += word.word;
      
      // Add space after word if next word doesn't start with punctuation
      if (index < transcription.words.length - 1) {
        const nextWord = transcription.words[index + 1];
        if (!nextWord.word.match(/^[.,!?;:]/)) {
          formatted += ' ';
        }
      }
    });

    return formatted.trim();
  }
}

export default TranscriptionService; 