import { getSettings } from './settings.js';

/** Shop identity used on invoices, purchase bills and reports. */
export function shopProfile() {
  const s = getSettings();
  return {
    shop_name: s.org_name ?? 'VIJAY PANDEY & COMPANY',
    tagline: s.tagline ?? '',
    owner_name: s.app_user ?? '',
    phone: s.phone ?? '',
    address: s.address ?? '',
    city: s.market_city ?? '',
    shop_no: s.shop_no ?? '',
    contact1_name: s.contact1_name ?? '',
    contact1_phone: s.contact1_phone ?? '',
    contact2_name: s.contact2_name ?? '',
    contact2_phone: s.contact2_phone ?? '',
    contact2_phone2: s.contact2_phone2 ?? '',
    gstin: s.gstin ?? '',
    footer: s.invoice_footer ?? '',
    upi: s.upi_id ?? '',
    bank_name: s.bank_name ?? '',
    bank_ac_no: s.bank_ac_no ?? '',
    bank_ifsc: s.bank_ifsc ?? '',
    bank_holder: s.bank_holder ?? '',
  };
}
