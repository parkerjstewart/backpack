'use client'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { SourceDetailContent } from './SourceDetailContent'
import { useTranslation } from '@/lib/hooks/use-translation'

interface SourceDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  sourceId: string | null
  onRemove?: (sourceId: string) => void
}

export function SourceDialog({ open, onOpenChange, sourceId, onRemove }: SourceDialogProps) {
  const { t } = useTranslation()

  const sourceIdWithPrefix = sourceId
    ? (sourceId.includes(':') ? sourceId : `source:${sourceId}`)
    : null

  const handleClose = () => {
    onOpenChange(false)
  }

  if (!sourceIdWithPrefix) {
    return null
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader className="sr-only">
          <DialogTitle>{t.sources.detailsTitle}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-hidden">
          <SourceDetailContent
            sourceId={sourceIdWithPrefix}
            onClose={handleClose}
            onRemove={onRemove}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
