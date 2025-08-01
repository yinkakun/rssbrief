import { Button } from '@/ui/button';
import { toast as sonnerToast } from 'sonner';
import { Toaster as Sonner, type ToasterProps } from 'sonner';

export const Toaster = ({ ...props }: ToasterProps) => {
  return <Sonner className="toaster group" position="top-center" {...props} />;
};

interface ToastProps {
  title: string;
  id: string | number;
}

function Toast({ title, id }: ToastProps) {
  return (
    <div className="flex w-full items-center rounded-2xl bg-white p-4 ring-1 ring-black/5 md:max-w-[364px]">
      <div className="w-full">
        <p className="text-sm font-medium text-gray-900">{title}</p>
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
