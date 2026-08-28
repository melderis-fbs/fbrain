import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'FOUNDERS BRAIN',
  description:
    'Expediente vivo por cliente, reglas de riesgo y motores de criterio para el equipo de consultoras de Founders.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-screen bg-page text-ink antialiased">{children}</body>
    </html>
  );
}
