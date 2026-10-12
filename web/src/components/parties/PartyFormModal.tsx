import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { FormField, Input, Select } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { apiPatch, apiPost } from '@/lib/api';
import { PARTY_TYPE_LABEL, type Party, type PartyType } from '@/lib/types';

interface PartyFormModalProps {
  open: boolean;
  onClose: () => void;
  party?: Party | null;
  defaultType?: PartyType;
}

const EMPTY = { name: '', type: 'buyer' as PartyType, phone: '', gstin: '', address: '' };

export function PartyFormModal({ open, onClose, party, defaultType }: PartyFormModalProps) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState(EMPTY);

  useEffect(() => {
    if (!open) return;
    setForm({
      name: party?.name ?? '',
      type: party?.type ?? defaultType ?? 'buyer',
      phone: party?.phone ?? '',
      gstin: party?.gstin ?? '',
      address: party?.address ?? '',
    });
  }, [open, party, defaultType]);

  const save = useMutation({
    mutationFn: () => (party ? apiPatch(`/parties/${party.id}`, form) : apiPost('/parties', form)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['parties'] });
      toast.notify(party ? 'Party updated' : 'Party added', 'success');
      onClose();
    },
    onError: (error: Error) => toast.notify(error.message, 'error'),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={party ? 'Edit party' : 'Add party'}
      description="Farmers, buyers, suppliers and commission agents."
      footer={
        <>
          <Button variant="subtle" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={save.isPending}
            disabled={form.name.trim().length === 0}
            onClick={() => save.mutate()}
          >
            {party ? 'Save changes' : 'Add party'}
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="Name" className="sm:col-span-2">
          <Input
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            placeholder="e.g. Rajesh Kisan Patil"
            autoFocus
          />
        </FormField>
        <FormField label="Type">
          <Select
            value={form.type}
            onChange={(event) => setForm({ ...form, type: event.target.value as PartyType })}
          >
            {(Object.keys(PARTY_TYPE_LABEL) as PartyType[]).map((type) => (
              <option key={type} value={type}>
                {PARTY_TYPE_LABEL[type]}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Phone">
          <Input
            value={form.phone}
            onChange={(event) => setForm({ ...form, phone: event.target.value })}
            placeholder="Mobile number"
            inputMode="tel"
          />
        </FormField>
        <FormField label="GSTIN">
          <Input
            value={form.gstin}
            onChange={(event) => setForm({ ...form, gstin: event.target.value })}
            placeholder="Optional"
          />
        </FormField>
        <FormField label="Village / City">
          <Input
            value={form.address}
            onChange={(event) => setForm({ ...form, address: event.target.value })}
            placeholder="Location"
          />
        </FormField>
      </div>
    </Modal>
  );
}
