import React, { useEffect, useRef } from 'react'
import { AlertCircle } from 'lucide-react'

interface ConfirmModalProps {
    isOpen: boolean
    title: string
    message: string
    confirmText?: string
    cancelText?: string
    isDangerous?: boolean
    isProcessing?: boolean
    error?: string | null
    onConfirm: () => void
    onCancel: () => void
}

export function ConfirmModal({
    isOpen,
    title,
    message,
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    isDangerous = true,
    isProcessing = false,
    error,
    onConfirm,
    onCancel
}: ConfirmModalProps) {
    const primaryRef = useRef<HTMLButtonElement | null>(null)

    useEffect(() => {
        if (!isOpen) return

        const handleKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onCancel()
            if (event.key === 'Enter') onConfirm()
        }

        window.addEventListener('keydown', handleKey)
        // Focus the primary button automatically when modal opens
        setTimeout(() => primaryRef.current?.focus(), 50)

        return () => window.removeEventListener('keydown', handleKey)
    }, [isOpen, onCancel, onConfirm])

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div
                className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
                onClick={onCancel}
            />

            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="confirm-modal-title"
                className="relative bg-card border border-border rounded-2xl shadow-2xl max-w-sm w-full p-6 animate-in fade-in zoom-in-95 duration-200"
            >
                <div className="text-center mb-6">
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-3 
            ${isDangerous ? 'bg-red-100 dark:bg-red-950/30' : 'bg-primary/10 dark:bg-primary/20'}`}
                    >
                        <AlertCircle className={`w-7 h-7 ${isDangerous ? 'text-red-600 dark:text-red-400' : 'text-primary'}`} />
                    </div>

                    <h2 id="confirm-modal-title" className="text-xl font-bold text-foreground">
                        {title}
                    </h2>

                    <p className="text-sm text-muted-foreground mt-2">
                        {message}
                    </p>
                </div>

                {error && (
                    <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 text-sm text-red-700 dark:text-red-400">
                        {error}
                    </div>
                )}

                <div className="flex gap-3 mt-6">
                    <button
                        onClick={onCancel}
                        disabled={isProcessing}
                        className="btn-ghost flex-1"
                    >
                        {cancelText}
                    </button>

                    <button
                        ref={primaryRef}
                        onClick={onConfirm}
                        disabled={isProcessing}
                        className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-colors disabled:opacity-50
              ${isDangerous
                                ? 'bg-red-600 hover:bg-red-700'
                                : 'bg-primary hover:bg-primary/90'
                            }`}
                    >
                        {isProcessing ? 'Processing...' : confirmText}
                    </button>
                </div>
            </div>
        </div>
    )
}
