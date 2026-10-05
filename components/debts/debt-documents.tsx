"use client";
import { Download, ExternalLink, FileText, ImageIcon, Paperclip, Pencil, Trash2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { deleteDocumentAction, updateDocumentAction, uploadDocumentAction } from "@/app/(app)/debts/[id]/document-actions";
import { EmptyState } from "@/components/finance/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input, NativeSelect } from "@/components/ui/input";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { DOCUMENT_TYPE_LABELS } from "@/lib/constants/debts";
import { MAX_DOCUMENT_BYTES } from "@/lib/documents/files";
import { formatLocalDate } from "@/lib/finance/dates";
import { formatMoney } from "@/lib/finance/money";
import type { DocumentDTO } from "@/lib/services/documents";
import { cn } from "@/lib/utils/cn";
import { toastActionError } from "@/lib/utils/action-toast";

type DocType = keyof typeof DOCUMENT_TYPE_LABELS;
export type PaymentOption = { id: string; paymentDate: string; amount: string; isReversed: boolean };

const TYPES = Object.entries(DOCUMENT_TYPE_LABELS) as [DocType, string][];
const ACCEPT = "application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} МБ`;
}

function paymentText(p: PaymentOption, currency: string) {
  return `${formatLocalDate(p.paymentDate)} · ${formatMoney(p.amount, currency)}${p.isReversed ? " (отменён)" : ""}`;
}

function UploadForm({ debtId, currency, payments, initialPaymentId }: { debtId: string; currency: string; payments: PaymentOption[]; initialPaymentId?: string }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [type, setType] = useState<DocType>(initialPaymentId ? "PAYMENT_RECEIPT" : "LOAN_AGREEMENT");
  const [paymentId, setPaymentId] = useState(initialPaymentId ?? "");
  const [name, setName] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dragging, setDragging] = useState(false);
  const [pending, startTransition] = useTransition();

  const choose = (f: File | undefined) => {
    setErrors({});
    if (!f) return;
    if (f.size > MAX_DOCUMENT_BYTES) return setErrors({ file: "Файл должен быть не больше 10 МБ." });
    setFile(f);
  };

  const submit = () =>
    startTransition(async () => {
      if (!file) return setErrors({ file: "Выберите файл PDF, JPG или PNG." });
      const form = new FormData();
      form.set("file", file);
      form.set("debtId", debtId);
      form.set("type", type);
      if (name.trim()) form.set("name", name.trim());
      if (paymentId) form.set("debtPaymentId", paymentId);
      const result = await uploadDocumentAction(form);
      if (!result.ok) return setErrors({ ...(result.fieldErrors ?? {}), form: result.error });
      toast.success("Документ загружен");
      setFile(null);
      setName("");
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    });

  return (
    <Card className="p-5">
      <form
        noValidate
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label
          htmlFor="doc-file"
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            choose(e.dataTransfer.files[0]);
          }}
          className={cn(
            "grid cursor-pointer place-items-center gap-1 rounded-lg border border-dashed px-4 py-6 text-center text-sm transition-colors hover:bg-muted/60 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
            dragging && "border-primary bg-primary-subtle",
            errors.file && "border-danger",
          )}
        >
          <Upload className="size-5 text-muted-foreground" aria-hidden />
          {file ? (
            <span className="font-medium break-all">
              {file.name} <span className="font-normal text-muted-foreground">· {formatSize(file.size)}</span>
            </span>
          ) : (
            <span>
              <span className="font-medium text-primary">Выберите файл</span> или перетащите его сюда
            </span>
          )}
          <span className="text-[13px] text-muted-foreground">PDF, JPG или PNG, до 10 МБ. Открыть его сможете только вы.</span>
          <input
            ref={fileRef}
            id="doc-file"
            type="file"
            accept={ACCEPT}
            className="sr-only"
            aria-describedby={errors.file ? "doc-file-error" : undefined}
            onChange={(e) => choose(e.target.files?.[0])}
          />
        </label>
        {errors.file ? (
          <p id="doc-file-error" role="alert" className="-mt-2 text-[13px] text-danger">
            {errors.file}
          </p>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2 sm:items-start">
          <Field label="Тип" htmlFor="doc-type" error={errors.type}>
            <NativeSelect id="doc-type" value={type} onChange={(e) => setType(e.target.value as DocType)}>
              {TYPES.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Название" htmlFor="doc-name" error={errors.name} hint="Необязательно. По умолчанию — имя файла.">
            <Input id="doc-name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder={file ? file.name.replace(/\.[^.]+$/, "") : "например, Подписанный договор"} />
          </Field>
        </div>
        {payments.length ? (
          <Field label="К платежу" htmlFor="doc-payment" error={errors.debtPaymentId} hint="Привяжите чек к платежу, который он подтверждает.">
            <NativeSelect id="doc-payment" value={paymentId} onChange={(e) => setPaymentId(e.target.value)}>
              <option value="">Без привязки к платежу</option>
              {payments.map((p) => (
                <option key={p.id} value={p.id}>
                  {paymentText(p, currency)}
                </option>
              ))}
            </NativeSelect>
          </Field>
        ) : null}
        {errors.form && !errors.file ? (
          <p role="alert" className="text-sm text-danger">
            {errors.form}
          </p>
        ) : null}
        <div>
          <Button type="submit" disabled={pending}>
            <Upload /> {pending ? "Загружаем…" : "Загрузить"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function EditDialog({ doc, currency, payments, onClose }: { doc: DocumentDTO; currency: string; payments: PaymentOption[]; onClose: () => void }) {
  const router = useRouter();
  const [v, setV] = useState({ name: doc.name, type: doc.type as DocType, debtPaymentId: doc.payment?.id ?? "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const save = () =>
    startTransition(async () => {
      const result = await updateDocumentAction({ id: doc.id, ...v });
      if (!result.ok) return setErrors({ ...(result.fieldErrors ?? {}), form: result.error });
      toast.success("Документ обновлён");
      onClose();
      router.refresh();
    });
  return (
    <ResponsiveDialog open onOpenChange={(open) => !open && onClose()} title="Изменить документ">
      <form
        noValidate
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Field label="Название" htmlFor="edit-doc-name" error={errors.name}>
          <Input id="edit-doc-name" value={v.name} maxLength={120} onChange={(e) => setV({ ...v, name: e.target.value })} autoFocus />
        </Field>
        <Field label="Тип" htmlFor="edit-doc-type">
          <NativeSelect id="edit-doc-type" value={v.type} onChange={(e) => setV({ ...v, type: e.target.value as DocType })}>
            {TYPES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </NativeSelect>
        </Field>
        {payments.length ? (
          <Field label="К платежу" htmlFor="edit-doc-payment" error={errors.debtPaymentId}>
            <NativeSelect id="edit-doc-payment" value={v.debtPaymentId} onChange={(e) => setV({ ...v, debtPaymentId: e.target.value })}>
              <option value="">Без привязки к платежу</option>
              {payments.map((p) => (
                <option key={p.id} value={p.id}>
                  {paymentText(p, currency)}
                </option>
              ))}
            </NativeSelect>
          </Field>
        ) : null}
        {errors.form ? (
          <p role="alert" className="text-sm text-danger">
            {errors.form}
          </p>
        ) : null}
        <div className="flex gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Сохраняем…" : "Сохранить"}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            Отмена
          </Button>
        </div>
      </form>
    </ResponsiveDialog>
  );
}

function DocumentRow({ doc, currency, onEdit, onDelete }: { doc: DocumentDTO; currency: string; onEdit: () => void; onDelete: () => void }) {
  const isImage = doc.mimeType.startsWith("image/");
  const href = `/api/documents/${doc.id}`;
  return (
    <li className="flex flex-wrap items-center gap-3 p-4 sm:flex-nowrap">
      <a href={href} target="_blank" rel="noopener" className="shrink-0" aria-label={`Открыть «${doc.name}»`}>
        {isImage ? (
          // eslint-disable-next-line @next/next/no-img-element -- private, session-authenticated file; next/image would cache it
          <img src={href} alt="" loading="lazy" className="size-12 rounded-md border object-cover" />
        ) : (
          <span className="grid size-12 place-items-center rounded-md border bg-muted text-muted-foreground">
            <FileText className="size-5" aria-hidden />
          </span>
        )}
      </a>
      <div className="grid min-w-0 flex-1 gap-0.5">
        <a href={href} target="_blank" rel="noopener" className="truncate text-sm font-medium hover:underline">
          {doc.name}
        </a>
        <p className="flex flex-wrap items-center gap-x-1.5 text-[13px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            {isImage ? <ImageIcon className="size-3.5" aria-hidden /> : <FileText className="size-3.5" aria-hidden />}
            {doc.mimeType === "application/pdf" ? "PDF" : doc.mimeType === "image/png" ? "PNG" : "JPG"} · {formatSize(doc.size)}
          </span>
          <span>· добавлен {new Date(doc.createdAt).toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" })}</span>
        </p>
        {doc.payment ? (
          <p className="flex items-start gap-1 text-[13px] text-muted-foreground [&>svg]:mt-0.5">
            <Paperclip className="size-3.5 shrink-0" aria-hidden /> Платёж {paymentText(doc.payment, currency)}
          </p>
        ) : null}
      </div>
      <div className="flex w-full justify-end gap-1 sm:w-auto">
        <Button asChild variant="ghost" size="icon-sm" aria-label={`Открыть «${doc.name}»`} title="Открыть">
          <a href={href} target="_blank" rel="noopener">
            <ExternalLink />
          </a>
        </Button>
        <Button asChild variant="ghost" size="icon-sm" aria-label={`Скачать «${doc.name}»`} title="Скачать">
          <a href={`${href}?download=1`}>
            <Download />
          </a>
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label={`Изменить «${doc.name}»`} title="Изменить" onClick={onEdit}>
          <Pencil />
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label={`Удалить «${doc.name}»`} title="Удалить" onClick={onDelete}>
          <Trash2 />
        </Button>
      </div>
    </li>
  );
}

export function DebtDocuments({
  debtId,
  currency,
  documents,
  payments,
  initialPaymentId,
}: {
  debtId: string;
  currency: string;
  documents: DocumentDTO[];
  payments: PaymentOption[];
  initialPaymentId?: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<DocumentDTO | null>(null);
  const [deleting, setDeleting] = useState<DocumentDTO | null>(null);
  const [pending, startTransition] = useTransition();
  const groups = TYPES.map(([type, label]) => ({ type, label, docs: documents.filter((d) => d.type === type) })).filter((g) => g.docs.length);

  const remove = () =>
    startTransition(async () => {
      if (!deleting) return;
      const result = await deleteDocumentAction(deleting.id);
      if (!result.ok) return void toastActionError(result);
      toast.success("Документ удалён");
      setDeleting(null);
      router.refresh();
    });

  return (
    <div className="grid gap-6">
      <UploadForm key={initialPaymentId ?? "new"} debtId={debtId} currency={currency} payments={payments} initialPaymentId={initialPaymentId} />

      {groups.length === 0 ? (
        <EmptyState icon={FileText} title="Документов пока нет" description="Храните кредитный договор, график банка и чеки об оплате рядом с долгом." />
      ) : (
        groups.map((g) => (
          <section key={g.type} className="grid gap-2">
            <h2 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              {g.label} <Badge>{g.docs.length}</Badge>
            </h2>
            <Card>
              <ul className="divide-y">
                {g.docs.map((d) => (
                  <DocumentRow key={d.id} doc={d} currency={currency} onEdit={() => setEditing(d)} onDelete={() => setDeleting(d)} />
                ))}
              </ul>
            </Card>
          </section>
        ))
      )}

      {editing ? <EditDialog doc={editing} currency={currency} payments={payments} onClose={() => setEditing(null)} /> : null}

      <ResponsiveDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Удалить документ?"
        description="Файл удалится навсегда. Долг и платежи не изменятся."
      >
        <div className="flex gap-2">
          <Button variant="destructive" onClick={remove} disabled={pending}>
            {pending ? "Удаляем…" : "Удалить"}
          </Button>
          <Button variant="ghost" onClick={() => setDeleting(null)}>
            Отмена
          </Button>
        </div>
      </ResponsiveDialog>
    </div>
  );
}
