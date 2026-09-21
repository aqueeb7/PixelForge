import { ref, computed } from 'vue'
import { cloneBuffer, FRAMEBUFFER_SIZE } from './usePixelDrawing'

const MAX_HISTORY_DEPTH = 50

export function useCanvasHistory(initialBuffer?: Uint8Array) {
  const current = ref<Uint8Array>(
    initialBuffer ? cloneBuffer(initialBuffer) : new Uint8Array(FRAMEBUFFER_SIZE)
  )

  const past = ref<Uint8Array[]>([])
  const future = ref<Uint8Array[]>([])

  const canUndo = computed(() => past.value.length > 0)
  const canRedo = computed(() => future.value.length > 0)

  /**
   * Commits a state snapshot before a new action occurred.
   * Discards the redo branch and bounds history to 50 states.
   */
  function commitBeforeMutation(snapshotBefore: Uint8Array) {
    past.value.push(cloneBuffer(snapshotBefore))
    if (past.value.length > MAX_HISTORY_DEPTH) {
      past.value.shift() // FIFO eviction
    }
    future.value = [] // Discard future on new branch
  }

  function undo(): boolean {
    if (!canUndo.value) return false

    const previous = past.value.pop()!
    future.value.push(cloneBuffer(current.value))
    current.value = cloneBuffer(previous)
    return true
  }

  function redo(): boolean {
    if (!canRedo.value) return false

    const next = future.value.pop()!
    past.value.push(cloneBuffer(current.value))
    current.value = cloneBuffer(next)
    return true
  }

  function reset(newBuffer?: Uint8Array) {
    past.value = []
    future.value = []
    current.value = newBuffer ? cloneBuffer(newBuffer) : new Uint8Array(FRAMEBUFFER_SIZE)
  }

  return {
    current,
    past,
    future,
    canUndo,
    canRedo,
    commitBeforeMutation,
    undo,
    redo,
    reset,
  }
}
