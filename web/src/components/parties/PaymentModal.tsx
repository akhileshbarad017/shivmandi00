import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { FormField, Input, Select } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { offlineWrite } from '@/lib/offline/outbox';
import type { Party } from '@/lib/types';

interface PaymentModalProps {
  open: boolean;
  onClose: () => void;
  party: Party | null;
}

export function PaymentModal({ open, onClose, party }: PaymentModalProps) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const isBuyer = party?.type === 'buyer';
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState('Cash');
  const [direction, setDirection] = useState<'in' | 'out'>('in');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!open) return;
    setAmount('');
    setMode('Cash');
    setDirection(isBuyer ? 'in' : 'out');
    setNotes('');
  }, [open, isBuyer]);

  const save = useMutation({
    mutationFn: () =>
      offlineWrite({
        method: 'POST',
        path: `/parties/${party?.id}/payment`,
        label: `${direction === 'in' ? 'Receipt' : 'Payment'} · ${party?.name ?? ''}`,
        body: {
          amount: Number(amount),
          mode,
          direction,
          notes,
        },
      }),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['parties'] });
      if (party) void queryClient.invalidateQueries({ queryKey: ['ledger', party.id] });
      toast.notify(
        result.queued
          ? 'Saved offline — will sync when online'
          : direction === 'in'
            ? 'Payment received'
            : 'Payment recorded',
        'success',
      );
      onClose();
    },
    onError: (error: Error) => toast.notify(error.message, 'error'),
  });

  if (!party) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={direction === 'in' ? 'Receive payment' : 'Pay party'}
      description={`${party.name} · ${
        party.balance > 0 ? `outstanding ₹${party.balance}` : 'no outstanding'
      }`}
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
            Save entry
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="Direction">
          <Select
            value={direction}
            onChange={(event) => setDirection(event.target.value as 'in' | 'out')}
          >
            <option value="in">Money in (receipt)</option>
            <option value="out">Money out (payout)</option>
          </Select>
        </FormField>
        <FormField label="Amount (₹)">
          <Input
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            inputMode="decimal"
            placeholder="0"
            autoFocus
          />
        </FormField>
        <FormField label="Mode">
          <Select value={mode} onChange={(event) => setMode(event.target.value)}>
            <option>Cash</option>
            <option>UPI</option>
            <option>Bank</option>
            <option>Cheque</option>
          </Select>
        </FormField>
        <FormField label="Notes">
          <Input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional" />
        </FormField>
      </div>
    </Modal>
  );
}
