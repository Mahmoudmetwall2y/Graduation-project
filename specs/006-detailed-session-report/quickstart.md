# Quickstart

## Getting Started

When developing the print-layout for the session page:

1. Open `frontend/src/app/session/[id]/page.tsx`
2. Add a global button: `<button onClick={() => window.print()}>Print Report</button>`
3. Build the 3 distinct UI sections.
4. Utilize tailwind's `print:` modifier. For example: `print:hidden` to hide navigation bars during printing, or `print:text-black print:bg-white` to override dark mode colors for paper.
5. In your browser DevTools, you can emulate the "print" CSS media query to see live updates without constantly opening the Print Dialog.
