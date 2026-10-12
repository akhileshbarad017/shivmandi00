import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, CreditCard, Palette, Percent, Settings, UserRound } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { useAuth } from '@/app/auth';
import { Button } from '@/components/ui/Button';
import { FormField, Input, Select } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { apiGet, apiPatch, apiPost } from '@/lib/api';
import { cn } from '@/lib/cn';

interface SettingsResponse {
  settings: Record<string, string>;
}

interface FieldDef {
  key: string;
  label: string;
  type?: 'text' | 'email' | 'number' | 'select';
  options?: string[];
  placeholder?: string;
}

const TABS = [
  { key: 'shop', label: 'Shop', icon: Building2 },
  { key: 'bank', label: 'Bank & UPI', icon: CreditCard },
  { key: 'rates', label: 'Rates & Tax', icon: Percent },
  { key: 'branding', label: 'Branding', icon: Palette },
  { key: 'account', label: 'Account', icon: UserRound },
] as const;

type TabKey = (typeof TABS)[number]['key'];

const FIELDS: Record<'shop' | 'bank' | 'rates' | 'branding', FieldDef[]> = {
  shop: [
    { key: 'org_name', label: 'Business name' },
    { key: 'tagline', label: 'Tagline' },
    { key: 'app_user', label: 'Owner name' },
    { key: 'phone', label: 'Phone' },
    { key: 'email', label: 'Email', type: 'email' },
    { key: 'gstin', label: 'GSTIN' },
    { key: 'shop_no', label: 'Shop number' },
    { key: 'address', label: 'Market / location' },
    { key: 'market_city', label: 'City / pincode' },
    { key: 'contact1_name', label: 'Contact 1 name' },
    { key: 'contact1_phone', label: 'Contact 1 phone' },
    { key: 'contact2_name', label: 'Contact 2 name' },
    { key: 'contact2_phone', label: 'Contact 2 phone' },
    { key: 'contact2_phone2', label: 'Contact 2 phone (alt)' },
    { key: 'fy_start', label: 'Financial year start' },
    { key: 'language', label: 'Language', type: 'select', options: ['English', 'Hindi', 'Marathi', 'Gujarati'] },
  ],
  bank: [
    { key: 'bank_name', label: 'Bank name' },
    { key: 'bank_holder', label: 'Account holder' },
    { key: 'bank_ac_no', label: 'Account number' },
    { key: 'bank_ifsc', label: 'IFSC' },
    { key: 'bank_branch', label: 'Branch' },
    { key: 'upi_id', label: 'UPI ID', placeholder: 'name@bank' },
  ],
  rates: [
    { key: 'gst_percent', label: 'GST %', type: 'number' },
    { key: 'low_stock_default', label: 'Default low-stock level', type: 'number' },
  ],
  branding: [
    { key: 'brand_title', label: 'Brand title' },
    { key: 'invoice_footer', label: 'Invoice footer' },
  ],
};

export default function SettingsPage() {
  const [tab, setTab] = useState<TabKey>('shop');
  const settings = useQuery({ queryKey: ['settings'], queryFn: () => apiGet<SettingsResponse>('/settings') });

  return (
    <div className="space-y-4">
      <PageHeader title="Settings" subtitle="Shop profile, billing and account." icon={Settings} />

      <div className="flex flex-wrap gap-2">
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
            className={cn(
              'inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition',
              tab === item.key ? 'bg-gradient-to-r from-brand-500 to-brand-600 text-white' : 'glass muted',
            )}
          >
            <item.icon className="size-3.5" />
            {item.label}
          </button>
        ))}
      </div>

      {settings.isLoading ? (
        <p className="muted py-8 text-center text-sm">Loading settings…</p>
      ) : tab === 'account' ? (
        <AccountPanel />
      ) : (
        <SettingsForm key={tab} fields={FIELDS[tab]} settings={settings.data?.settings ?? {}} />
      )}
    </div>
  );
}

function SettingsForm({ fields, settings }: { fields: FieldDef[]; settings: Record<string, string> }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const field of fields) initial[field.key] = settings[field.key] ?? '';
    return initial;
  });

  const save = useMutation({
    mutationFn: () => apiPost('/settings', values),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['settings'] });
      toast.notify('Settings saved', 'success');
    },
    onError: (error: Error) => toast.notify(error.message, 'error'),
  });

  return (
    <div className="glass glass-card">
      <div className="grid gap-3 sm:grid-cols-2">
        {fields.map((field) => (
          <FormField
            key={field.key}
            label={field.label}
            className={field.key === 'address' || field.key === 'invoice_footer' ? 'sm:col-span-2' : ''}
          >
            {field.type === 'select' ? (
              <Select value={values[field.key] ?? ''} onChange={(event) => setValues({ ...values, [field.key]: event.target.value })}>
                {(field.options ?? []).map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </Select>
            ) : (
              <Input
                type={field.type === 'number' ? 'number' : field.type === 'email' ? 'email' : 'text'}
                value={values[field.key] ?? ''}
                placeholder={field.placeholder}
                onChange={(event) => setValues({ ...values, [field.key]: event.target.value })}
              />
            )}
          </FormField>
        ))}
      </div>
      <div className="mt-4 flex justify-end">
        <Button loading={save.isPending} onClick={() => save.mutate()}>
          Save changes
        </Button>
      </div>
    </div>
  );
}

function AccountPanel() {
  const { user, refresh } = useAuth();
  const toast = useToast();

  const [name, setName] = useState(user?.name ?? '');
  const [username, setUsername] = useState(user?.username ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const save = useMutation({
    mutationFn: () =>
      apiPatch('/settings/account', {
        name,
        username,
        phone,
        ...(newPassword ? { current_password: currentPassword, new_password: newPassword } : {}),
      }),
    onSuccess: async () => {
      setCurrentPassword('');
      setNewPassword('');
      await refresh();
      toast.notify('Account updated', 'success');
    },
    onError: (error: Error) => toast.notify(error.message, 'error'),
  });

  const canSave = name.trim().length > 0 && username.trim().length >= 3;

  return (
    <div className="glass glass-card">
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="Name">
          <Input value={name} onChange={(event) => setName(event.target.value)} />
        </FormField>
        <FormField label="Username">
          <Input value={username} onChange={(event) => setUsername(event.target.value)} />
        </FormField>
        <FormField label="Phone" className="sm:col-span-2">
          <Input value={phone} onChange={(event) => setPhone(event.target.value)} inputMode="tel" />
        </FormField>
      </div>

      <div className="mt-4 border-t border-[var(--border)] pt-4">
        <h3 className="mb-2 font-display text-base font-semibold">Change password</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Current password">
            <Input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} placeholder="••••••" />
          </FormField>
          <FormField label="New password" hint="Minimum 6 characters">
            <Input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="••••••" />
          </FormField>
        </div>
      </div>

      <div className="mt-4 flex justify-end">
        <Button loading={save.isPending} disabled={!canSave} onClick={() => save.mutate()}>
          Save account
        </Button>
      </div>
    </div>
  );
}


