import { Coins } from 'lucide-react'
import type { FC } from 'react'
import { cn } from '@/lib/utils'

interface CreditBadgeProps {
  credits: number
  onClick?: () => void
}

function getCreditColor(credits: number): string {
  if (credits <= 0) return 'text-red-500'
  if (credits <= 30) return 'text-yellow-500'
  return 'text-green-500'
}

export const CreditBadge: FC<CreditBadgeProps> = ({ credits, onClick }) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium transition-colors hover:bg-muted/50',
        getCreditColor(credits),
      )}
      title={`${credits} credits remaining`}
    >
      <Coins className="h-3.5 w-3.5" />
      <span>{credits}</span>
    </button>
  )
}
