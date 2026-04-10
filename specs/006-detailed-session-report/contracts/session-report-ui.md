# React Interface Contract

The structure of the detailed report will be decoupled into modular functional components to allow isolation for CSS print formats.

```typescript
// Contract for Print Styling
export interface ReportPrintProps {
    isPrintMode: boolean; // Tells the component to strip animations and dark-mode
}

export const Model1Card: React.FC<Model1Data & ReportPrintProps>;
export const Model2Card: React.FC<Model2Data & ReportPrintProps>;
export const Model3Card: React.FC<Model3Data & ReportPrintProps>;
export const DataGrid: React.FC<{ rows: any[] } & ReportPrintProps>;
```
