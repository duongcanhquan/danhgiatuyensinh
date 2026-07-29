import type { LucideIcon } from 'lucide-react'
import {
  Bot,
  Building2,
  Calendar,
  CreditCard,
  FileSpreadsheet,
  FolderOpen,
  FormInput,
  Globe2,
  MessageCircle,
  MessagesSquare,
  MessageSquare,
  Phone,
  Plug,
  Radio,
  Send,
  Sheet,
  Smartphone,
  Sparkles,
  Webhook,
  Workflow,
} from 'lucide-react'

/** Icon gọn cho từng đầu nối — UI hub / status. */
export const CONNECTOR_ICONS: Record<string, LucideIcon> = {
  public_portal: Globe2,
  inbound_lead_api: FormInput,
  meta_lead_ads: Radio,
  google_sheets: Sheet,
  omicall: Phone,
  zalo_oa: MessageCircle,
  whatsapp_cloud: Smartphone,
  email_smtp: Send,
  sms_gateway: MessagesSquare,
  n8n: Workflow,
  generic_webhooks: Webhook,
  llm: Bot,
  slack_alerts: MessageSquare,
  teams_alerts: MessagesSquare,
  google_chat: MessageCircle,
  calendar_booking: Calendar,
  payment_vnpay: CreditCard,
  payment_momo: CreditCard,
  sis_siakad: Building2,
  receipt_r2: FolderOpen,
}

export const GROUP_ICONS: Record<string, LucideIcon> = {
  capture: FormInput,
  voice_chat: Phone,
  automation: Workflow,
  ai: Sparkles,
  notify: MessageSquare,
  payments: CreditCard,
  academic: Building2,
  storage: FolderOpen,
}

export function connectorIcon(id: string): LucideIcon {
  return CONNECTOR_ICONS[id] ?? Plug
}

export const STATUS_ICONS = {
  omicall: Phone,
  n8n: Workflow,
  portal: Globe2,
  llm: Bot,
  hub: Plug,
  spreadsheet: FileSpreadsheet,
} as const
