import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { FormField, Input, Select } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { apiPatch, apiPost } from '@/lib/api';
import type { ProductStock } from '@/lib/types';

interface ProductFormModalProps {
  open: boolean;
  onClose: () => void;
  product?: ProductStock | null;
}

const CATEGORIES = ['Vegetables', 'Fruits', 'Spices', 'Grains', 'Other'];
const UNITS = ['kg', 'quintal', 'dozen', 'bag', 'crate', 'piece'];

interface FormState {
  name: string;
  category: string;
  unit: string;
  emoji: string;
}

const EMPTY: FormState = { name: '', category: 'Vegetables', unit: 'kg', emoji: '' };

export function ProductFormModal({ open, onClose, product }: ProductFormModalProps) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState<FormState>(EMPTY);

  useEffect(() => {
    if (!open) return;
    setForm(
      product
        ? {
            name: product.name,
            category: product.category,
            unit: product.unit,
            emoji: product.emoji ?? '',
          }
        : EMPTY,
    );
  }, [open, product]);

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        name: form.name,
        category: form.category,
        unit: form.unit,
        emoji: form.emoji,
      };
      return product ? apiPatch(`/products/${product.id}`, payload) : apiPost('/products', payload);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.notify(product ? 'Product updated' : 'Product added', 'success');
      onClose();
    },
    onError: (error: Error) => toast.notify(error.message, 'error'),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={product ? 'Edit product' : 'Add product'}
      description="Commodity master."
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
            {product ? 'Save changes' : 'Add product'}
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="Name" className="sm:col-span-2">
          <Input
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            placeholder="e.g. Tomato"
            autoFocus
          />
        </FormField>
        <FormField label="Category">
          <Select
            value={form.category}
            onChange={(event) => setForm({ ...form, category: event.target.value })}
          >
            {CATEGORIES.map((category) => (
              <option key={category}>{category}</option>
            ))}
          </Select>
        </FormField>
        <FormField label="Unit">
          <Select value={form.unit} onChange={(event) => setForm({ ...form, unit: event.target.value })}>
            {UNITS.map((unit) => (
              <option key={unit}>{unit}</option>
            ))}
          </Select>
        </FormField>
        <FormField label="Emoji / icon">
          <Input
            value={form.emoji}
            onChange={(event) => setForm({ ...form, emoji: event.target.value })}
            placeholder="🍅"
          />
        </FormField>
      </div>
    </Modal>
  );
}
