# Supabase Realtime Free Tier Workarounds

## The Problem
Supabase free tier has Realtime limitations:
- Limited concurrent connections
- Limited message rate
- May require paid plan for production use

## Solution 1: Polling (Easiest - Free)
Instead of Realtime, use periodic polling:

### Update Frontend to Use Polling

Create a hook for polling:

```typescript
// frontend/src/hooks/usePolling.ts
import { useState, useEffect, useCallback } from 'react'

export function usePolling<T>(
  fetchFn: () => Promise<T>,
  interval: number = 5000, // 5 seconds
  enabled: boolean = true
) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const fetchData = useCallback(async () => {
    try {
      const result = await fetchFn()
      setData(result)
      setError(null)
    } catch (err) {
      setError(err as Error)
    } finally {
      setLoading(false)
    }
  }, [fetchFn])

  useEffect(() => {
    if (!enabled) return

    // Initial fetch
    fetchData()

    // Set up polling
    const intervalId = setInterval(fetchData, interval)

    return () => clearInterval(intervalId)
  }, [fetchData, interval, enabled])

  return { data, loading, error, refetch: fetchData }
}
```

Use it in components:

```typescript
// In your device page
import { usePolling } from '@/hooks/usePolling'

function DevicePage({ deviceId }: { deviceId: string }) {
  const { data: deviceData, loading } = usePolling(
    () => fetch(`/api/devices/${deviceId}`).then(r => r.json()),
    3000 // Poll every 3 seconds
  )

  // Rest of your component...
}
```

## Solution 2: Self-Hosted Realtime (Advanced)

Deploy your own Realtime server:

```yaml
# docker-compose.yml addition
  realtime:
    image: supabase/realtime:latest
    ports:
      - "4000:4000"
    environment:
      - PORT=4000
      - DB_HOST=db
      - DB_PORT=5432
      - DB_NAME=postgres
      - DB_USER=postgres
      - DB_PASSWORD=your-password
      - DB_SSL=false
      - JWT_SECRET=your-jwt-secret
    depends_on:
      - db
```

## Solution 3: Pusher/Ably Free Tier

Use free tier of dedicated realtime services:

### Option A: Pusher (Free: 200k messages/day)
```typescript
// frontend/src/lib/pusher.ts
import Pusher from 'pusher-js'

const pusher = new Pusher('your-app-key', {
  cluster: 'eu',
  forceTLS: true
})

export const subscribeToDevice = (deviceId: string, callback: Function) => {
  const channel = pusher.subscribe(`device-${deviceId}`)
  channel.bind('update', callback)
  return () => channel.unbind('update', callback)
}
```

### Option B: Ably (Free: 6M messages/month)
```typescript
import { Realtime } from 'ably'

const ably = new Realtime.Promise('your-api-key')

export const subscribeToDevice = async (deviceId: string, callback: Function) => {
  const channel = ably.channels.get(`device-${deviceId}`)
  await channel.subscribe('update', callback)
  return () => channel.unsubscribe('update')
}
```

## Solution 4: WebSocket Server (Self-Hosted)

Add a simple WebSocket server to your inference service:

```python
# inference/app/websocket.py
from fastapi import WebSocket, WebSocketDisconnect
from typing import List

class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []
    
    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
    
    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)
    
    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            await connection.send_json(message)

manager = ConnectionManager()

# In main.py
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            # Handle incoming messages
    except WebSocketDisconnect:
        manager.disconnect(websocket)

# Broadcast updates when device status changes
async def notify_device_update(device_id: str, data: dict):
    await manager.broadcast({
        "type": "device_update",
        "device_id": device_id,
        "data": data
    })
```

## Solution 5: Server-Sent Events (SSE)

Lightweight alternative to WebSockets:

```typescript
// API Route: frontend/src/app/api/devices/[id]/events/route.ts
import { NextResponse } from 'next/server'

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const deviceId = params.id
  
  const stream = new ReadableStream({
    start(controller) {
      // Send initial data
      controller.enqueue(`data: ${JSON.stringify({ connected: true })}\n\n`)
      
      // Set up interval to poll database
      const interval = setInterval(async () => {
        const data = await fetchDeviceData(deviceId)
        controller.enqueue(`data: ${JSON.stringify(data)}\n\n`)
      }, 3000)
      
      // Cleanup on close
      request.signal.addEventListener('abort', () => {
        clearInterval(interval)
        controller.close()
      })
    }
  })
  
  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    }
  })
}
```

Use in frontend:
```typescript
useEffect(() => {
  const eventSource = new EventSource(`/api/devices/${deviceId}/events`)
  
  eventSource.onmessage = (event) => {
    const data = JSON.parse(event.data)
    setDeviceData(data)
  }
  
  return () => eventSource.close()
}, [deviceId])
```

## Recommended: Simple Polling Implementation

Here's the easiest free solution - just update the device page:

```typescript
// frontend/src/app/devices/[id]/page.tsx - Update the useEffect

useEffect(() => {
  // Initial fetch
  fetchDeviceData()
  
  // Poll every 3 seconds instead of using Realtime
  const interval = setInterval(fetchDeviceData, 3000)
  
  return () => clearInterval(interval)
}, [deviceId])

// Remove or comment out the Supabase Realtime subscription
// const subscribeToUpdates = () => { ... }
```

## Comparison

| Solution | Cost | Complexity | Real-time | Best For |
|----------|------|------------|-----------|----------|
| **Polling** | Free | Low | 3-5 sec delay | Small deployments |
| **Self-hosted Realtime** | Free | High | Yes | Large deployments |
| **Pusher Free** | Free | Medium | Yes | < 200k msg/day |
| **Ably Free** | Free | Medium | Yes | < 6M msg/month |
| **WebSocket** | Free | Medium | Yes | Custom needs |
| **SSE** | Free | Low | Yes | One-way updates |

## Quick Fix: Disable Realtime for Now

Just comment out the Realtime subscription code:

```typescript
// In device pages, replace this:
/*
const subscribeToUpdates = () => {
  const channel = supabase
    .channel(`device-${deviceId}`)
    .on('postgres_changes', ...)
    .subscribe()
  return () => channel.unsubscribe()
}
*/

// With this:
const subscribeToUpdates = () => {
  // Realtime disabled - using polling instead
  return () => {}
}
```

And add polling:
```typescript
useEffect(() => {
  fetchDeviceData()
  const interval = setInterval(fetchDeviceData, 3000)
  return () => clearInterval(interval)
}, [deviceId])
```

## Summary

**For your graduation project, I recommend:**

1. **Use polling** (simplest, completely free)
2. **Poll every 3-5 seconds** - good enough for demo
3. **Works with free Supabase** - no Realtime needed
4. **Easy to implement** - just add setInterval

This will work perfectly for:
- Demo presentations
- Testing multiple devices
- Development and debugging
- Small-scale deployments

When you need real Realtime later, upgrade to:
- Supabase Pro ($25/month), OR
- Pusher/Ably free tier, OR
- Self-hosted solution

Want me to update the code to use polling instead of Realtime?
