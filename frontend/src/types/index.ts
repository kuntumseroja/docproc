export interface User {
  id: string;
  email: string;
  full_name: string;
  role: 'sme' | 'consumer';
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
}

export interface FieldDefinition {
  name: string;
  label: string;
  field_type: 'text' | 'number' | 'date' | 'currency' | 'boolean' | 'list';
  required: boolean;
  description?: string;
  default_value?: string;
  validation_pattern?: string;
}

export interface ValidationRule {
  name: string;
  description: string;
  rule_type: 'range' | 'regex' | 'cross_field' | 'custom';
  config: Record<string, any>;
}

export interface ActionDefinition {
  name: string;
  action_type: 'webhook' | 'email' | 'database' | 'api_call';
  config: Record<string, any>;
  trigger: 'on_complete' | 'on_validation_pass' | 'on_validation_fail';
}

export interface Workflow {
  id: string;
  name: string;
  description?: string;
  status: 'draft' | 'active' | 'paused' | 'archived';
  document_type?: string;
  extraction_schema?: {
    fields: FieldDefinition[];
  };
  validation_rules?: {
    rules: ValidationRule[];
  };
  action_config?: {
    actions: ActionDefinition[];
  };
  created_at: string;
  updated_at: string;
  document_count: number;
}
