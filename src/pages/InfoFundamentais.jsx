import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  BookOpen, ShieldCheck, ClipboardList, Wrench, FileText, Users, AlertTriangle, ChevronDown, ChevronRight, ExternalLink
} from "lucide-react";

const SECTIONS = [
  {
    id: "normas",
    icon: BookOpen,
    title: "Normas e Regulamentações Aplicáveis",
    color: "text-primary",
    bgColor: "bg-primary/10",
    badge: "Base Legal",
    items: [
      {
        title: "NR-10 — Segurança em Instalações e Serviços em Eletricidade",
        content: [
          { label: "Prontuário das Instalações Elétricas (PIE)", desc: "Obrigatório para instalações com carga instalada superior a 75 kW. Deve conter diagramas unifilares atualizados, relatórios de inspeção, certificações e laudos técnicos." },
          { label: "Diagramas Unifilares", desc: "Devem ser mantidos atualizados e acessíveis, refletindo a configuração real das instalações." },
          { label: "Medidas de Controle", desc: "Implementação de medidas de proteção coletiva (aterramento, barreiras, invólucros, seccionamento automático) e individual (EPIs)." },
          { label: "Procedimentos de Trabalho", desc: "Elaboração de procedimentos de segurança específicos para cada tipo de intervenção em quadros elétricos." },
          { label: "Qualificação e Autorização", desc: "Somente profissionais qualificados, habilitados, capacitados e autorizados podem intervir em instalações elétricas." },
        ]
      },
      {
        title: "NBR 5410 — Instalações Elétricas de Baixa Tensão",
        content: [
          { label: "Projeto e Execução", desc: "Critérios para o dimensionamento, instalação e proteção de circuitos e componentes elétricos." },
          { label: "Identificação", desc: "Todos os circuitos e dispositivos de proteção devem ser claramente identificados nos quadros elétricos." },
          { label: "Proteção", desc: "Requisitos para dispositivos de proteção contra sobrecorrentes (disjuntores), choques elétricos (DR) e sobretensões (DPS)." },
          { label: "Manutenção", desc: "Estabelece a base para manutenção ao exigir a conformidade inicial da instalação elétrica." },
        ]
      },
      {
        title: "NBR 5419 — Proteção contra Descargas Atmosféricas",
        content: [
          { label: "Aplicação", desc: "Aplicável para quadros que contêm DPS integrados a um Sistema de Proteção contra Descargas Atmosféricas (SPDA), definindo os requisitos para proteção de estruturas." },
        ]
      },
    ]
  },
  {
    id: "processo",
    icon: ClipboardList,
    title: "Processo de Gerenciamento — Etapas",
    color: "text-secondary",
    bgColor: "bg-secondary/10",
    badge: "Fluxo",
    items: [
      {
        title: "Etapas do Processo",
        content: [
          { label: "1. Inventário e Cadastro", desc: "Levantamento detalhado de todos os quadros elétricos existentes: tag, localização, tipo, dados técnicos, proteções e documentação." },
          { label: "2. Inspeção e Diagnóstico", desc: "Verificação periódica das condições dos quadros seguindo checklist baseado na NR-10 e NBR 5410. Frequência: mensal, trimestral, semestral ou anual." },
          { label: "3. Planejamento da Manutenção", desc: "Definição das ações preventivas, preditivas e corretivas com base nos resultados das inspeções." },
          { label: "4. Execução da Manutenção", desc: "Realização das intervenções necessárias por profissionais habilitados, seguindo procedimentos de segurança." },
          { label: "5. Registro e Documentação", desc: "Manutenção de históricos e atualização de documentos: diagramas, relatórios de inspeção, laudos e PIE." },
          { label: "6. Análise e Melhoria Contínua", desc: "Avaliação do processo e implementação de otimizações com base no histórico acumulado." },
        ]
      }
    ]
  },
  {
    id: "inventario",
    icon: FileText,
    title: "Inventário — Campos do Cadastro",
    color: "text-primary",
    bgColor: "bg-primary/10",
    badge: "Cadastro",
    items: [
      {
        title: "Campos Obrigatórios e Recomendados",
        content: [
          { label: "ID / Tag do Quadro", desc: "Identificador único. Exemplo: QE-ADM-001" },
          { label: "Localização", desc: "Andar, sala e setor onde o quadro está instalado. Exemplo: 3º Andar, Sala 305, Setor Financeiro." },
          { label: "Tipo de Quadro", desc: "Função principal: QDL (Distribuição de Luz), QDF (Distribuição de Força), QDC (Comando), QGBT (Geral Baixa Tensão), QTA (Transferência Automática)." },
          { label: "Tensão e Corrente Nominal", desc: "Tensão de operação (ex: 220/127V) e corrente máxima do disjuntor geral (ex: 100A)." },
          { label: "Disjuntor Geral", desc: "Tipo, capacidade e marca do disjuntor principal. Exemplo: Termomagnético, 100A, Curva C, ABB S203." },
          { label: "Diagrama Unifilar", desc: "Referência ao arquivo e status: Atualizado / Desatualizado / Inexistente." },
          { label: "Datas de Instalação e Inspeção", desc: "Data de instalação ou última reforma, data da última e próxima inspeção programada." },
          { label: "Proteções (DR, DPS, SPDA)", desc: "Indicação dos dispositivos de proteção instalados no quadro." },
          { label: "Carga Instalada (kW) e PIE", desc: "Cargas acima de 75 kW exigem o Prontuário de Instalações Elétricas (PIE) conforme NR-10." },
        ]
      }
    ]
  },
  {
    id: "checklist",
    icon: ShieldCheck,
    title: "Checklist de Inspeção — Itens Verificados",
    color: "text-secondary",
    bgColor: "bg-secondary/10",
    badge: "Inspeção",
    items: [
      {
        title: "Itens da Inspeção (NR-10 e NBR 5410)",
        content: [
          { label: "Estado Geral do Invólucro", desc: "Integridade física (sem corrosão, amassados), fechamento de portas e selos, limpeza interna e externa, ausência de umidade ou poeira excessiva." },
          { label: "Identificação dos Circuitos", desc: "Clareza e atualização das identificações de circuitos, disjuntores e barramentos." },
          { label: "Conexões Elétricas", desc: "Inspeção visual de pontos de conexão para sinais de superaquecimento (descoloração, isolamento derretido). Reaperto com quadro desenergizado por profissional autorizado." },
          { label: "Dispositivos de Proteção (DR e DPS)", desc: "Teste funcional de Dispositivos Diferenciais Residuais (DRs) com botão de teste; inspeção visual dos DPSs." },
          { label: "Fiação e Cabos", desc: "Organização, isolamento e integridade dos cabos. Ausência de emendas improvisadas ou cabos soltos." },
          { label: "Sinalização de Segurança", desc: "Presença e visibilidade de placas de advertência: 'Perigo – Choque Elétrico', tensão nominal e demais sinalizações." },
          { label: "Termografia (recomendada)", desc: "Inspeção termográfica para identificar pontos quentes invisíveis a olho nu, indicando conexões frouxas ou sobrecarga. Recomendada para inspeções semestrais e anuais." },
        ]
      },
      {
        title: "Frequência das Inspeções",
        content: [
          { label: "Mensal", desc: "Quadros críticos de alta tensão ou ambientes com alto risco de falha." },
          { label: "Trimestral", desc: "Quadros gerais (QGBT) e quadros em ambientes industriais." },
          { label: "Semestral", desc: "Quadros de distribuição em áreas administrativas comuns." },
          { label: "Anual", desc: "Quadros secundários de baixa criticidade, com inspeção termográfica incluída." },
        ]
      }
    ]
  },
  {
    id: "manutencao",
    icon: Wrench,
    title: "Manutenção dos Quadros Elétricos",
    color: "text-amber-600",
    bgColor: "bg-amber-50",
    badge: "Manutenção",
    items: [
      {
        title: "Tipos de Manutenção",
        content: [
          { label: "Manutenção Preventiva", desc: "Realizada em intervalos programados para evitar falhas. Inclui limpeza, reaperto de conexões, testes de DR/DPS, medições de isolamento e termografia." },
          { label: "Manutenção Preditiva", desc: "Baseada no monitoramento periódico de parâmetros para prever falhas antes que ocorram. Exemplo: análise termográfica periódica." },
          { label: "Manutenção Corretiva", desc: "Realizada após a ocorrência de uma falha. Deve ser executada com urgência por profissionais qualificados, seguindo procedimentos de segurança rigorosos." },
        ]
      }
    ]
  },
  {
    id: "documentacao",
    icon: FileText,
    title: "Documentação e Registros",
    color: "text-primary",
    bgColor: "bg-primary/10",
    badge: "Documentação",
    items: [
      {
        title: "Documentos Obrigatórios e Recomendados",
        content: [
          { label: "Prontuário das Instalações Elétricas (PIE)", desc: "Obrigatório para instalações acima de 75 kW (NR-10). Contém: relatórios de inspeção e ensaios, certificações, laudos técnicos, procedimentos de trabalho, resultados de testes (isolamento, DR, DPS) e relatórios de termografia." },
          { label: "Diagramas Unifilares", desc: "Sempre atualizados após qualquer alteração na instalação. Devem refletir a configuração real e estar acessíveis para os responsáveis." },
          { label: "Registros de Manutenção", desc: "Histórico de todas as intervenções: data, tipo de manutenção, descrição do serviço, peças substituídas e nome do responsável." },
          { label: "Certificados de Calibração", desc: "Para os equipamentos de medição utilizados nas inspeções (multímetros, alicates amperímetros, termovisor, etc.)." },
        ]
      }
    ]
  },
  {
    id: "responsabilidades",
    icon: Users,
    title: "Responsabilidades",
    color: "text-secondary",
    bgColor: "bg-secondary/10",
    badge: "Equipe",
    items: [
      {
        title: "Papéis e Responsabilidades",
        content: [
          { label: "Gestor de Manutenção / Facilities", desc: "Responsável geral pelo processo de gerenciamento. Planeja recursos, define cronogramas, garante conformidade e aprova documentos." },
          { label: "Eletricistas / Técnicos Eletricistas", desc: "Executam as inspeções periódicas, realizam manutenções preventivas e corretivas e preenchem os registros de intervenção." },
          { label: "Engenheiro Eletricista", desc: "Responsável técnico pelas instalações. Elabora e atualiza os projetos elétricos, diagramas unifilares, laudos técnicos e o PIE." },
        ]
      }
    ]
  },
  {
    id: "seguranca",
    icon: AlertTriangle,
    title: "Segurança nas Intervenções",
    color: "text-destructive",
    bgColor: "bg-destructive/10",
    badge: "Segurança",
    items: [
      {
        title: "Procedimentos de Segurança Obrigatórios",
        content: [
          { label: "Desenergização (LOTO)", desc: "Sempre que possível, realizar intervenções com o quadro desenergizado e bloqueado — procedimento Lockout/Tagout (LOTO). Nunca trabalhar em quadros energizados sem autorização e EPIs adequados." },
          { label: "EPIs Obrigatórios", desc: "Luvas isolantes, óculos de segurança, capacete com jugular, calçado de segurança e vestimentas antichama (conforme NR-10)." },
          { label: "Ferramentas Isoladas", desc: "Utilizar exclusivamente ferramentas com isolamento adequado para trabalhos elétricos (conforme normas IEC)." },
          { label: "Análise Preliminar de Risco (APR)", desc: "Realizar APR antes de qualquer intervenção em quadros elétricos para identificar e mitigar riscos específicos do trabalho." },
          { label: "Profissionais Habilitados", desc: "Somente profissionais qualificados, habilitados, capacitados e autorizados conforme NR-10 podem intervir em instalações elétricas." },
        ]
      }
    ]
  },
];

function AccordionSection({ section }) {
  const [open, setOpen] = useState(false);
  const [openItems, setOpenItems] = useState({});
  const Icon = section.icon;

  const toggleItem = (i) => setOpenItems(prev => ({ ...prev, [i]: !prev[i] }));

  return (
    <Card className="border-border/60 overflow-hidden">
      <button
        className="w-full flex items-center gap-3 p-5 text-left hover:bg-muted/30 transition-colors"
        onClick={() => setOpen(!open)}
      >
        <div className={`h-10 w-10 rounded-xl ${section.bgColor} flex items-center justify-center shrink-0`}>
          <Icon className={`h-5 w-5 ${section.color}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-sm">{section.title}</h3>
            <Badge variant="outline" className="text-xs hidden sm:inline-flex">{section.badge}</Badge>
          </div>
        </div>
        {open ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
      </button>

      {open && (
        <div className="border-t border-border">
          {section.items.map((group, gi) => (
            <div key={gi} className="p-5">
              <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">{group.title}</h4>
              <div className="space-y-2">
                {group.content.map((item, ii) => (
                  <div key={ii} className="border border-border rounded-lg overflow-hidden">
                    <button
                      className="w-full flex items-center gap-3 p-3 text-left hover:bg-muted/30 transition-colors"
                      onClick={() => toggleItem(`${gi}-${ii}`)}
                    >
                      <div className={`h-1.5 w-1.5 rounded-full ${section.bgColor.replace('/10', '')} shrink-0`} />
                      <span className="text-sm font-medium flex-1">{item.label}</span>
                      {openItems[`${gi}-${ii}`] ? <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" /> : <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />}
                    </button>
                    {openItems[`${gi}-${ii}`] && (
                      <div className="px-4 pb-3 pt-1 bg-muted/20">
                        <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

export default function InfoFundamentais() {
  return (
    <div className="p-4 lg:p-8 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Informações Fundamentais</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Processo de Gerenciamento de Quadros Elétricos em Áreas Administrativas
        </p>
      </div>

      {/* Intro Card */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="p-5">
          <div className="flex items-start gap-3">
            <BookOpen className="h-5 w-5 text-primary mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium mb-1">Sobre este documento</p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Este guia estabelece o processo para o gerenciamento eficaz e seguro dos quadros elétricos em áreas administrativas. O objetivo é garantir a conformidade com as normas regulamentadoras (NR-10, NBR 5410, NBR 5419), a segurança dos ocupantes, a continuidade operacional e a otimização da vida útil dos equipamentos elétricos.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {SECTIONS.map(section => (
          <AccordionSection key={section.id} section={section} />
        ))}
      </div>
    </div>
  );
}