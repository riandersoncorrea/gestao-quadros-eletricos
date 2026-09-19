/**
 * Fallback visual reutilizado pelo carregamento inicial de autenticação
 * (AuthenticatedApp, src/App.jsx) e pelo <Suspense> de cada página
 * carregada sob demanda (React.lazy) — mesmo spinner, para não haver dois
 * visuais de "carregando" diferentes na aplicação. Simples e leve de
 * propósito: nada além de um spinner CSS, sem dependências extras.
 */
export default function PageLoadingFallback() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
        <p className="text-sm text-muted-foreground">Carregando...</p>
      </div>
    </div>
  );
}
