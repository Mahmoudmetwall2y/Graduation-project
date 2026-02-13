'use client'

import { useState, useEffect } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useParams } from 'next/navigation'
import Link from 'next/link'

interface Session {
  id: string
  status: string
  created_at: string
  device_id: string
  ended_at: string | null
}

interface Prediction {
  id: string
  modality: string
  model_name: string
  model_version: string
  output_json: any
  latency_ms: number
  created_at: string
}

export default function SessionDetailPage() {
  const params = useParams()
  const sessionId = params.id as string
  
  const [session, setSession] = useState<Session | null>(null)
  const [predictions, setPredictions] = useState<Prediction[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClientComponentClient()

  // Polling for real-time updates (free alternative to Supabase Realtime)
  useEffect(() => {
    if (sessionId) {
      fetchSessionData()
      
      // Poll every 3 seconds for updates
      const interval = setInterval(fetchSessionData, 3000)
      
      return () => clearInterval(interval)
    }
  }, [sessionId])

  const fetchSessionData = async () => {
    try {
      // Fetch session
      const { data: sessionData, error: sessionError } = await supabase
        .from('sessions')
        .select('*')
        .eq('id', sessionId)
        .single()

      if (sessionError) throw sessionError
      setSession(sessionData)

      // Fetch predictions
      const { data: predictionsData, error: predError } = await supabase
        .from('predictions')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true })

      if (predError) throw predError
      setPredictions(predictionsData || [])
    } catch (error) {
      console.error('Error fetching session data:', error)
    } finally {
      setLoading(false)
    }
  }

  // Supabase Realtime subscription (disabled - using polling instead)
  // This avoids needing Supabase paid plan for Realtime
  /*
  const subscribeToUpdates = () => {
    const channel = supabase
      .channel(`session-${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'sessions',
          filter: `id=eq.${sessionId}`,
        },
        (payload) => {
          setSession(payload.new as Session)
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'predictions',
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          setPredictions((prev) => [...prev, payload.new as Prediction])
        }
      )
      .subscribe()

    return () => {
      channel.unsubscribe()
    }
  }
  */

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      created: 'bg-gray-100 text-gray-800',
      streaming: 'bg-blue-100 text-blue-800',
      processing: 'bg-yellow-100 text-yellow-800',
      done: 'bg-green-100 text-green-800',
      error: 'bg-red-100 text-red-800',
    }
    return colors[status] || 'bg-gray-100 text-gray-800'
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">Loading session...</div>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center text-red-600">Session not found</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <Link href="/" className="text-2xl font-bold text-gray-900 hover:text-gray-700">
                AscultiCor
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="mb-6">
            <Link href="/" className="text-blue-600 hover:text-blue-800">
              ← Back to Dashboard
            </Link>
          </div>

          <div className="bg-white shadow rounded-lg p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h1 className="text-2xl font-bold text-gray-900">
                Session {session.id.slice(0, 8)}
              </h1>
              <span
                className={`px-3 py-1 inline-flex text-sm leading-5 font-semibold rounded-full ${getStatusColor(
                  session.status
                )}`}
              >
                {session.status}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm text-gray-600">
              <div>
                <span className="font-medium">Created:</span>{' '}
                {new Date(session.created_at).toLocaleString()}
              </div>
              <div>
                <span className="font-medium">Device:</span>{' '}
                {session.device_id.slice(0, 8)}
              </div>
              {session.ended_at && (
                <div>
                  <span className="font-medium">Ended:</span>{' '}
                  {new Date(session.ended_at).toLocaleString()}
                </div>
              )}
            </div>
          </div>

          <h2 className="text-xl font-bold text-gray-900 mb-4">Predictions</h2>

          {predictions.length === 0 ? (
            <div className="bg-white shadow rounded-lg p-6 text-center text-gray-500">
              {session.status === 'streaming' || session.status === 'processing'
                ? 'Processing... Predictions will appear here.'
                : 'No predictions available for this session.'}
            </div>
          ) : (
            <div className="space-y-4">
              {predictions.map((prediction) => (
                <div key={prediction.id} className="bg-white shadow rounded-lg p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-900">
                      {prediction.modality.toUpperCase()} Prediction
                    </h3>
                    <span className="text-sm text-gray-500">
                      {new Date(prediction.created_at).toLocaleString()}
                    </span>
                  </div>

                  <div className="space-y-2">
                    {prediction.modality === 'pcg' && (
                      <div>
                        <span className="font-medium">Classification:</span>{' '}
                        <span
                          className={`inline-flex px-2 py-1 text-sm rounded ${
                            prediction.output_json?.label === 'Normal'
                              ? 'bg-green-100 text-green-800'
                              : prediction.output_json?.label === 'Murmur'
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {prediction.output_json?.label}
                        </span>
                      </div>
                    )}

                    {prediction.modality === 'ecg' && (
                      <div>
                        <span className="font-medium">Prediction:</span>{' '}
                        <span
                          className={`inline-flex px-2 py-1 text-sm rounded ${
                            prediction.output_json?.prediction === 'Normal'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {prediction.output_json?.prediction}
                        </span>
                        {prediction.output_json?.confidence && (
                          <span className="ml-2 text-gray-600">
                            (Confidence: {(prediction.output_json.confidence * 100).toFixed(1)}%)
                          </span>
                        )}
                      </div>
                    )}

                    <div className="text-sm text-gray-600">
                      <span className="font-medium">Model:</span>{' '}
                      {prediction.model_name} ({prediction.model_version})
                    </div>

                    <div className="text-sm text-gray-600">
                      <span className="font-medium">Latency:</span>{' '}
                      {prediction.latency_ms}ms
                    </div>

                    {prediction.output_json?.demo_mode && (
                      <div className="text-sm text-yellow-600 italic">
                        Demo Mode - Using simulated predictions
                      </div>
                    )}

                    {prediction.output_json?.probabilities && (
                      <div className="mt-4">
                        <span className="font-medium text-sm">Probabilities:</span>
                        <div className="mt-2 space-y-1">
                          {Object.entries(prediction.output_json.probabilities).map(
                            ([key, value]: [string, any]) => (
                              <div key={key} className="flex items-center text-sm">
                                <span className="w-24 text-gray-600">{key}:</span>
                                <div className="flex-1 mx-2 bg-gray-200 rounded-full h-2">
                                  <div
                                    className="bg-blue-600 h-2 rounded-full"
                                    style={{ width: `${(value as number) * 100}%` }}
                                  />
                                </div>
                                <span className="w-16 text-right">
                                  {((value as number) * 100).toFixed(1)}%
                                </span>
                              </div>
                            )
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
