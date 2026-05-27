type Handler<T = unknown> = (payload: T) => void

class EventBus {
  private listeners: Map<string, Handler[]> = new Map()

  on<T>(event: string, handler: Handler<T>) {
    const list = this.listeners.get(event) ?? []
    list.push(handler as Handler)
    this.listeners.set(event, list)
  }

  off<T>(event: string, handler: Handler<T>) {
    const list = this.listeners.get(event) ?? []
    this.listeners.set(event, list.filter(h => h !== handler))
  }

  emit<T>(event: string, payload?: T) {
    const list = this.listeners.get(event) ?? []
    for (const h of list) h(payload as unknown)
  }
}

export const bus = new EventBus()
