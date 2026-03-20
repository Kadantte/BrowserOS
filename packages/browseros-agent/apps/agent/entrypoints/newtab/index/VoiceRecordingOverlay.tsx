import { Loader2, Square } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { type FC, useEffect, useRef, useState } from 'react'
import { useVoiceVisualizer, VoiceVisualizer } from 'react-voice-visualizer'
import { transcribeAudio } from '@/lib/voice/transcribe-audio'

interface VoiceRecordingOverlayProps {
  onTranscriptionComplete: (text: string) => void
  onClose: () => void
  onRecordingStarted?: () => void
  onRecordingStopped?: () => void
  onTranscriptionError?: (error: string) => void
}

export const VoiceRecordingOverlay: FC<VoiceRecordingOverlayProps> = ({
  onTranscriptionComplete,
  onClose,
  onRecordingStarted,
  onRecordingStopped,
  onTranscriptionError,
}) => {
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const hasStartedRef = useRef(false)
  const processingRef = useRef(false)
  const cancelledRef = useRef(false)

  const recorderControls = useVoiceVisualizer({
    onStartRecording: () => {
      onRecordingStarted?.()
    },
    onStopRecording: () => {
      onRecordingStopped?.()
    },
  })

  const {
    startRecording,
    stopRecording,
    recordedBlob,
    isRecordingInProgress,
    formattedRecordingTime,
    error: recorderError,
    isProcessingStartRecording,
  } = recorderControls

  // Auto-start recording on mount
  useEffect(() => {
    if (hasStartedRef.current) return
    hasStartedRef.current = true
    startRecording()
  }, [startRecording])

  // Handle recorder errors (e.g., permission denied)
  useEffect(() => {
    if (!recorderError) return
    const msg =
      recorderError.name === 'NotAllowedError'
        ? 'Microphone permission denied'
        : recorderError.name === 'NotFoundError'
          ? 'No microphone found'
          : recorderError.message
    setError(msg)
    onTranscriptionError?.(msg)
  }, [recorderError, onTranscriptionError])

  // Handle recorded blob → transcription
  useEffect(() => {
    if (!recordedBlob || processingRef.current) return
    if (cancelledRef.current) {
      onClose()
      return
    }
    processingRef.current = true
    setIsTranscribing(true)

    transcribeAudio(recordedBlob)
      .then((text) => {
        if (text.trim()) {
          onTranscriptionComplete(text.trim())
        } else {
          setError('No speech detected')
          onTranscriptionError?.('No speech detected')
        }
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : 'Transcription failed'
        setError(msg)
        onTranscriptionError?.(msg)
      })
      .finally(() => {
        setIsTranscribing(false)
      })
  }, [recordedBlob, onTranscriptionComplete, onTranscriptionError, onClose])

  // Auto-dismiss on error after a delay
  useEffect(() => {
    if (!error) return
    const timer = setTimeout(onClose, 3000)
    return () => clearTimeout(timer)
  }, [error, onClose])

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
      >
        {/* Backdrop */}
        {/* biome-ignore lint/a11y/useKeyWithClickEvents: backdrop dismiss pattern */}
        {/* biome-ignore lint/a11y/noStaticElementInteractions: backdrop dismiss pattern */}
        <div
          className="absolute inset-0 bg-background/80 backdrop-blur-sm"
          onClick={() => {
            if (isRecordingInProgress) {
              cancelledRef.current = true
              stopRecording()
            } else {
              onClose()
            }
          }}
        />

        {/* Overlay content */}
        <motion.div
          className="relative z-10 mx-4 flex w-full max-w-lg flex-col items-center gap-6 rounded-3xl border border-border/50 bg-card p-8 shadow-2xl"
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 20 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
        >
          {error ? (
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="rounded-full bg-destructive/10 p-3">
                <Square className="h-5 w-5 text-destructive" />
              </div>
              <p className="text-center text-destructive text-sm">{error}</p>
            </div>
          ) : isTranscribing ? (
            <div className="flex flex-col items-center gap-3 py-4">
              <Loader2 className="h-8 w-8 animate-spin text-[var(--accent-orange)]" />
              <p className="font-medium text-muted-foreground text-sm">
                Transcribing...
              </p>
            </div>
          ) : isProcessingStartRecording ? (
            <div className="flex flex-col items-center gap-3 py-4">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <p className="font-medium text-muted-foreground text-sm">
                Requesting microphone access...
              </p>
            </div>
          ) : (
            <>
              {/* Waveform visualization */}
              <div className="w-full overflow-hidden rounded-2xl">
                <VoiceVisualizer
                  controls={recorderControls}
                  height={120}
                  width="100%"
                  backgroundColor="transparent"
                  mainBarColor="var(--accent-orange)"
                  secondaryBarColor="hsl(var(--muted-foreground) / 0.3)"
                  barWidth={3}
                  gap={2}
                  rounded={5}
                  speed={3}
                  isControlPanelShown={false}
                  isDownloadAudioButtonShown={false}
                  onlyRecording
                  isDefaultUIShown={false}
                />
              </div>

              {/* Recording time */}
              {isRecordingInProgress && (
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
                  <span className="font-mono text-muted-foreground text-sm">
                    {formattedRecordingTime}
                  </span>
                </div>
              )}

              {/* Stop button */}
              {isRecordingInProgress && (
                <button
                  type="button"
                  onClick={() => stopRecording()}
                  className="flex cursor-pointer items-center gap-2 rounded-full bg-red-600 px-6 py-3 font-medium text-sm text-white shadow-lg transition-all duration-200 hover:bg-red-700 hover:shadow-xl active:scale-95"
                >
                  <Square className="h-4 w-4" />
                  Stop Recording
                </button>
              )}

              {/* Cancel hint */}
              <p className="text-muted-foreground/60 text-xs">
                Click outside to cancel
              </p>
            </>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
