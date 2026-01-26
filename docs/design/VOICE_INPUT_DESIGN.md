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

The VoiceInput component renders a microphone button that cycles through four states: idle, listening, processing, and error. It accepts an `onTranscript` callback that receives the transcribed text and detected language, plus an optional `disabled` prop.

**Visual States:**

| State | Icon | Color | Animation |
|-------|------|-------|-----------|
| idle | Mic | Gray | None |
| listening | Mic | Red | Pulse + waveform |
| processing | Spinner | Blue | Spin |
| error | Mic + X | Red | Shake |

#### UI Integration

The mic button sits between the text input and the Add button in TodoInput:

```
┌────────────────────────────────────────────────────┐
│ ┌──────────────────────────────┐ ┌───┐ ┌───────┐  │
│ │ What needs to be done?       │ │🎤 │ │  Add  │  │
│ └──────────────────────────────┘ └───┘ └───────┘  │
│         Text Input               Mic    Submit    │
└────────────────────────────────────────────────────┘
```

#### useVoiceInput Hook

The hook manages the recording lifecycle:

1. **startRecording**: Requests microphone permission via `getUserMedia`, creates a MediaRecorder with webm/opus format, and begins collecting audio chunks in 100ms intervals. Sets state to "listening".

2. **stopRecording**: Stops the MediaRecorder, assembles chunks into a single audio blob, releases the microphone, sends the blob to the `/transcribe` endpoint, and returns the transcription result. Transitions through "processing" state while waiting for the API response.

3. **State management**: Tracks current state (idle/listening/processing/error) and exposes it to the component for UI rendering.

Audio settings should enable echo cancellation and noise suppression for cleaner recordings.

#### Transcription API Call

The frontend sends the audio blob as multipart form data to the `/transcribe` endpoint with the user's auth token. The response includes both the transcribed text and the detected language code. On error, the hook surfaces an appropriate error message to display.

### Backend Changes

#### New API Endpoint

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/transcribe` | Convert audio to text via Whisper |

**Request:** Multipart form data with `audio` field containing the recording, plus Bearer token authorization.

**Response:** JSON with `text` (the transcription) and `language` (ISO 639-1 code of detected language).

#### Lambda Handler

The `/transcribe` handler performs these steps:

1. **Authentication**: Verify the Clerk JWT and extract the user ID. Return 401 if invalid.

2. **Parse audio**: Extract the audio data from the multipart form body using a library like Busboy.

3. **Validate**: Check that audio was provided and doesn't exceed 25MB. Return 400/413 for validation failures.

4. **Call Whisper**: Forward the audio to OpenAI's `/v1/audio/transcriptions` endpoint with model `whisper-1` and `response_format` set to `verbose_json` to include language detection.

5. **Return result**: Extract the text and language from Whisper's response and return as JSON. Log and return 502 on Whisper API errors.

#### Infrastructure Changes

**template.yaml updates:**
- Add route for `POST /transcribe` pointing to the Lambda function
- Increase Lambda memory to 512MB for audio processing
- Increase timeout to 30 seconds for Whisper API latency
- Add `OPENAI_API_KEY` environment variable resolved from Secrets Manager

**package.json updates:**
- Add `busboy` dependency for parsing multipart form data

### User Experience Flow

1. **User clicks mic button** → Browser shows permission prompt (first time only)

2. **Permission granted** → UI shows "listening" state with red pulsing mic and waveform animation

3. **User speaks** (any language): "Comprar leche and pick up kids" → Audio captured via MediaRecorder

4. **User clicks mic again OR 2s silence detected** → Recording stops, UI shows "processing" spinner

5. **Audio sent to /transcribe** → Whisper auto-detects language, returns accurate transcription

6. **Transcript received** → Text populates input field, input field receives focus for editing

7. **User reviews and submits** → Normal todo creation flow

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
- **ARIA labels**: Dynamic based on state - "Start voice input", "Recording, tap to stop", "Processing speech"
- **Screen reader announcements**: Announce state transitions and completed transcription
- **Focus management**: Return focus to input field after transcription completes

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

Before rendering the mic button, check for MediaRecorder and getUserMedia support. Hide the button entirely on unsupported browsers rather than showing a disabled state.

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
