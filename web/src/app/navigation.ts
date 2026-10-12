import {
  BarChart3,
  Carrot,
  FileText,
  History,
  LayoutDashboard,
  MessageCircle,
  Receipt,
  ReceiptText,
  Settings,
  ShoppingBasket,
  UserRound,
  Users,
  UsersRound,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  key: string;
  label: string;
  to: string;
  icon: LucideIcon;
  phase: number;
}

export interface NavGroup {
  key: string;
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    key: 'overview',
    label: 'Overview',
    items: [{ key: 'dashboard', label: 'Dashboard', to: '/', icon: LayoutDashboard, phase: 0 }],
  },
  {
    key: 'purchases',
    label: 'Purchases',
    items: [
      { key: 'purchase-new', label: 'New Purchase', to: '/purchases/new', icon: ShoppingBasket, phase: 4 },
      { key: 'purchase-history', label: 'Purchase History', to: '/purchases', icon: History, phase: 4 },
    ],
  },
  {
    key: 'sales',
    label: 'Sales',
    items: [
      { key: 'sale-new', label: 'New Sale', to: '/sales/new', icon: ReceiptText, phase: 5 },
      { key: 'sale-multi', label: 'Multi Sale', to: '/sales/multi', icon: UsersRound, phase: 6 },
      { key: 'sales-history', label: 'Sales History', to: '/sales', icon: History, phase: 5 },
      { key: 'invoices', label: 'Invoices', to: '/invoices', icon: FileText, phase: 5 },
    ],
  },
  {
    key: 'parties',
    label: 'Parties',
    items: [
      { key: 'parties', label: 'Parties', to: '/parties', icon: Users, phase: 3 },
      { key: 'products', label: 'Products', to: '/products', icon: Carrot, phase: 3 },
    ],
  },
  {
    key: 'money',
    label: 'Money',
    items: [
      { key: 'payments', label: 'Payments', to: '/payments', icon: Wallet, phase: 6 },
      { key: 'expenses', label: 'Expenses', to: '/expenses', icon: Receipt, phase: 6 },
      { key: 'whatsapp', label: 'WhatsApp Bills', to: '/whatsapp', icon: MessageCircle, phase: 6 },
    ],
  },
  {
    key: 'team',
    label: 'Team',
    items: [
      { key: 'staff', label: 'Staff', to: '/staff', icon: UserRound, phase: 7 },
      { key: 'reports', label: 'Reports', to: '/reports', icon: BarChart3, phase: 8 },
    ],
  },
  {
    key: 'system',
    label: 'System',
    items: [{ key: 'settings', label: 'Settings', to: '/settings', icon: Settings, phase: 8 }],
  },
];

export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((group) => group.items);

export const BOTTOM_NAV: Array<Pick<NavItem, 'label' | 'to' | 'icon'> & { key: string }> = [
  { key: 'home', label: 'Home', to: '/', icon: LayoutDashboard },
  { key: 'sale', label: 'Sale', to: '/sales/new', icon: ReceiptText },
  { key: 'multi', label: 'Multi', to: '/sales/multi', icon: UsersRound },
  { key: 'purchase', label: 'Buy', to: '/purchases/new', icon: ShoppingBasket },
  { key: 'parties', label: 'Party', to: '/parties', icon: Users },
];
