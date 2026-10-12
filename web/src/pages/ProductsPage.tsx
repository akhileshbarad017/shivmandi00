import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Carrot, Layers, Pencil, Plus, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { ProductFormModal } from '@/components/products/ProductFormModal';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { SearchInput } from '@/components/ui/SearchInput';
import { StatCard } from '@/components/ui/StatCard';
import { useToast } from '@/components/ui/Toast';
import { apiDelete, apiGet } from '@/lib/api';
import { useDebounce } from '@/lib/useDebounce';
import type { ProductListResponse, ProductStock } from '@/lib/types';

export default function ProductsPage() {
  const queryClient = useQueryClient();
  const toast = useToast();

  const [search, setSearch] = useState('');
  const q = useDebounce(search, 300).toLowerCase();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ProductStock | null>(null);
  const [toDelete, setToDelete] = useState<ProductStock | null>(null);

  const products = useQuery({
    queryKey: ['products'],
    queryFn: () => apiGet<ProductListResponse>('/products'),
  });

  const remove = useMutation({
    mutationFn: (id: number) => apiDelete(`/products/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.notify('Product removed', 'success');
      setToDelete(null);
    },
    onError: (error: Error) => toast.notify(error.message, 'error'),
  });

  const items = useMemo(() => {
    const all = products.data?.items ?? [];
    if (!q) return all;
    return all.filter((item) => `${item.name} ${item.code} ${item.category}`.toLowerCase().includes(q));
  }, [products.data?.items, q]);

  const categories = new Set((products.data?.items ?? []).map((item) => item.category));

  const columns: Column<ProductStock>[] = [
    {
      key: 'name',
      header: 'Product',
      render: (product) => (
        <div className="flex items-center gap-2">
          <span className="text-lg">{product.emoji || '🧺'}</span>
          <div>
            <div className="font-medium">{product.name}</div>
            <div className="muted text-xs">{product.code}</div>
          </div>
        </div>
      ),
    },
    { key: 'category', header: 'Category' },
    { key: 'unit', header: 'Unit' },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (product) => (
        <div className="flex justify-end gap-1">
          <Button
            size="icon"
            variant="ghost"
            title="Edit"
            onClick={() => {
              setEditing(product);
              setFormOpen(true);
            }}
          >
            <Pencil className="size-4" />
          </Button>
          <Button size="icon" variant="ghost" title="Remove" onClick={() => setToDelete(product)}>
            <Trash2 className="size-4 text-danger" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Products"
        subtitle="Commodity master."
        icon={Carrot}
        actions={
          <Button
            icon={Plus}
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            Add product
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Products" value={String(items.length)} icon={Carrot} />
        <StatCard label="Categories" value={String(categories.size)} icon={Layers} tone="text-cyan" />
      </div>

      <SearchInput value={search} onChange={setSearch} placeholder="Search products…" className="sm:max-w-sm" />

      <DataTable
        columns={columns}
        rows={items}
        rowKey={(product) => product.id}
        empty={
          products.isLoading ? (
            <EmptyState icon={Carrot} title="Loading products…" />
          ) : (
            <EmptyState icon={Carrot} title="No products" description="Add your first commodity." />
          )
        }
      />

      <ProductFormModal open={formOpen} onClose={() => setFormOpen(false)} product={editing} />
      <ConfirmDialog
        open={!!toDelete}
        title="Remove product?"
        message={`${toDelete?.name ?? ''} will be hidden from pickers.`}
        confirmLabel="Remove"
        loading={remove.isPending}
        onConfirm={() => toDelete && remove.mutate(toDelete.id)}
        onClose={() => setToDelete(null)}
      />
    </div>
  );
}
