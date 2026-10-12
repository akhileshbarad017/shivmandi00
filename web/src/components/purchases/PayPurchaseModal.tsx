import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { FormField, Input, Select } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { offlineWrite } from '@/lib/offline/outbox';
import { formatINR } from '@/lib/format';
import type { PurchaseListItem } from '@/lib/types';

interface PayPurchaseModalProps {
  open: boolean;
  onClose: () => void;
  bill: PurchaseListItem | null;
}

export function PayPurchaseModal({ open, onClose, bill }: PayPurchaseModalProps) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState('Cash');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!open) return;
    setAmount(bill ? String(bill.balance_due || '') : '');
    setMode('Cash');
    setNotes('');
  }, [open, bill]);

  const save = useMutation({
    mutationFn: () =>
      offlineWrite({
        method: 'POST',
        path: `/purchases/${bill?.bill_no}/pay`,
        label: `Supplier payment · ${bill?.supplier_name ?? ''}`,
        body: {
          amount: Number(amount),
          mode,
          notes,
        },
      }),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['purchases'] });
      void queryClient.invalidateQueries({ queryKey: ['parties'] });
      toast.notify(result.queued ? 'Saved offline — will sync when online' : 'Payment recorded', 'success');
      onClose();
    },
    onError: (error: Error) => toast.notify(error.message, 'error'),
  });

  if (!bill) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Pay supplier"
      description={`${bill.bill_no} · ${bill.supplier_name} · balance ${formatINR(bill.balance_due)}`}
      footer={
        <>
          <Button variant="subtle" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={save.isPending}
            disabled={!Number(amount) || Number(amount) <= 0}
            onClick={() => save.mutate()}
          >
            Save payment
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="Amount (₹)">
          <Input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" autoFocus />
        </FormField>
        <FormField label="Mode">
          <Select value={mode} onChange={(event) => setMode(event.target.value)}>
            <option>Cash</option>
            <option>UPI</option>
            <option>Bank</option>
            <option>Cheque</option>
          </Select>
        </FormField>
        <FormField label="Notes" className="sm:col-span-2">
          <Input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional" />
        </FormField>
      </div>
    </Modal>
  );
}
