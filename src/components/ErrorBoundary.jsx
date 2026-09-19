import React from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isDynamicImportError, extractChunkUrl } from "@/utils/errorClassification";

/**
 * Error Boundary global (ver src/App.jsx). Envolve a aplicação autenticada
 * (Router + rotas), mas fica DENTRO do AuthProvider/QueryClientProvider —
 * um erro de renderização numa página não derruba a sessão de autenticação
 * nem o cache do React Query, só a árvore de rotas.
 *
 * Error Boundary só existe como classe: `getDerivedStateFromError`/
 * `componentDidCatch` não têm equivalente em hooks no React 18.
 *
 * Trata dois cenários de forma diferente (ver isDynamicImportError):
 * - Erro de renderização comum: "Tentar novamente" remonta a árvore, sem
 *   reload — suficiente, já que o próprio componente/estado é o problema.
 * - Falha ao carregar um chunk lazy (React.lazy/import() dinâmico): a
 *   Promise rejeitada do React.lazy fica em cache no módulo para sempre —
 *   remontar a árvore NUNCA tenta baixar o chunk de novo, então
 *   "Tentar novamente" ficaria preso num loop de erro sem saída. Só um
 *   reload real (novo grafo de módulos) pode tentar de novo. O reload só
 *   acontece se o usuário clicar em "Atualizar aplicação" — nunca
 *   automaticamente.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, isChunkError: false, retryKey: 0 };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, isChunkError: isDynamicImportError(error) };
  }

  componentDidCatch(error, errorInfo) {
    // Só console — nada disso é exposto na tela de erro que o usuário vê.
    // Nenhum log é enviado a servidor/serviço externo.
    if (isDynamicImportError(error)) {
      console.error("[ErrorBoundary] Dynamic import failed", {
        name: error?.name,
        message: error?.message,
        chunkUrl: extractChunkUrl(error?.message),
        componentStack: errorInfo?.componentStack,
      });
    } else {
      console.error("ErrorBoundary: erro de renderização não tratado.", error, errorInfo?.componentStack);
    }
  }

  // "Tentar novamente" (erro de renderização comum): desmonta e remonta a
  // árvore de rotas do zero (troca de `key`), em vez de só limpar
  // `hasError` — um reset de estado puro manteria os mesmos componentes
  // montados com o mesmo estado que causou o erro, e provavelmente
  // quebraria de novo imediatamente. Não faz reload da página nem
  // redireciona: rota atual, sessão e cache do React Query são preservados.
  handleRetry = () => {
    this.setState((s) => ({ hasError: false, isChunkError: false, retryKey: s.retryKey + 1 }));
  };

  // "Atualizar aplicação" (erro de chunk): só é chamado por clique
  // explícito do usuário — nunca no componentDidCatch, num efeito ou por
  // timeout. Um reload real cria um novo grafo de módulos, a única forma
  // de tentar baixar o chunk de novo (ver isDynamicImportError acima). Se
  // o mesmo chunk continuar indisponível após o reload, esta mesma tela
  // aparece de novo — não há tentativa automática nem loop, só o que o
  // usuário decidir clicar de novo.
  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      if (this.state.isChunkError) {
        return (
          <div className="fixed inset-0 flex items-center justify-center bg-background p-6">
            <div className="max-w-sm w-full text-center space-y-4">
              <div className="mx-auto h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center">
                <AlertTriangle className="h-6 w-6 text-destructive" />
              </div>
              <div className="space-y-1">
                <h1 className="text-lg font-semibold">Não foi possível carregar esta tela</h1>
                <p className="text-sm text-muted-foreground">
                  Uma parte da aplicação não conseguiu ser carregada. Tente atualizar a aplicação.
                </p>
              </div>
              <Button onClick={this.handleReload} className="w-full">Atualizar aplicação</Button>
            </div>
          </div>
        );
      }

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
