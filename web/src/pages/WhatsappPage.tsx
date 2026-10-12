import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageCircle, Send, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { FormField, Input, Textarea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { StatCard } from '@/components/ui/StatCard';
import { useToast } from '@/components/ui/Toast';
import { apiDelete, apiGet, apiPost } from '@/lib/api';
import type { WhatsappListResponse, WhatsappRow } from '@/lib/types';

export default function WhatsappPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [toDelete, setToDelete] = useState<WhatsappRow | null>(null);

  const log = useQuery({ queryKey: ['whatsapp'], queryFn: () => apiGet<WhatsappListResponse>('/whatsapp') });

  const remove = useMutation({
    mutationFn: (id: number) => apiDelete(`/whatsapp/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['whatsapp'] });
      toast.notify('Log entry removed', 'success');
      setToDelete(null);
    },
    onError: (error: Error) => toast.notify(error.message, 'error'),
  });

  const columns: Column<WhatsappRow>[] = [
    {
      key: 'created_at',
      header: 'Sent',
      render: (row) => new Date(row.created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }),
    },
    { key: 'invoice_no', header: 'Invoice', render: (row) => row.invoice_no || '—' },
    { key: 'party_name', header: 'Party', render: (row) => row.party_name || '—' },
    { key: 'phone', header: 'Phone', mobileHidden: true, render: (row) => row.phone || '—' },
    {
      key: 'message',
      header: 'Message',
      render: (row) => <span className="muted line-clamp-1 text-xs">{row.message}</span>,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (row) => (
        <Button size="icon" variant="ghost" title="Delete" onClick={() => setToDelete(row)}>
          <Trash2 className="size-4 text-danger" />
        </Button>
      ),
    },
  ];

  const summary = log.data?.summary;

  return (
    <div className="space-y-4">
      <PageHeader
        title="WhatsApp bills"
        subtitle="Share bills and reminders over WhatsApp."
        icon={MessageCircle}
        actions={
          <Button icon={Send} onClick={() => setOpen(true)}>
            Send bill
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard label="Messages" value={String(summary?.sent ?? 0)} icon={MessageCircle} />
        <StatCard label="Today" value={String(summary?.today ?? 0)} icon={MessageCircle} tone="text-ok" />
      </div>

      <DataTable
        columns={columns}
        rows={log.data?.items ?? []}
        rowKey={(row) => row.id}
        empty={
          log.isLoading ? (
            <EmptyState icon={MessageCircle} title="Loading messages…" />
          ) : (
            <EmptyState icon={MessageCircle} title="No messages yet" description="Send a bill link to a customer." />
          )
        }
      />

      {open && <ComposeModal onClose={() => setOpen(false)} />}
      <ConfirmDialog
        open={!!toDelete}
        title="Remove log entry?"
        message="This only removes the record from the log."
        confirmLabel="Remove"
        loading={remove.isPending}
        onConfirm={() => toDelete && remove.mutate(toDelete.id)}
        onClose={() => setToDelete(null)}
      />
    </div>
  );
}

function ComposeModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [invoiceNo, setInvoiceNo] = useState('');
  const [phone, setPhone] = useState('');
  const [partyName, setPartyName] = useState('');
  const [message, setMessage] = useState('');

  const save = useMutation({
    mutationFn: () =>
      apiPost<{ wa_url: string | null; message: string }>('/whatsapp', { invoice_no: invoiceNo, phone, party_name: partyName, message }),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ['whatsapp'] });
      toast.notify('Message logged', 'success');
      if (data.wa_url) window.open(data.wa_url, '_blank');
      onClose();
    },
    onError: (error: Error) => toast.notify(error.message, 'error'),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title="Send bill on WhatsApp"
      description="Enter an invoice number to auto-write the message."
      footer={
        <>
          <Button variant="subtle" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={save.isPending} disabled={!invoiceNo && !message} onClick={() => save.mutate()}>
            Send & log
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="Invoice no.">
          <Input value={invoiceNo} onChange={(event) => setInvoiceNo(event.target.value)} placeholder="S-1001" autoFocus />
        </FormField>
        <FormField label="Phone">
          <Input value={phone} onChange={(event) => setPhone(event.target.value)} inputMode="tel" placeholder="98765 43210" />
        </FormField>
        <FormField label="Party name" className="sm:col-span-2">
          <Input value={partyName} onChange={(event) => setPartyName(event.target.value)} placeholder="Optional" />
        </FormField>
        <FormField label="Message (optional)" className="sm:col-span-2" hint="Leave blank to auto-generate from the invoice.">
          <Textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Namaste…" />
        </FormField>
      </div>
    </Modal>
  );
}
