export function Skeleton({ className = '', ...props }: React.HTMLAttributes<HTMLDivElement>) {
    return <div className={`skeleton ${className}`} {...props} />
}

export function CardSkeleton() {
    return (
        <div className="rounded-xl border border-border bg-card p-6 space-y-4">
            <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-6 w-16 rounded-full" />
            </div>
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-3 w-32" />
        </div>
    )
}

export function TableRowSkeleton() {
    return (
        <div className="flex items-center justify-between p-4 border-b border-border">
            <div className="flex items-center gap-4">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-20" />
                </div>
            </div>
            <Skeleton className="h-6 w-16 rounded-full" />
        </div>
    )
}

export function ChartSkeleton() {
    return (
        <div className="rounded-xl border border-border bg-card p-6">
            <Skeleton className="h-4 w-32 mb-4" />
            <div className="flex items-end gap-2 h-48">
                {[40, 65, 45, 80, 55, 70, 50, 85, 60, 75, 45, 90].map((h, i) => (
                    <Skeleton key={i} className="flex-1 rounded-t" style={{ height: `${h}%` }} />
                ))}
            </div>
        </div>
    )
}

export function PageSkeleton() {
    return (
        <div className="page-content space-y-6 fade-in">
            <div className="flex items-center justify-between">
                <Skeleton className="h-8 w-48" />
                <Skeleton className="h-10 w-32 rounded-lg" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map(i => <CardSkeleton key={i} />)}
            </div>
            <ChartSkeleton />
        </div>
    )
}
