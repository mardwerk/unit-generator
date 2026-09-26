import { ChevronDown, Download, FileJson, FileText } from 'lucide-react';
import { Button } from '../../ui/button.js';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../ui/dropdown-menu.js';

/** Downloads of the open unit: JSON (the CLI reads it), Markdown, and optionally the session. */
export function ExportMenu({
  disabled,
  onJson,
  onMarkdown,
  onSession,
}: {
  disabled?: boolean;
  onJson: () => void;
  onMarkdown?: () => void;
  onSession?: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button id="export-menu" variant="ghost" size="xs" disabled={disabled}>
          <Download /> Export <ChevronDown className="size-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem onSelect={onJson}>
          <FileJson /> JSON
        </DropdownMenuItem>
        {onMarkdown && (
          <DropdownMenuItem onSelect={onMarkdown}>
            <FileText /> Markdown
          </DropdownMenuItem>
        )}
        {onSession && (
          <DropdownMenuItem onSelect={onSession}>
            <Download /> Whole session
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
