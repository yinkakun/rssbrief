import { Button } from '@/ui/button';
import { toast as sonnerToast } from 'sonner';
import { Toaster as Sonner, type ToasterProps } from 'sonner';

export const Toaster = ({ ...props }: ToasterProps) => {
  return <Sonner className="toaster group" position="bottom-right" {...props} />;
};

interface ToastProps {
  title: string;
  description?: string;
  id: string | number;
}

function Toast({ title, id, description }: ToastProps) {
  return (
    <div className="xw-full flex w-md items-center rounded-2xl bg-white p-4 ring-1 ring-black/5">
      <div className="w-full">
        <p className="text-sm font-medium text-gray-900">{title}</p>
        {description && <p className="mt-1 text-xs text-gray-500">{description}</p>}
      </div>
      <div className="ml-5 shrink-0">
        <Button variant="default" className="text-xs" size="sm" onClick={() => sonnerToast.dismiss(id)}>
          Dismiss
        </Button>
      </div>
    </div>
  );
}

export function toast(toast: Omit<ToastProps, 'id'>) {
  return sonnerToast.custom((id) => <Toast id={id} title={toast.title} />);
}
