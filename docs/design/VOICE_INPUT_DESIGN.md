# Voice Input for Todo Creation - Design Document

## Summary

Add speech-to-text functionality allowing users to create todo items by speaking into their microphone instead of typing.

## Motivation

Voice input provides:
- Faster todo capture for hands-free scenarios
- Accessibility improvement for users with motor impairments
- Mobile-friendly input method
- Natural interaction pattern users expect from modern apps

## Architecture

### High-Level Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                         Browser                                  │
│  ┌──────────┐    ┌─────────────┐    ┌──────────────────────┐   │
│  │ Mic Btn  │───▶│ Audio       │───▶│ Speech Recognition   │   │
│  │ (UI)     │    │ Capture     │    │ (Web Speech/Whisper) │   │
│  └──────────┘    └─────────────┘    └──────────┬───────────┘   │
│                                                 │                │
│                                                 ▼                │
│  ┌──────────┐    ┌─────────────┐    ┌──────────────────────┐   │
│  │ Create   │◀───│ Todo Input  │◀───│ Transcribed Text     │   │
│  │ Todo     │    │ Field       │    │                      │   │
│  └──────────┘    └─────────────┘    └──────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘

Whisper API Path (fallback for unsupported browsers):
┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐
│ Browser │───▶│ Lambda  │───▶│ Whisper │───▶│ Text    │
│ Audio   │    │ /transcribe   │ API     │    │ Response│
└─────────┘    └─────────┘    └─────────┘    └─────────┘
```

### Technology Options

| Option | Pros | Cons |
|--------|------|------|
| **Web Speech API** | Free, real-time, no backend | Chrome/Edge only, less accurate |
| **OpenAI Whisper** | High accuracy, all browsers | Costs $0.006/min, adds latency |
| **AWS Transcribe** | AWS ecosystem | Complex setup, higher cost |

### Recommended Approach: Hybrid

1. **Primary**: Web Speech API for supported browsers (Chrome, Edge)
2. **Fallback**: Whisper API for unsupported browsers (Firefox, Safari)

This provides the best user experience while minimizing costs.

## Detailed Design

### Frontend Components

#### New Files

| File | Purpose |
|------|---------|
| `src/components/VoiceInput.tsx` | Mic button component with recording UI |
| `src/hooks/useVoiceInput.ts` | Audio capture and speech recognition logic |
| `src/hooks/useSpeechRecognition.ts` | Web Speech API wrapper |
| `src/types/Voice.ts` | TypeScript interfaces |

#### VoiceInput Component

```typescript
interface VoiceInputProps {
  onTranscript: (text: string) => void;
  disabled?: boolean;
}

type VoiceInputState = 'idle' | 'listening' | 'processing' | 'error';
```

**Visual States:**

| State | Icon | Color | Animation |
|-------|------|-------|-----------|
| idle | Mic | Gray | None |
| listening | Mic | Red | Pulse + waveform |
| processing | Spinner | Blue | Spin |
| error | Mic + X | Red | Shake |

#### UI Integration

Modify `TodoInput.tsx` to include the mic button:

```
┌────────────────────────────────────────────────────┐
│ ┌──────────────────────────────┐ ┌───┐ ┌───────┐  │
│ │ What needs to be done?       │ │🎤 │ │  Add  │  │
│ └──────────────────────────────┘ └───┘ └───────┘  │
│         Text Input               Mic    Submit    │
└────────────────────────────────────────────────────┘
```

#### Audio Capture Implementation

**Web Speech API Path:**
```typescript
const useSpeechRecognition = () => {
  const recognition = new webkitSpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = navigator.language;

  return {
    start: () => recognition.start(),
    stop: () => recognition.stop(),
    onResult: (callback) => {
      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        callback(transcript);
      };
    },
  };
};
```

**Whisper API Path (MediaRecorder):**
```typescript
const useMediaRecorder = () => {
  const startRecording = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
      }
    });
    const recorder = new MediaRecorder(stream, {
      mimeType: 'audio/webm;codecs=opus'
    });
    // Collect chunks until stopped
  };

  const stopRecording = async () => {
    // Return audio blob for upload
  };
};
```

### Backend Changes

#### New API Endpoint

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/transcribe` | Convert audio to text via Whisper |

**Request:**
```
POST /transcribe
Content-Type: multipart/form-data
Authorization: Bearer <token>

audio: <binary audio data>
```

**Response:**
```json
{
  "text": "Buy groceries and pick up dry cleaning"
}
```

#### Lambda Handler Addition

```javascript
// backend/handler.mjs
case 'POST /transcribe':
  // 1. Verify authentication
  const userId = await verifyToken(event);

  // 2. Parse multipart form data
  const audioBuffer = parseAudioFromEvent(event);

  // 3. Validate audio
  if (audioBuffer.length > 25 * 1024 * 1024) {
    return { statusCode: 413, body: 'Audio too large (max 25MB)' };
  }

  // 4. Call Whisper API
  const formData = new FormData();
  formData.append('file', audioBuffer, 'audio.webm');
  formData.append('model', 'whisper-1');

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}` },
    body: formData,
  });

  // 5. Return transcription
  const { text } = await response.json();
  return { statusCode: 200, body: JSON.stringify({ text }) };
```

#### Infrastructure Changes

**`backend/template.yaml` additions:**

```yaml
# New route
/transcribe:
  post:
    x-amazon-apigateway-integration:
      uri: !Sub arn:aws:apigateway:${AWS::Region}:lambda:path/...

# Environment variable
Environment:
  Variables:
    OPENAI_API_KEY: '{{resolve:secretsmanager:todo-app-secrets:SecretString:OPENAI_API_KEY}}'

# Increased limits for audio
MemorySize: 512
Timeout: 30
```

### User Experience Flow

```
1. User clicks mic button
   └─▶ Browser shows permission prompt (first time only)

2. Permission granted
   └─▶ UI shows "listening" state with visual feedback

3. User speaks: "Buy milk and eggs"
   └─▶ Web Speech: Real-time interim results shown
   └─▶ Whisper: Waveform animation shown

4. User clicks mic again OR 2s silence detected
   └─▶ Recording stops
   └─▶ Web Speech: Final transcript ready
   └─▶ Whisper: "Processing..." shown, audio uploaded

5. Transcript received
   └─▶ Text populates input field
   └─▶ Input field focused for editing

6. User reviews and presses Enter or clicks Add
   └─▶ Normal todo creation flow
```

### Error Handling

| Error | Detection | User Message |
|-------|-----------|--------------|
| Mic permission denied | `NotAllowedError` | "Microphone access denied. Please allow in browser settings." |
| No mic available | `NotFoundError` | "No microphone found. Please connect a microphone." |
| No speech detected | Silence timeout | "No speech detected. Tap to try again." |
| Network error | Fetch failure | "Connection error. Please check your internet." |
| Transcription failed | API error | "Couldn't understand audio. Please try again." |
| Browser unsupported | Feature detection | Hide button or show "Voice input not supported" |

### Accessibility

- **Keyboard shortcut**: `Ctrl+Shift+M` (Cmd+Shift+M on Mac) toggles recording
- **ARIA labels**:
  - Idle: "Start voice input"
  - Listening: "Recording, tap to stop"
  - Processing: "Processing speech"
- **Screen reader announcements**:
  - "Recording started"
  - "Recording stopped, processing"
  - "Transcription complete: [text]"
- **Focus management**: Return focus to input field after transcription

### Browser Support

| Browser | Web Speech API | Whisper Fallback |
|---------|----------------|------------------|
| Chrome 33+ | ✅ | Not needed |
| Edge 79+ | ✅ | Not needed |
| Safari 14.1+ | ❌ | ✅ Required |
| Firefox | ❌ | ✅ Required |
| Mobile Chrome | ✅ | Not needed |
| Mobile Safari | ❌ | ✅ Required |

### Feature Detection

```typescript
const supportsWebSpeechAPI = () => {
  return 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
};

const supportsMediaRecorder = () => {
  return 'MediaRecorder' in window && navigator.mediaDevices?.getUserMedia;
};

const getVoiceInputMethod = () => {
  if (supportsWebSpeechAPI()) return 'webspeech';
  if (supportsMediaRecorder()) return 'whisper';
  return 'unsupported';
};
```

## Implementation Plan

### Phase 1: Web Speech API (Frontend Only)

**Scope:**
- VoiceInput component with Web Speech API
- Integration with TodoInput
- Basic error handling
- Works in Chrome/Edge only

**Files:**
- `src/components/VoiceInput.tsx`
- `src/hooks/useSpeechRecognition.ts`
- `src/components/TodoInput.tsx` (modify)

**No backend changes required.**

### Phase 2: Whisper API Fallback

**Scope:**
- MediaRecorder audio capture
- `/transcribe` Lambda endpoint
- OpenAI Whisper integration
- Full browser support

**Files:**
- `src/hooks/useMediaRecorder.ts`
- `src/hooks/useVoiceInput.ts` (add Whisper path)
- `backend/handler.mjs` (add endpoint)
- `backend/template.yaml` (add route, secrets)

### Phase 3: Polish

**Scope:**
- Silence detection (auto-stop after 2s)
- Waveform visualization
- Language selection
- Keyboard shortcuts

## Cost Analysis

### Whisper API Costs

- Rate: $0.006 per minute of audio

**Estimated usage:**
- 100 daily active users
- 5 voice todos per user per day
- Average 5 seconds per recording

**Monthly calculation:**
```
100 users × 5 todos × 5 seconds × 30 days = 75,000 seconds = 1,250 minutes
1,250 minutes × $0.006 = $7.50/month
```

### Cost Controls

1. **Max recording length**: 30 seconds (prevents accidental long recordings)
2. **Rate limiting**: 10 transcriptions per user per minute
3. **Feature flag**: Can disable Whisper fallback if costs spike

## Security Considerations

1. **Audio data**: Never stored, processed in-memory only
2. **Authentication**: `/transcribe` requires valid Clerk JWT
3. **Input validation**: Audio format and size validated before processing
4. **API key protection**: OpenAI key stored in AWS Secrets Manager
5. **HTTPS only**: Audio transmitted over encrypted connection

## Testing Strategy

### Unit Tests

- VoiceInput component renders correctly in each state
- useSpeechRecognition hook handles events properly
- Error states display correct messages

### Integration Tests

- Mock SpeechRecognition API
- Mock MediaRecorder API
- Verify transcript flows to TodoInput

### Manual Testing

- Test on Chrome, Edge, Safari, Firefox
- Test on mobile devices
- Test with various accents/languages
- Test in noisy environments

## Open Questions

1. **Auto-submit vs edit-first?**
   - Recommendation: Populate input field, let user edit and submit manually
   - Rationale: Reduces errors from mis-transcription

2. **Maximum recording length?**
   - Recommendation: 30 seconds
   - Rationale: Todos should be concise; limits costs

3. **Language support?**
   - Web Speech API: Uses browser locale
   - Whisper: Auto-detects language
   - Future: Add language selector dropdown

4. **Offline support?**
   - Web Speech API requires internet (uses Google servers)
   - Whisper requires internet
   - No offline voice input in initial implementation

## References

- [Web Speech API - MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API)
- [OpenAI Whisper API](https://platform.openai.com/docs/guides/speech-to-text)
- [MediaRecorder API - MDN](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder)
