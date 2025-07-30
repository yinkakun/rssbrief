import { ThreeDotsScale } from 'react-svg-spinners';

interface SpinnerProps {
  size?: number;
  className?: string;
  color?: 'white' | 'black';
}

const colorMap = {
  white: '#fff',
  black: '#000',
};

export const Spinner = ({ className, size = 20, color }: SpinnerProps) => {
  return <ThreeDotsScale width={size} height={size} color={color ? colorMap[color] : '#fff'} className={className} />;
};
