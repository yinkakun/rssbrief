import React from 'react';
import { ThreeDotsScale } from 'react-svg-spinners';
import { useConvexAuth } from '@convex-dev/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useNavigate, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/_auth')({
  component: RouteComponent,
});

function RouteComponent() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading } = useConvexAuth();

  React.useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate({ to: '/login' });
    }
  }, [isAuthenticated, isLoading, navigate]);

  if (isLoading) {
    return (
      <div className="flex h-dvh items-center justify-center bg-white text-slate-500">
        <ThreeDotsScale width={50} height={50} />
      </div>
    );
  }

  return <Outlet />;
}
