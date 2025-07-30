import React from 'react';
import { cn } from '@/lib/utils';
import { useResizeObserver } from 'usehooks-ts';
import { motion, AnimatePresence } from 'motion/react';
import { Provider, atom, useAtomValue, useSetAtom } from 'jotai';

const totalStepsAtom = atom<number>(0);
const activeStepIndexAtom = atom<number>(0);

const prevStepAtom = atom(null, (get, set) => {
  const currentStep = get(activeStepIndexAtom);
  if (currentStep > 0) {
    set(activeStepIndexAtom, currentStep - 1);
  }
});

const nextStepAtom = atom(null, (get, set) => {
  const currentStep = get(activeStepIndexAtom);
  if (currentStep < get(totalStepsAtom) - 1) {
    set(activeStepIndexAtom, currentStep + 1);
  }
});

interface StepWrapperProps {
  children: React.ReactNode;
}

const StepWrapper = ({ children, ...stepProps }: StepWrapperProps) => {
  return React.Children.map(children, (child) => {
    if (React.isValidElement(child)) {
      return React.cloneElement(child, stepProps);
    }
    return child;
  });
};

interface StepperProps {
  className?: string;
  children: React.ReactNode;
}

const RootStepper = ({ children, className }: StepperProps) => {
  const setTotalSteps = useSetAtom(totalStepsAtom);
  const activeStepIndex = useAtomValue(activeStepIndexAtom);
  const activeStep = React.Children.toArray(children)[activeStepIndex];

  const ref = React.useRef<HTMLDivElement>(null);
  const { height = 0 } = useResizeObserver({
    ref: ref as React.RefObject<HTMLDivElement>,
  });

  setTotalSteps(React.Children.count(children));

  return (
    <motion.div
      layout
      key={activeStepIndex}
      className={cn('w-full', className)}
      style={{ height: height || 'auto' }}
      transition={{ type: 'spring', stiffness: 300, damping: 30, duration: 0.2 }}
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={activeStepIndex}
          exit={{ opacity: 0.5 }}
          animate={{ opacity: 1 }}
          initial={{ opacity: 0.5 }}
          transition={{ duration: 0.2 }}
        >
          <div ref={ref}>
            <StepWrapper>{activeStep}</StepWrapper>
          </div>
        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
};

export const Stepper = ({ children, className }: StepperProps) => {
  return (
    <Provider>
      <RootStepper className={className}>{children}</RootStepper>
    </Provider>
  );
};

export const useStepper = () => {
  const nextStep = useSetAtom(nextStepAtom);
  const prevStep = useSetAtom(prevStepAtom);
  const totalSteps = useAtomValue(totalStepsAtom);
  const activeStepIndex = useAtomValue(activeStepIndexAtom);
  return { totalSteps, activeStepIndex, nextStep, prevStep };
};
