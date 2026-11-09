export type Profile = {
  id: string;
  full_name: string | null;
  platform_role: "platform_admin" | "developer" | "user";
};

export type Organization = {
  id: string;
  name: string;
  business_type: string;
  phone: string | null;
  address: string | null;
  currency: string;
  logo_url: string | null;
  status: "active" | "suspended";
  membership_role?: "owner" | "admin" | "cashier" | "accountant" | "stock_manager" | "waiter" | "auditor";
};

export type Product = {
  id: string;
  name: string;
  sku: string | null;
  selling_price: number;
  cost_price: number;
  stock_quantity: number;
  low_stock_threshold: number;
  is_active: boolean;
};
