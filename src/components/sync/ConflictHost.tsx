import { useEffect, useRef, useState } from 'react'

import { setConflictResolver, type Conflict, type ConflictResolution } from '@/sync/syncService'
import { ConflictDialog } from './ConflictDialog'

/**
 * Bridges the sync service to the dialog.
 *
 * The service is plain module code with no React knowledge; it asks a resolver
 * function what to do and awaits the answer. This component installs that resolver
 * once, mounted in the app shell so a conflict can surface from any screen —
 * including a push triggered by leaving the editor.
 *
 * Conflicts are queued rather than dropped: a drain can hit several in a row, and
 * each deserves its own answer.
 */
export function ConflictHost() {
  const [current, setCurrent] = useState<Conflict | null>(null)
  const queue = useRef<{ conflict: Conflict; resolve: (r: ConflictResolution) => void }[]>([])
  const pending = useRef<((r: ConflictResolution) => void) | null>(null)

  useEffect(() => {
    setConflictResolver(
      (conflict) =>
        new Promise<ConflictResolution>((resolve) => {
          queue.current.push({ conflict, resolve })
          // Only show one at a time; the rest wait their turn.
          if (pending.current === null) advance()
        }),
    )
    // Deliberately not reset on unmount: the shell lives for the whole session, and
    // clearing the resolver would silently turn conflicts back into "skip".
  }, [])

  const advance = () => {
    const next = queue.current.shift()
    if (next === undefined) {
      pending.current = null
      setCurrent(null)
      return
    }
    pending.current = next.resolve
    setCurrent(next.conflict)
  }

  const handleResolve = (resolution: ConflictResolution) => {
    const resolve = pending.current
    pending.current = null
    setCurrent(null)
    resolve?.(resolution)
    // Let the dialog close before the next one opens.
    queueMicrotask(advance)
  }

  return <ConflictDialog conflict={current} onResolve={handleResolve} />
}
