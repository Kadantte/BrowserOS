import type { FC } from 'react'

interface EditorialHeaderProps {
  title: string
  subtitleParts?: (string | null | undefined)[]
}

export const EditorialHeader: FC<EditorialHeaderProps> = ({
  title,
  subtitleParts,
}) => {
  const parts = (subtitleParts ?? []).filter(
    (p): p is string => !!p && p.trim().length > 0,
  )

  const joined = parts.join(' · ')

  return (
    <div className="mb-9">
      <div
        className="font-serif text-[32px] leading-[1.05] tracking-[-0.5px] sm:text-[44px] sm:tracking-[-1px]"
        style={{ fontFamily: 'var(--font-serif)' }}
      >
        {title}
      </div>
      {joined && (
        <div className="mt-1.5 text-[13px] text-muted-foreground">{joined}</div>
      )}
    </div>
  )
}
