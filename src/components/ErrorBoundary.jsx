import React from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Error Boundary global (ver src/App.jsx). Envolve a aplicação autenticada
 * (Router + rotas), mas fica DENTRO do AuthProvider/QueryClientProvider —
 * um erro de renderização numa página não derruba a sessão de autenticação
 * nem o cache do React Query, só a árvore de rotas.
 *
 * Error Boundary só existe como classe: `getDerivedStateFromError`/
 * `componentDidCatch` não têm equivalente em hooks no React 18.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, retryKey: 0 };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    // Só console — nada disso é exposto na tela de erro que o usuário vê.
    console.error("ErrorBoundary: erro de renderização não tratado.", error, errorInfo?.componentStack);
  }

  // "Tentar novamente": desmonta e remonta a árvore de rotas do zero (troca
  // de `key`), em vez de só limpar `hasError` — um reset de estado puro
  // manteria os mesmos componentes montados com o mesmo estado que causou o
  // erro, e provavelmente quebraria de novo imediatamente. Não faz reload
  // da página nem redireciona: rota atual, sessão e cache do React Query
  // são preservados.
  handleRetry = () => {
    this.setState((s) => ({ hasError: false, retryKey: s.retryKey + 1 }));
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 flex items-center justify-center bg-background p-6">
          <div className="max-w-sm w-full text-center space-y-4">
            <div className="mx-auto h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center">
              <AlertTriangle className="h-6 w-6 text-destructive" />
            </div>
            <div className="space-y-1">
              <h1 className="text-lg font-semibold">Ocorreu um erro inesperado</h1>
              <p className="text-sm text-muted-foreground">
                Não foi possível carregar esta tela. Você pode tentar novamente.
              </p>
            </div>
            <Button onClick={this.handleRetry} className="w-full">Tentar novamente</Button>
          </div>
        </div>
      );
    }

    return <React.Fragment key={this.state.retryKey}>{this.props.children}</React.Fragment>;
  }
}
