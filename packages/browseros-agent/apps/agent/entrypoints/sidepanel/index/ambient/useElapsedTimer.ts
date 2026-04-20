import { useEffect, useRef, useState } from 'react'

const formatElapsed = (elapsedMs: number): string => {
  const totalSeconds = Math.floor(elapsedMs / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

export function useElapsedTimer(active: boolean): string {
  const [elapsed, setElapsed] = useState('0:00')
  const startRef = useRef<number | null>(null)

  useEffect(() => {
    if (!active) {
      startRef.current = null
      setElapsed('0:00')
      return
    }

    startRef.current = Date.now()
    setElapsed('0:00')
    const tick = () => {
      if (startRef.current == null) return
      setElapsed(formatElapsed(Date.now() - startRef.current))
    }
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [active])

  return elapsed
}
