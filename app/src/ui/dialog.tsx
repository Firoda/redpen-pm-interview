/* Modal dialog and right-side sheet on Radix. Scrim, no blur. 250ms in / 150ms out. */
import * as D from '@radix-ui/react-dialog'
import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import { cx } from './cx'

export function Dialog({ open, onOpenChange, title, description, children, footer, width = 440 }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: ReactNode; description?: ReactNode; children?: ReactNode; footer?: ReactNode; width?: number
}) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-40 bg-[var(--scrim)] animate-fade" />
        <D.Content
          style={{ width }}
          className="fixed left-1/2 top-1/2 z-50 max-h-[85vh] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-xl bg-elevated p-6 shadow-3 focus:outline-none animate-pop"
        >
          <D.Title className="text-title-3 text-primary">{title}</D.Title>
          {description ? <D.Description className="mt-1.5 text-callout text-secondary">{description}</D.Description> : <D.Description className="sr-only">{String(title)}</D.Description>}
          {children ? <div className="mt-4">{children}</div> : null}
          {footer ? <div className="mt-6 flex justify-end gap-2">{footer}</div> : null}
        </D.Content>
      </D.Portal>
    </D.Root>
  )
}

export function Sheet({ open, onOpenChange, title, children, footer, width = 520 }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: ReactNode; children?: ReactNode; footer?: ReactNode; width?: number
}) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-40 bg-[var(--scrim)] animate-fade" />
        <D.Content
          style={{ width }}
          className={cx('fixed right-0 top-0 z-50 flex h-full max-w-full flex-col bg-elevated shadow-3 focus:outline-none',
            'data-[state=open]:animate-[rp-sheet_250ms_var(--ease-enter)_both]')}
        >
          <div className="flex items-center justify-between border-b border-border px-6 py-4">
            <D.Title className="text-title-3 text-primary">{title}</D.Title>
            <D.Description className="sr-only">{String(title)}</D.Description>
            <D.Close className="rounded-md p-1.5 text-secondary hover:bg-hover" aria-label="Close"><X size={18} /></D.Close>
          </div>
          <div className="flex-1 overflow-auto px-6 py-5">{children}</div>
          {footer ? <div className="flex justify-end gap-2 border-t border-border px-6 py-4">{footer}</div> : null}
        </D.Content>
      </D.Portal>
    </D.Root>
  )
}
