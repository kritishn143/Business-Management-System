/**
 * Hand-maintained mirror of the SQL schema. Regenerate-able later with
 * `supabase gen types`, but kept explicit so the app does not depend on CLI
 * access to a project.
 */
export type MemberRole =
  | "owner"
  | "manager"
  | "cashier"
  | "inventory_manager"
  | "accountant";

export type MemberStatus = "active" | "invited" | "suspended";
export type BusinessStatus = "active" | "suspended" | "closed";
export type CurrencyPosition = "before" | "after";
export type DateSystem = "AD" | "BS";

export type Business = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  category: string | null;
  business_type: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  province: string | null;
  district: string | null;
  municipality: string | null;
  registration_number: string | null;
  currency_code: string;
  currency_position: CurrencyPosition;
  timezone: string;
  date_system: DateSystem;
  date_format: string;
  number_format: string;
  fiscal_year_start_month: number;
  fiscal_year_start_day: number;
  status: BusinessStatus;
  created_at: string;
  updated_at: string;
};

export type AccountType = "cash" | "bank" | "wallet" | "other";

export type InvoiceSettings = {
  business_id: string;
  logo_path: string | null;
  heading: string;
  terms: string | null;
  footer: string | null;
  bank_details: string | null;
  signature_label: string;
  show_logo: boolean;
  show_signature: boolean;
  show_terms: boolean;
  show_bank: boolean;
  show_address_on_receipt: boolean;
  default_format: string;
  created_at: string;
  updated_at: string;
};

export type BusinessMembership = {
  business_id: string;
  role: MemberRole;
  status: MemberStatus;
};
