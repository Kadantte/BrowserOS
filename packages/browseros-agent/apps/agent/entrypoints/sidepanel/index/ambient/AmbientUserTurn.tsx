import type { FC, ReactNode } from 'react'

interface AmbientUserTurnProps {
  children: ReactNode
}

export const AmbientUserTurn: FC<AmbientUserTurnProps> = ({ children }) => (
  <div className="mt-8 mb-5 flex gap-3.5">
    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--accent-orange-soft)] font-semibold text-[var(--accent-orange)] text-xs">
      U
    </div>
    <div className="pt-1 font-medium text-[15px] leading-[1.55]">
      {children}
    </div>
  </div>
)
