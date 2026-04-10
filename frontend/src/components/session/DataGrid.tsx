import React from 'react'

interface DataGridRow {
  label: string
  value: string | React.ReactNode
  subValue?: string
  highlight?: boolean
}

interface DataGridProps {
  rows: DataGridRow[]
  title?: string
  isPrintMode?: boolean
}

/**
 * Generic data-grid component used in the session report cards.
 * Renders a clean label/value table suitable for both screen and print.
 */
export function DataGrid({ rows, title, isPrintMode }: DataGridProps) {
  return (
    <div className={isPrintMode ? 'print-data-grid' : ''}>
      {title && (
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
          {title}
        </p>
      )}
      <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
        {rows.map((row, i) => (
          <div
            key={i}
            className={`flex items-center justify-between px-4 py-2.5 text-sm ${
              row.highlight
                ? 'bg-primary/5 dark:bg-primary/10'
                : 'bg-card hover:bg-accent/30 transition-colors'
            }`}
          >
            <span className="text-muted-foreground font-medium shrink-0 w-36">{row.label}</span>
            <div className="text-right">
              <span className="font-semibold text-foreground">{row.value}</span>
              {row.subValue && (
                <p className="text-xs text-muted-foreground mt-0.5">{row.subValue}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
