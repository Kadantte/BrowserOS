import { Check, Copy, FolderTree } from 'lucide-react'
import { type FC, useState } from 'react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface CwdChipProps {
  cwd: string
}

export const CwdChip: FC<CwdChipProps> = ({ cwd }) => {
  const [justCopied, setJustCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(cwd)
      setJustCopied(true)
      toast.success('Working dir copied')
      window.setTimeout(() => setJustCopied(false), 1500)
    } catch {
      toast.error('Could not copy')
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={cn(
        'group/cwd inline-flex items-center gap-1 rounded font-mono text-xs',
        'text-muted-foreground transition-colors hover:text-foreground',
      )}
      title={cwd}
    >
      <FolderTree className="size-3" />
      <span className="max-w-[18ch] truncate">{cwd}</span>
      {justCopied ? (
        <Check className="size-3 text-emerald-600" />
      ) : (
        <Copy className="size-3 opacity-0 transition-opacity group-hover/cwd:opacity-60" />
      )}
    </button>
  )
}
