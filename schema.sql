-- Users Table
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    is_admin BOOLEAN DEFAULT 0,
    is_power_user BOOLEAN DEFAULT 0,
    status TEXT DEFAULT 'active',
    registration_token TEXT DEFAULT NULL,
    token_expiry TEXT DEFAULT NULL,
    avatar TEXT DEFAULT NULL,
    summarization_enabled BOOLEAN DEFAULT 0,
    summarization_model_id INTEGER DEFAULT NULL,
    summarization_temperature_preset TEXT DEFAULT 'balanced',
    display_summarization_notice BOOLEAN DEFAULT 1,
    custom_system_prompt TEXT DEFAULT NULL,
    huggingface_token TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- API Key Providers Table
CREATE TABLE IF NOT EXISTS api_providers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    api_url TEXT,
    endpoints TEXT, 
    api_version TEXT, 
    website TEXT, 
    is_active BOOLEAN DEFAULT 0, 
    is_external BOOLEAN DEFAULT 1,
    is_manual BOOLEAN DEFAULT 0, 
    image_generation_endpoint_path TEXT DEFAULT NULL, 
    category TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Models Table
CREATE TABLE IF NOT EXISTS models (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    model_path TEXT NOT NULL, 
    context_window INTEGER DEFAULT 4096,
    is_active BOOLEAN DEFAULT 1,
    external_provider_id INTEGER,
    external_model_id TEXT, 
    huggingface_repo TEXT,      
    model_family TEXT,          
    prompt_format_type TEXT,    
    tokenizer_repo_id TEXT,     
    is_default INTEGER DEFAULT 0, 
    provider TEXT,              
    config TEXT,                
    -- System Prompt Columns
    prompt_strict_context BOOLEAN DEFAULT 0,
    prompt_no_invent BOOLEAN DEFAULT 0,
    prompt_ack_limits BOOLEAN DEFAULT 0,
    prompt_cite_sources BOOLEAN DEFAULT 0, 
    default_system_prompt TEXT DEFAULT NULL,
    size_bytes INTEGER,                 
    enable_scala_prompt BOOLEAN DEFAULT 0, 
    preferred_cache_type TEXT DEFAULT NULL, 
    is_embedding_model BOOLEAN DEFAULT 0,
    embedding_dimension INTEGER,
    can_generate_images BOOLEAN DEFAULT 0,    
    raw_capabilities_info TEXT DEFAULT NULL, 
    -- vLLM and multi-modal support
    model_type TEXT DEFAULT 'text_generation' NOT NULL, -- 'text_generation', 'image_generation', 'tts', 'stt'
    tensor_parallel_size INTEGER DEFAULT 1,
    model_format TEXT DEFAULT 'torch', -- 'torch'
    quantization_method TEXT, -- 'awq', 'gptq', '4-bit', '8-bit', 'none'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (external_provider_id) REFERENCES api_providers (id)
);

-- Chats Table
CREATE TABLE IF NOT EXISTS chats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    model_id INTEGER NOT NULL,
    title TEXT DEFAULT 'New Chat',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_archived BOOLEAN DEFAULT FALSE NOT NULL,
    archived_at TIMESTAMP NULLABLE,             
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    FOREIGN KEY (model_id) REFERENCES models (id) ON DELETE CASCADE
);

-- Messages Table
CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id INTEGER NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    tokens INTEGER DEFAULT 0,
    mcp_metadata TEXT,
    mcp_permissions TEXT,
    isLoading BOOLEAN DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (chat_id) REFERENCES chats (id) ON DELETE CASCADE
);

-- Chat Shares Table (Corrected based on migration script)
CREATE TABLE IF NOT EXISTS chat_shares (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id INTEGER NOT NULL,
    owner_user_id INTEGER NOT NULL, 
    user_id INTEGER NOT NULL, 
    permission_level TEXT NOT NULL DEFAULT 'read',
    status TEXT NOT NULL DEFAULT 'pending', 
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE,
    FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE, 
    UNIQUE (chat_id, user_id) 
);

-- Create indexes for efficient lookups on chat_shares
CREATE INDEX IF NOT EXISTS idx_chat_shares_chat_id ON chat_shares(chat_id);
CREATE INDEX IF NOT EXISTS idx_chat_shares_user_id ON chat_shares(user_id); 
CREATE INDEX IF NOT EXISTS idx_chat_shares_status ON chat_shares(status);

-- User Settings
CREATE TABLE IF NOT EXISTS user_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL UNIQUE,
    default_model_id INTEGER,
    private_mode BOOLEAN DEFAULT 0,
    theme TEXT DEFAULT 'light',
    default_model_access BOOLEAN DEFAULT 1, 
    mcp_enabled BOOLEAN DEFAULT 0,
    mcp_allow_context_storage BOOLEAN DEFAULT 0,
    mcp_allow_file_access BOOLEAN DEFAULT 0,
    mcp_allow_function_calls BOOLEAN DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    FOREIGN KEY (default_model_id) REFERENCES models (id) ON DELETE SET NULL
);

-- Model Contexts
CREATE TABLE IF NOT EXISTS model_contexts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    model_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    content TEXT NOT NULL,
    is_default BOOLEAN DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (model_id) REFERENCES models (id) ON DELETE CASCADE
);

-- User Access Logs (for admin statistics)
CREATE TABLE IF NOT EXISTS access_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    action TEXT NOT NULL,
    details TEXT,
    ip_address TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

-- Usage Statistics
CREATE TABLE IF NOT EXISTS usage_statistics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    model_id INTEGER NOT NULL,
    chat_id INTEGER,
    tokens_input INTEGER DEFAULT 0,
    tokens_output INTEGER DEFAULT 0,
    latency_ms INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    FOREIGN KEY (model_id) REFERENCES models (id) ON DELETE CASCADE,
    FOREIGN KEY (chat_id) REFERENCES chats (id) ON DELETE CASCADE
);

-- User API Keys Table (legacy)
CREATE TABLE IF NOT EXISTS user_api_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    provider_id INTEGER NOT NULL,
    api_key TEXT NOT NULL,
    is_valid BOOLEAN DEFAULT 1,
    last_checked TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    FOREIGN KEY (provider_id) REFERENCES api_providers (id) ON DELETE CASCADE
);

-- API Keys Table (current)
CREATE TABLE IF NOT EXISTS api_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider_id INTEGER NOT NULL,
    key_name TEXT NOT NULL DEFAULT "",
    key_value TEXT NOT NULL DEFAULT "",
    is_encrypted BOOLEAN DEFAULT 0,
    user_id INTEGER,
    is_active BOOLEAN DEFAULT 1,
    is_global BOOLEAN DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (provider_id) REFERENCES api_providers (id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    UNIQUE(provider_id, user_id, is_global)
);

-- Indexes for API keys performance
CREATE INDEX IF NOT EXISTS idx_api_keys_provider ON api_keys(provider_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_global ON api_keys(is_global);
CREATE INDEX IF NOT EXISTS idx_api_keys_user_provider ON api_keys(user_id, provider_id, is_active);

-- User Model Access
CREATE TABLE IF NOT EXISTS user_model_access (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    model_id INTEGER NOT NULL,
    can_access BOOLEAN DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    FOREIGN KEY (model_id) REFERENCES models (id) ON DELETE CASCADE,
    UNIQUE(user_id, model_id)
);


-- User Files Table
CREATE TABLE IF NOT EXISTS user_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    original_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_type TEXT,
    file_size INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS message_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id INTEGER NOT NULL,
  file_id INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (message_id) REFERENCES messages (id) ON DELETE CASCADE,
    FOREIGN KEY (file_id) REFERENCES user_files (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS message_feedback (
    message_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    rating INTEGER NOT NULL,
    comment TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (message_id, user_id),
    FOREIGN KEY (message_id) REFERENCES messages (id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

-- Create the basic permissions table
CREATE TABLE IF NOT EXISTS permissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  source TEXT, 
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create groups table
CREATE TABLE IF NOT EXISTS groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create user_groups table
CREATE TABLE IF NOT EXISTS user_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  group_id INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  FOREIGN KEY (group_id) REFERENCES groups (id) ON DELETE CASCADE,
  UNIQUE(user_id, group_id)
);

-- Create group_admin_permissions table
CREATE TABLE IF NOT EXISTS group_admin_permissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id INTEGER NOT NULL,
  permission_id INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (group_id) REFERENCES groups (id) ON DELETE CASCADE,
  FOREIGN KEY (permission_id) REFERENCES admin_permissions (id) ON DELETE CASCADE,
  UNIQUE(group_id, permission_id)
);

-- Create permission_templates table for group-based default permissions
CREATE TABLE IF NOT EXISTS permission_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  permission_key TEXT NOT NULL,
  group_id INTEGER NOT NULL,
  default_value INTEGER NOT NULL DEFAULT 0,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(permission_key, group_id)
);

-- Create a table to store user OAuth provider connections
CREATE TABLE IF NOT EXISTS user_oauth_providers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  provider TEXT NOT NULL,
  provider_user_id TEXT NOT NULL,
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(provider, provider_user_id)
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_oauth_user_id ON user_oauth_providers(user_id);
CREATE INDEX IF NOT EXISTS idx_user_oauth_provider ON user_oauth_providers(provider);
CREATE INDEX IF NOT EXISTS idx_user_oauth_provider_user_id ON user_oauth_providers(provider, provider_user_id);

-- Create integrations table
CREATE TABLE IF NOT EXISTS integrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  provider TEXT NOT NULL,
  client_id TEXT,
  client_secret TEXT,
  additional_config TEXT,
  enabled INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(provider)
);

-- Add index for faster lookup
CREATE INDEX IF NOT EXISTS idx_integrations_provider ON integrations(provider);

-- Create system_settings table if it doesn't exist (for admin password protection)
CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create unalterable password protection table
CREATE TABLE IF NOT EXISTS critical_flags (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL, 
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create protection record log to track protection status
CREATE TABLE IF NOT EXISTS protection_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  operation TEXT NOT NULL,
  status TEXT NOT NULL,
  details TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create Anthropic keys view
CREATE VIEW IF NOT EXISTS anthropic_keys_view AS
  SELECT 
    k.id,
    k.provider_id,
    k.user_id,
    k.key_name,
    k.key_value,
    k.is_encrypted,
    k.is_active,
    k.is_global,
    k.created_at,
    k.updated_at,
    p.name as provider_name,
    CASE 
      WHEN k.is_global = 1 THEN 1
      ELSE 0
    END as priority
  FROM api_keys k
  JOIN api_providers p ON k.provider_id = p.id
  WHERE p.name = 'Anthropic' AND k.is_active = 1
  ORDER BY priority DESC;

-- Insert default admin user if not exists (with placeholder password only for initial setup)
-- Note: This placeholder will be replaced with a proper bcrypt hash in db.js during setup
-- During updates, this statement is ignored due to the OR IGNORE clause if admin already exists
INSERT OR IGNORE INTO users (username, email, password, is_admin)
VALUES ('admin', 'admin@mcp.local', 'PLACEHOLDER_TO_BE_REPLACED', 1);


-- Set admin password protection (only effective if table exists)
-- This ensures passwords won't be reset during updates
INSERT OR IGNORE INTO system_settings (key, value)
VALUES ('admin_password_protected', 'true');

-- Hide credentials display during updates (only effective if table exists)
INSERT OR IGNORE INTO system_settings (key, value)
VALUES ('hide_admin_credentials', 'true');

-- Add global privacy mode setting (default to disabled)
INSERT OR IGNORE INTO system_settings (key, value)
VALUES ('global_privacy_mode', 'false');

-- Add Scalytics API settings (defaults)
INSERT OR IGNORE INTO system_settings (key, value)
VALUES 
  ('scalytics_api_enabled', 'false'), -- Disabled by default
  ('scalytics_api_rate_limit_window_ms', '900000'), -- 15 minutes
  ('scalytics_api_rate_limit_max', '100');

-- Add Python Live Search Base URL
INSERT OR IGNORE INTO system_settings (key, value)
VALUES ('PYTHON_LIVE_SEARCH_BASE_URL', 'http://localhost:8001');

-- Add system setting for chat archival (default to false)
INSERT OR IGNORE INTO system_settings (key, value)
VALUES ('archive_deleted_chats_for_refinement', '0');

-- Set permanent admin password lock that can never be overridden
INSERT OR IGNORE INTO critical_flags (key, value)
VALUES ('ADMIN_PASSWORD_LOCKED', 'true');

-- Log that the schema-level protection has been applied
INSERT OR IGNORE INTO protection_log (operation, status, details)
VALUES ('schema_protection', 'applied', 'Schema-level admin password protection applied');

-- Insert basic system permissions
INSERT OR IGNORE INTO permissions (key, name, description)
VALUES 
  ('access_admin', 'Access Admin Area', 'Allow access to administrative functions'),
  ('manage_users', 'Manage Users', 'Create, edit and delete user accounts'),
  ('manage_groups', 'Manage Groups', 'Create, edit and manage user groups'),
  ('manage_models', 'Manage Models', 'Add, edit, and configure AI models'),
  ('use_all_models', 'Use All Models', 'Use any model in the system regardless of group permissions'),
  ('manage_integrations', 'Manage Integrations', 'Allow users to manage authentication and service integrations (OAuth, API keys, etc.)'),
  ('view_integrations', 'View Integrations', 'Allow users to view integration configurations without being able to modify them');

-- Insert Scalytics API provider
INSERT OR IGNORE INTO api_providers (name, is_external, is_manual, is_active, description, category)
VALUES ('Scalytics API', 0, 1, 1, 'Internal API for Scalytics Connect', 'system');

-- Insert xAI provider
INSERT OR IGNORE INTO api_providers (name, is_external, is_manual, is_active, description, category, api_url, website)
VALUES ('xAI', 1, 0, 1, 'xAI API', 'external', 'https://api.x.ai/v1', 'https://x.ai');


-- Insert some predefined integrations with empty credentials
INSERT OR IGNORE INTO integrations 
  (name, provider, client_id, client_secret, additional_config, enabled)
VALUES
  ('Google OAuth', 'google', '', '', '{"redirectUri": "/auth/google/callback"}', 0),
  ('GitHub OAuth', 'github', '', '', '{"redirectUri": "/auth/github/callback"}', 0),
  ('Microsoft OAuth', 'microsoft', '', '', '{"redirectUri": "/auth/microsoft/callback"}', 0),
  ('Azure Active Directory', 'azure_ad', '', '', '{"redirectUri": "/auth/azure/callback", "tenantId": "organizations"}', 0),
  ('Okta OAuth', 'okta', '', '', '{"redirectUri": "/auth/okta/callback", "domain": ""}', 0);


-- Permissions tables for fine-grained permission control
CREATE TABLE IF NOT EXISTS admin_permissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  permission_key TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_admin_permissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  permission_id INTEGER NOT NULL,
  granted_by INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  FOREIGN KEY (permission_id) REFERENCES admin_permissions (id) ON DELETE CASCADE,
  FOREIGN KEY (granted_by) REFERENCES users (id) ON DELETE CASCADE,
  UNIQUE(user_id, permission_id)
);

-- Indexes for admin permissions tables
CREATE INDEX IF NOT EXISTS idx_user_admin_permissions_user ON user_admin_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_admin_permissions_perm ON user_admin_permissions(permission_id);

-- Insert basic admin permissions
INSERT OR IGNORE INTO admin_permissions (permission_key, name, description)
VALUES 
  -- Core permissions (non-duplicated)
  ('access_admin', 'Access Admin Area', 'Allow access to administrative functions'),
  ('use_all_models', 'Use All Models', 'Use any model in the system regardless of group permissions'),
  ('manage_integrations', 'Manage Integrations', 'Allow users to manage authentication and service integrations'),
  ('view_integrations', 'View Integrations', 'Allow users to view integration configurations'),
  
  -- Modern colon-based permissions (used by routes)
  ('stats:view', 'View Statistics', 'Allow viewing system statistics and logs'),
  ('hardware:view', 'View Hardware', 'Allow viewing hardware information'),
  ('users:manage', 'Manage Users', 'Create, edit and delete user accounts'),
  ('providers:manage', 'Manage Providers', 'Manage API providers'),
  ('api-keys:manage', 'Manage API Keys', 'Manage API keys for external services'),
  ('huggingface:access', 'Hugging Face Access', 'Access Hugging Face models and services'),
  ('models:manage', 'Manage Models', 'Add, edit, and configure AI models'),
  ('model-access:manage', 'Manage Model Access', 'Control which users can access specific models'),
  ('api-keys:generate', 'Generate Scalytics API Keys', 'Allow users to generate their own Scalytics API keys for external use'); -- Added new permission

-- GitHub integration tables
CREATE TABLE IF NOT EXISTS user_github_tokens (
  user_id INTEGER NOT NULL,
  access_token TEXT NOT NULL,
  github_username TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Table to store GitHub files added to chats
CREATE TABLE IF NOT EXISTS chat_github_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  repo_owner TEXT NOT NULL,
  repo_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_content TEXT NOT NULL,
  file_sha TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Create indexes for GitHub tables
CREATE INDEX IF NOT EXISTS idx_chat_github_files_chat_id ON chat_github_files(chat_id);
CREATE INDEX IF NOT EXISTS idx_chat_github_files_user_id ON chat_github_files(user_id);

-- MCP Local Tool Status Table
CREATE TABLE IF NOT EXISTS mcp_local_tools_status (
  tool_name TEXT PRIMARY KEY,
  is_active BOOLEAN DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- MCP Servers Table
CREATE TABLE IF NOT EXISTS mcp_servers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    connection_type TEXT NOT NULL,
    connection_details TEXT NOT NULL,
    api_key_hash TEXT,
    is_active BOOLEAN DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Content Filtering Tables --
CREATE TABLE IF NOT EXISTS filter_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rule_type TEXT NOT NULL, 
  pattern TEXT NOT NULL, 
  description TEXT,
  replacement TEXT, 
  is_active INTEGER DEFAULT 1 NOT NULL, 
  is_system_default INTEGER DEFAULT 0 NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for filtering tables
CREATE INDEX IF NOT EXISTS idx_filter_rules_is_active ON filter_rules(is_active);

-- Triggers for filtering tables
CREATE TRIGGER IF NOT EXISTS trigger_filter_rules_updated_at
AFTER UPDATE ON filter_rules FOR EACH ROW
BEGIN
  UPDATE filter_rules SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
END;

-- Insert default system setting for active filter languages
INSERT OR IGNORE INTO system_settings (key, value) VALUES ('active_filter_languages', '["en"]');

-- Domain Trust Profiles Table
CREATE TABLE IF NOT EXISTS domain_trust_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    domain TEXT UNIQUE NOT NULL, 
    
    -- Core Trust Score & Components
    trust_score REAL DEFAULT 0.5, 
    tld_type_bonus REAL DEFAULT 0.0, 
    https_bonus REAL DEFAULT 0.0,
    age_bonus REAL DEFAULT 0.0,
    outbound_link_quality_score REAL DEFAULT 0.0, 
    content_quality_signals_score REAL DEFAULT 0.0,
    user_feedback_score REAL DEFAULT 0.0, 
    controversy_signal REAL DEFAULT 0.0, 

    -- Supporting Data for Score Calculation
    is_https BOOLEAN,
    domain_age_days INTEGER,
    outbound_links_to_high_trust_count INTEGER DEFAULT 0,
    outbound_links_to_medium_trust_count INTEGER DEFAULT 0,
    outbound_links_to_low_trust_count INTEGER DEFAULT 0,
    total_outbound_links_scanned INTEGER DEFAULT 0,
    
    -- Metadata for "Controversy/Cross-Checking"
    last_cross_check_date DATETIME,
    cross_check_discrepancy_factor REAL DEFAULT 0.0, 

    last_scanned_date DATETIME,
    reference_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Migrations Tracking Table
CREATE TABLE IF NOT EXISTS migrations (
    name TEXT PRIMARY KEY,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User Tool Configs Table
CREATE TABLE IF NOT EXISTS user_tool_configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    tool_name TEXT NOT NULL,
    config TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    UNIQUE(user_id, tool_name)
);
