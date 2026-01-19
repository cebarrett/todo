# Voice Input for Todo Creation - Design Document

## Summary

Add speech-to-text functionality allowing users to create todo items by speaking into their microphone instead of typing. Uses OpenAI Whisper API for accurate, multilingual transcription.

## Motivation

Voice input provides:
- Faster todo capture for hands-free scenarios
- Accessibility improvement for users with motor impairments
- Mobile-friendly input method
- Natural interaction pattern users expect from modern apps
- **Seamless multilingual support** for polyglot users without language configuration

## Architecture

### High-Level Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                         Browser                                  │
│  ┌──────────┐    ┌─────────────┐    ┌──────────────────────┐   │
│  │ Mic Btn  │───▶│ MediaRecorder───▶│ Audio Blob           │   │
│  │ (UI)     │    │ API         │    │ (webm/opus)          │   │
│  └──────────┘    └─────────────┘    └──────────┬───────────┘   │
└──────────────────────────────────────────────────┼──────────────┘
                                                   │
                                                   ▼
┌──────────────────────────────────────────────────────────────────┐
│                         Backend                                   │
│  ┌─────────────┐    ┌─────────────┐    ┌────────────────────┐   │
│  │ Lambda      │───▶│ Whisper API │───▶│ Transcribed Text   │   │
│  │ /transcribe │    │ (OpenAI)    │    │ + Detected Language│   │
│  └─────────────┘    └─────────────┘    └────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
                                                   │
                                                   ▼
┌──────────────────────────────────────────────────────────────────┐
│                         Browser                                   │
│  ┌──────────┐    ┌─────────────┐    ┌──────────────────────┐   │
│  │ Create   │◀───│ Todo Input  │◀───│ Response JSON        │   │
│  │ Todo     │    │ Field       │    │                      │   │
│  └──────────┘    └─────────────┘    └──────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

### Why Whisper API

| Consideration | Whisper API |
|---------------|-------------|
| **Language detection** | Automatic - no user configuration needed |
| **Code-switching** | Handles mixed languages naturally ("Necesito buy leche") |
| **Accuracy** | High accuracy across 100+ languages |
| **Browser support** | Works in all modern browsers via MediaRecorder |
| **Consistency** | Same behavior everywhere |
| **Cost** | ~$0.006/min (~$7.50/month at 100 DAU) |

**Why not Web Speech API?**
- Requires manual language selection
- Poor code-switching support (common for polyglot users)
- Chrome/Edge only
- Inconsistent accuracy across languages

The cost trade-off (~$7.50/month) is worth the seamless multilingual experience.

## Detailed Design

### Frontend Components

#### New Files

| File | Purpose |
|------|---------|
| `src/components/VoiceInput.tsx` | Mic button component with recording UI |
| `src/hooks/useVoiceInput.ts` | Audio capture and transcription logic |
| `src/types/Voice.ts` | TypeScript interfaces |

#### VoiceInput Component

```typescript
interface VoiceInputProps {
  onTranscript: (text: string, language?: string) => void;
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

```typescript
const useVoiceInput = () => {
  const [state, setState] = useState<VoiceInputState>('idle');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const startRecording = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        sampleRate: 16000,
      }
    });

    const recorder = new MediaRecorder(stream, {
      mimeType: 'audio/webm;codecs=opus'
    });

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.start(100); // Collect in 100ms chunks
    mediaRecorderRef.current = recorder;
    setState('listening');
  };

  const stopRecording = async (): Promise<TranscriptionResult> => {
    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current;
      if (!recorder) return;

      recorder.onstop = async () => {
        setState('processing');
        const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
        chunksRef.current = [];

        // Send to backend for transcription
        const result = await transcribe(audioBlob);
        setState('idle');
        resolve(result);
      };

      recorder.stop();
      recorder.stream.getTracks().forEach(track => track.stop());
    });
  };

  return { state, startRecording, stopRecording };
};
```

#### Transcription API Call

```typescript
interface TranscriptionResult {
  text: string;
  language: string;
}

const transcribe = async (audioBlob: Blob): Promise<TranscriptionResult> => {
  const token = await getToken();
  const formData = new FormData();
  formData.append('audio', audioBlob, 'recording.webm');

  const response = await fetch(`${API_URL}/transcribe`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  if (!response.ok) {
    throw new Error('Transcription failed');
  }

  return response.json();
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
  "text": "Comprar leche y pan",
  "language": "es"
}
```

The `language` field returns the ISO 639-1 code of the detected language, useful for analytics and future features.

#### Lambda Handler Addition

```javascript
// backend/handler.mjs
import { Readable } from 'stream';
import Busboy from 'busboy';

case 'POST /transcribe':
  // 1. Verify authentication
  const userId = await verifyToken(event);
  if (!userId) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  // 2. Parse multipart form data
  const audioBuffer = await parseMultipartAudio(event);

  // 3. Validate audio
  if (!audioBuffer || audioBuffer.length === 0) {
    return { statusCode: 400, body: JSON.stringify({ error: 'No audio provided' }) };
  }
  if (audioBuffer.length > 25 * 1024 * 1024) {
    return { statusCode: 413, body: JSON.stringify({ error: 'Audio too large (max 25MB)' }) };
  }

  // 4. Call Whisper API
  const formData = new FormData();
  formData.append('file', new Blob([audioBuffer]), 'audio.webm');
  formData.append('model', 'whisper-1');
  formData.append('response_format', 'verbose_json'); // Includes language detection

  const whisperResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: formData,
  });

  if (!whisperResponse.ok) {
    console.error('Whisper API error:', await whisperResponse.text());
    return { statusCode: 502, body: JSON.stringify({ error: 'Transcription service error' }) };
  }

  // 5. Return transcription with detected language
  const { text, language } = await whisperResponse.json();
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: text.trim(), language }),
  };
```

#### Infrastructure Changes

**`backend/template.yaml` additions:**

```yaml
# API Gateway route
/transcribe:
  post:
    x-amazon-apigateway-integration:
      httpMethod: POST
      type: aws_proxy
      uri: !Sub arn:aws:apigateway:${AWS::Region}:lambda:path/2015-03-31/functions/${TodoFunction.Arn}/invocations

# Lambda configuration updates
TodoFunction:
  Properties:
    MemorySize: 512          # Increased for audio processing
    Timeout: 30              # Longer timeout for Whisper API calls
    Environment:
      Variables:
        OPENAI_API_KEY: '{{resolve:secretsmanager:todo-app-secrets:SecretString:OPENAI_API_KEY}}'

# Add busboy dependency for multipart parsing
```

**`backend/package.json` addition:**

```json
{
  "dependencies": {
    "busboy": "^1.6.0"
  }
}
```

### User Experience Flow

```
1. User clicks mic button
   └─▶ Browser shows permission prompt (first time only)

2. Permission granted
   └─▶ UI shows "listening" state with red pulsing mic
   └─▶ Waveform animation shows audio levels

3. User speaks (any language): "Comprar leche and pick up kids"
   └─▶ Audio captured via MediaRecorder

4. User clicks mic again OR 2s silence detected
   └─▶ Recording stops
   └─▶ UI shows "processing" spinner

5. Audio sent to /transcribe endpoint
   └─▶ Whisper auto-detects language
   └─▶ Returns accurate transcription

6. Transcript received
   └─▶ Text populates input field: "Comprar leche and pick up kids"
   └─▶ Input field focused for editing

7. User reviews and presses Enter or clicks Add
   └─▶ Normal todo creation flow
```

### Error Handling

| Error | Detection | User Message |
|-------|-----------|--------------|
| Mic permission denied | `NotAllowedError` | "Microphone access denied. Please allow in browser settings." |
| No mic available | `NotFoundError` | "No microphone found. Please connect a microphone." |
| No speech detected | Empty transcription | "No speech detected. Tap to try again." |
| Network error | Fetch failure | "Connection error. Please check your internet." |
| Transcription failed | API error | "Couldn't process audio. Please try again." |
| Browser unsupported | No MediaRecorder | Hide button (rare - only very old browsers) |

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

MediaRecorder API is supported in all modern browsers:

| Browser | Supported |
|---------|-----------|
| Chrome 49+ | ✅ |
| Edge 79+ | ✅ |
| Safari 14.1+ | ✅ |
| Firefox 25+ | ✅ |
| Mobile Chrome | ✅ |
| Mobile Safari 14.1+ | ✅ |

### Feature Detection

```typescript
const supportsVoiceInput = (): boolean => {
  return !!(
    navigator.mediaDevices?.getUserMedia &&
    window.MediaRecorder
  );
};

// Hide mic button if not supported
{supportsVoiceInput() && <VoiceInput onTranscript={handleTranscript} />}
```

## Implementation Plan

### Phase 1: Core Functionality

**Scope:**
- VoiceInput component with MediaRecorder
- `/transcribe` Lambda endpoint with Whisper integration
- Basic error handling
- Works in all modern browsers

**Frontend Files:**
- `src/components/VoiceInput.tsx`
- `src/hooks/useVoiceInput.ts`
- `src/types/Voice.ts`
- `src/components/TodoInput.tsx` (modify)

**Backend Files:**
- `backend/handler.mjs` (add endpoint)
- `backend/template.yaml` (add route, env var, config)
- `backend/package.json` (add busboy)

### Phase 2: Polish

**Scope:**
- Silence detection (auto-stop after 2s of silence)
- Waveform visualization during recording
- Keyboard shortcut (Ctrl+Shift+M)
- Better loading states

### Phase 3: Analytics & Optimization

**Scope:**
- Track language distribution from detected languages
- Audio compression optimization
- Caching layer for repeated phrases (optional)

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

**At scale (1,000 DAU):** ~$75/month

### Cost Controls

1. **Max recording length**: 30 seconds (prevents accidental long recordings)
2. **Rate limiting**: 10 transcriptions per user per minute
3. **Monitoring**: Alert if daily costs exceed threshold
4. **Feature flag**: Can disable voice input if costs spike unexpectedly

## Security Considerations

1. **Audio data**: Never stored permanently, processed in-memory only
2. **Authentication**: `/transcribe` requires valid Clerk JWT
3. **Input validation**: Audio format and size validated before processing
4. **API key protection**: OpenAI key stored in AWS Secrets Manager
5. **HTTPS only**: Audio transmitted over encrypted connection
6. **Rate limiting**: Prevents abuse and cost spikes

## Testing Strategy

### Unit Tests

- VoiceInput component renders correctly in each state
- useVoiceInput hook manages state transitions properly
- Error states display correct messages
- Feature detection works correctly

### Integration Tests

- Mock MediaRecorder API
- Mock fetch for /transcribe endpoint
- Verify transcript flows to TodoInput correctly
- Test error handling paths

### Backend Tests

- `/transcribe` endpoint validates authentication
- Rejects oversized audio files
- Handles Whisper API errors gracefully
- Returns correct response format

### Manual Testing

- Test on Chrome, Edge, Safari, Firefox
- Test on iOS and Android devices
- Test with various languages (English, Spanish, Mandarin, etc.)
- Test code-switching scenarios
- Test in noisy environments
- Test with different microphone qualities

## Multilingual Support

### Supported Languages

Whisper supports 100+ languages with automatic detection. Common languages with high accuracy:

- English, Spanish, French, German, Italian, Portuguese
- Mandarin, Japanese, Korean
- Arabic, Hindi, Russian
- And many more

### Code-Switching Examples

Whisper handles mixed-language input naturally:

| Spoken | Transcription |
|--------|---------------|
| "Necesito comprar milk" | "Necesito comprar milk" |
| "Call お母さん tomorrow" | "Call お母さん tomorrow" |
| "Reminder: завтра meeting" | "Reminder: завтра meeting" |

No language selection required - users speak naturally and Whisper figures it out.

## Open Questions

1. **Auto-submit vs edit-first?**
   - Recommendation: Populate input field, let user edit and submit manually
   - Rationale: Reduces errors from mis-transcription

2. **Maximum recording length?**
   - Recommendation: 30 seconds
   - Rationale: Todos should be concise; limits costs

3. **Show detected language?**
   - Option: Show small flag/label indicating detected language
   - Could help users verify correct detection

4. **Offline support?**
   - Not in initial implementation (Whisper requires internet)
   - Future: Could explore on-device models like Whisper.cpp

## References

- [OpenAI Whisper API](https://platform.openai.com/docs/guides/speech-to-text)
- [MediaRecorder API - MDN](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder)
- [Whisper Language Support](https://platform.openai.com/docs/guides/speech-to-text/supported-languages)
