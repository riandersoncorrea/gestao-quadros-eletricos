import {
  AUDIT_PAGE_SIZE,
  fetchAuditLog,
  fetchRecordAudit,
  panelLocationHistory,
  panelConditionHistory,
} from "@/repositories/auditRepository";

/** Tabelas auditadas (para o filtro). Rótulo -> nome da tabela. */
export const AUDITED_TABLES = [
  { value: "electrical_panels", label: "Quadros" },
  { value: "inspections", label: "Inspeções" },
  { value: "inspection_responses", label: "Respostas de inspeção" },
  { value: "nonconformities", label: "Não conformidades" },
  { value: "actions", label: "Ações" },
  { value: "localidades", label: "Localidades" },
  { value: "locais", label: "Locais" },
  { value: "sublocais", label: "Sublocais" },
  { value: "sap_import_batches", label: "Lotes SAP" },
  { value: "sap_orders", label: "Ordens SAP" },
  { value: "health_index_config", label: "Config. Índice de Saúde" },
  { value: "profiles", label: "Usuários" },
];

export { AUDIT_PAGE_SIZE, fetchAuditLog, fetchRecordAudit, panelLocationHistory, panelConditionHistory };
