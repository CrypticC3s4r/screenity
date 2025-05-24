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

  // Generate SOP from transcription using OpenAI GPT-4o
  async generateSOP(transcriptionText, language = 'en') {
    try {
      // Create language-specific prompt based on the user's SOP format
      const languagePrompts = {
        'en': `Generate a Standard Operating Procedure (SOP) in markdown format following this exact structure and professional tone. Extract all key steps, processes, and procedures from the video transcription and organize them according to the template below.

Follow this structure:
# Standard Operating Procedure (SOP)
[Process Title]

## 1. Purpose/Objective (Zweck)
[Clear description of what this SOP covers]

## 2. Scope (Geltungsbereich) 
[Define what systems, processes, or areas this SOP covers]

## 3. Process Overview (Überblick über den Prozess)
[High-level summary with bullet points using ● for main points]

## 4. Detailed Process Steps (Detaillierte Prozessschritte)
[Use hierarchical numbering: 4.1, 4.1.1, 4.1.2, etc.]
[Use ● for bullet points and ○ for sub-bullets]
[Include specific field requirements with ■ for detailed items]

## 5. Error Handling and Security Measures (Fehlerbehandlung und Sicherheitsmaßnahmen) - if applicable
[Safety measures, troubleshooting, fallback procedures]

## 6. Communication and Notifications (Kommunikation und Benachrichtigungen) - if applicable
[Email processes, alerts, status updates]

## 7. Conclusion (Schlussfolgerung)
[Summary of the complete process and its benefits]

Use professional, clear, and instructional language. Include specific technical details, system names, and step-by-step instructions with proper sub-sectioning.`,

        'de': `Erstelle eine Standardarbeitsanweisung (SOP) im Markdown-Format nach dieser exakten Struktur und professionellem Ton. Extrahiere alle wichtigen Schritte, Prozesse und Verfahren aus der Videotranskription und organisiere sie nach der unten stehenden Vorlage.

Folge dieser Struktur:
# Standard Operating Procedure (SOP)
[Prozess-Titel]

## 1. Zweck
[Klare Beschreibung dessen, was diese SOP abdeckt]

## 2. Geltungsbereich
[Definiere, welche Systeme, Prozesse oder Bereiche diese SOP abdeckt]

## 3. Überblick über den Prozess
[Übergeordnete Zusammenfassung mit Aufzählungspunkten mit ● für Hauptpunkte]

## 4. Detaillierte Prozessschritte
[Verwende hierarchische Nummerierung: 4.1, 4.1.1, 4.1.2, etc.]
[Verwende ● für Aufzählungspunkte und ○ für Unter-Aufzählungen]
[Schließe spezifische Feldanforderungen mit ■ für detaillierte Punkte ein]

## 5. Fehlerbehandlung und Sicherheitsmaßnahmen - falls zutreffend
[Sicherheitsmaßnahmen, Fehlerbehebung, Ausweichverfahren]

## 6. Kommunikation und Benachrichtigungen - falls zutreffend
[E-Mail-Prozesse, Benachrichtigungen, Statusupdates]

## 7. Schlussfolgerung
[Zusammenfassung des kompletten Prozesses und seiner Vorteile]

Verwende professionelle, klare und anleitende Sprache. Schließe spezifische technische Details, Systemnamen und schrittweise Anleitungen mit korrekter Unter-Gliederung ein.`,

        'es': `Genera un Procedimiento Operativo Estándar (POE) en formato markdown siguiendo esta estructura exacta y tono profesional. Extrae todos los pasos clave, procesos y procedimientos de la transcripción del video y organízalos según la plantilla siguiente.

Sigue esta estructura:
# Procedimiento Operativo Estándar (POE)
[Título del Proceso]

## 1. Propósito
[Descripción clara de lo que cubre este POE]

## 2. Alcance
[Define qué sistemas, procesos o áreas cubre este POE]

## 3. Resumen del Proceso
[Resumen de alto nivel con viñetas usando ● para puntos principales]

## 4. Pasos Detallados del Proceso
[Usa numeración jerárquica: 4.1, 4.1.1, 4.1.2, etc.]
[Usa ● para viñetas y ○ para sub-viñetas]
[Incluye requisitos de campos específicos con ■ para elementos detallados]

## 5. Manejo de Errores y Medidas de Seguridad - si aplica
[Medidas de seguridad, resolución de problemas, procedimientos de respaldo]

## 6. Comunicación y Notificaciones - si aplica
[Procesos de email, alertas, actualizaciones de estado]

## 7. Conclusión
[Resumen del proceso completo y sus beneficios]

Usa lenguaje profesional, claro e instructivo. Incluye detalles técnicos específicos, nombres de sistemas e instrucciones paso a paso con subsecciones apropiadas.`,

        'fr': `Générez une Procédure Opérationnelle Standard (POS) en format markdown suivant cette structure exacte et ce ton professionnel. Extrayez toutes les étapes clés, processus et procédures de la transcription vidéo et organisez-les selon le modèle suivant.

Suivez cette structure:
# Procédure Opérationnelle Standard (POS)
[Titre du Processus]

## 1. Objectif
[Description claire de ce que couvre cette POS]

## 2. Portée
[Définit quels systèmes, processus ou domaines cette POS couvre]

## 3. Aperçu du Processus
[Résumé de haut niveau avec puces utilisant ● pour les points principaux]

## 4. Étapes Détaillées du Processus
[Utilisez la numérotation hiérarchique: 4.1, 4.1.1, 4.1.2, etc.]
[Utilisez ● pour les puces et ○ pour les sous-puces]
[Incluez les exigences de champs spécifiques avec ■ pour les éléments détaillés]

## 5. Gestion des Erreurs et Mesures de Sécurité - si applicable
[Mesures de sécurité, dépannage, procédures de secours]

## 6. Communication et Notifications - si applicable
[Processus d'email, alertes, mises à jour de statut]

## 7. Conclusion
[Résumé du processus complet et de ses avantages]

Utilisez un langage professionnel, clair et instructif. Incluez des détails techniques spécifiques, des noms de systèmes et des instructions étape par étape avec une sous-section appropriée.`
      };

      const systemPrompt = languagePrompts[language] || languagePrompts['en'];

      const prompt = `${systemPrompt}

Transcription to analyze:
${transcriptionText}

Requirements:
1. Extract all processes, tools, systems, and procedures mentioned
2. Organize into the exact hierarchy shown above with proper markdown formatting
3. Use ● for main bullet points, ○ for sub-bullets, ■ for detailed requirements
4. Include specific system names, field names, and technical details
5. Use hierarchical numbering (4.1, 4.1.1, 4.1.2) for process steps
6. Write in clear, professional, instructional tone
7. Include error handling and communication sections only if relevant to the process
8. Provide a comprehensive conclusion summarizing the automated workflow

Generate the SOP in ${language} language with markdown formatting.`;

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [
            {
              role: 'system',
              content: 'You are an expert technical writer specialized in creating comprehensive Standard Operating Procedures (SOPs) from video transcriptions. You follow exact formatting templates and extract all procedural information to create professional, actionable documentation in markdown format. You maintain the specific structure, numbering, and bullet point styles provided in the template.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          max_tokens: 4000,
          temperature: 0.2
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`OpenAI API error: ${response.status} - ${errorData.error?.message || 'Unknown error'}`);
      }

      const result = await response.json();
      
      if (!result.choices || !result.choices[0] || !result.choices[0].message) {
        throw new Error('Invalid response from OpenAI API');
      }

      return result.choices[0].message.content.trim();
    } catch (error) {
      console.error('SOP generation error:', error);
      throw error;
    }
  }
}

export default TranscriptionService; 