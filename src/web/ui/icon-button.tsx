import { Button, type ButtonProps } from './button.js';
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip.js';

/** An icon-only button; its label is the accessible name and the tooltip. */
export function IconButton({
  label,
  variant = 'ghost',
  size = 'icon',
  ...props
}: ButtonProps & { label: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant={variant} size={size} aria-label={label} {...props} />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
