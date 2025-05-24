async function getAudioMP3(ffmpeg, videoBlob) {
  try {
    // Set the input video file name
    const videoData = new Uint8Array(await videoBlob.arrayBuffer());
    ffmpeg.FS("writeFile", "input.mp4", videoData);

    // Define the output audio file name
    const outputAudioFileName = "output-audio.mp3";

    // Run FFmpeg to extract audio from the video and convert to MP3
    await ffmpeg.run(
      "-i",
      "input.mp4",
      "-vn", // No video
      "-acodec", 
      "mp3",
      "-ab", 
      "128k", // 128kbps bitrate for smaller file size
      "-ar", 
      "44100", // 44.1kHz sample rate
      "-y", // Overwrite output file
      outputAudioFileName
    );

    // Get the extracted audio data
    const audioData = ffmpeg.FS("readFile", outputAudioFileName);

    // Create a Blob from the audio data
    const audioBlob = new Blob([audioData.buffer], { type: "audio/mp3" });

    // Clean up
    ffmpeg.FS("unlink", "input.mp4");
    ffmpeg.FS("unlink", outputAudioFileName);

    // Return the audio Blob
    return audioBlob;
  } catch (error) {
    console.error("Error extracting MP3 audio from video:", error);
    throw error;
  }
}

export default getAudioMP3; 